import {
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { compare, hash } from 'bcrypt';
import { PrismaService } from '../database/prisma.service.js';

type PublicUser = { id: string; email: string };
type JwtClaims = { sub: string; sid: string; iat: number; exp: number; iss: 'brewlite-api'; aud: 'brewlite-web' };
type AuthResult = { token: string; user: PublicUser; expiresAt: string };

const SESSION_TTL_SECONDS = 60 * 60;
const BCRYPT_ROUNDS = 12;
const EMAIL_MAX_LENGTH = 254;

function apiError(status: number, code: string, message: string, fieldErrors: Record<string, string[]> = {}): HttpException {
  return new HttpException({ error: { code, message, fieldErrors } }, status);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function validateEmail(value: string): string | null {
  const email = normalizeEmail(value);
  if (!email) return 'Vui lòng nhập email.';
  if (email.length > EMAIL_MAX_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Email không đúng định dạng.';
  }
  return null;
}

function validatePassword(value: string): string | null {
  if (!value) return 'Vui lòng nhập mật khẩu.';
  if (value.includes('\u0000') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) {
    return 'Mật khẩu chứa ký tự không được hỗ trợ.';
  }
  if (Array.from(value).length < 15) return 'Mật khẩu cần ít nhất 15 ký tự.';
  if (Buffer.byteLength(value, 'utf8') > 72) return 'Mật khẩu không được vượt quá 72 byte (UTF-8).';
  return null;
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private get jwtSecret(): string {
    const secret = process.env.AUTH_JWT_SECRET;
    if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
      throw new InternalServerErrorException('AUTH_JWT_SECRET phải có ít nhất 32 byte ngẫu nhiên.');
    }
    return secret;
  }

  private sign(claims: JwtClaims): string {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const payload = base64url(JSON.stringify(claims));
    const input = `${header}.${payload}`;
    const signature = createHmac('sha256', this.jwtSecret).update(input).digest('base64url');
    return `${input}.${signature}`;
  }

  private verify(token: string, allowExpired = false): JwtClaims {
    const parts = token.split('.');
    if (parts.length !== 3) throw new UnauthorizedException({ error: { code: 'SESSION_INVALID', message: 'Phiên đăng nhập không hợp lệ.', fieldErrors: {} } });
    const [header, payload, signature] = parts;
    const expected = createHmac('sha256', this.jwtSecret).update(`${header}.${payload}`).digest();
    let actual: Buffer;
    try { actual = Buffer.from(signature, 'base64url'); } catch { actual = Buffer.alloc(0); }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new UnauthorizedException({ error: { code: 'SESSION_INVALID', message: 'Phiên đăng nhập không hợp lệ.', fieldErrors: {} } });
    }
    try {
      const decodedHeader = JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: string; typ?: string };
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as JwtClaims;
      if (decodedHeader.alg !== 'HS256' || decodedHeader.typ !== 'JWT' || typeof claims.sub !== 'string' || typeof claims.sid !== 'string' || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iss !== 'brewlite-api' || claims.aud !== 'brewlite-web' || claims.exp !== claims.iat + SESSION_TTL_SECONDS) throw new Error('claims');
      if (!allowExpired && claims.exp <= Math.floor(Date.now() / 1000)) {
        throw new UnauthorizedException({ error: { code: 'SESSION_EXPIRED', message: 'Phiên đăng nhập đã hết hạn.', fieldErrors: {} } });
      }
      return claims;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new UnauthorizedException({ error: { code: 'SESSION_INVALID', message: 'Phiên đăng nhập không hợp lệ.', fieldErrors: {} } });
    }
  }

  async register(input: unknown): Promise<{ user: PublicUser }> {
    const body = input as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const fieldErrors: Record<string, string[]> = {};
    const emailError = typeof body?.email === 'string' ? validateEmail(body.email) : 'Vui lòng nhập email.';
    const passwordError = typeof body?.password === 'string' ? validatePassword(password) : 'Vui lòng nhập mật khẩu.';
    if (emailError) fieldErrors.email = [emailError];
    if (passwordError) fieldErrors.password = [passwordError];
    if (Object.keys(fieldErrors).length) throw apiError(400, 'VALIDATION_ERROR', 'Dữ liệu đăng ký chưa hợp lệ.', fieldErrors);

    const passwordHash = await hash(password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.user.create({ data: { email, passwordHash }, select: { id: true, email: true } });
      return { user };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw apiError(409, 'EMAIL_ALREADY_EXISTS', 'Email đã được đăng ký.');
      }
      throw error;
    }
  }

  async login(input: unknown): Promise<AuthResult> {
    const body = input as { email?: unknown; password?: unknown } | null;
    const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const fieldErrors: Record<string, string[]> = {};
    const emailError = typeof body?.email === 'string' ? validateEmail(body.email) : 'Vui lòng nhập email.';
    if (emailError) fieldErrors.email = [emailError];
    if (!password) fieldErrors.password = ['Vui lòng nhập mật khẩu.'];
    if (Object.keys(fieldErrors).length) throw apiError(400, 'VALIDATION_ERROR', 'Dữ liệu đăng nhập chưa hợp lệ.', fieldErrors);

    const user = await this.prisma.user.findUnique({ where: { email } });
    const valid = user ? await compare(password, user.passwordHash) : false;
    if (!user || !valid) throw apiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không chính xác.');

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date((now + SESSION_TTL_SECONDS) * 1000);
    const sessionId = randomUUID();
    await this.prisma.authSession.create({ data: { id: sessionId, userId: user.id, expiresAt } });
    const token = this.sign({ sub: user.id, sid: sessionId, iat: now, exp: now + SESSION_TTL_SECONDS, iss: 'brewlite-api', aud: 'brewlite-web' });
    return { token, user: { id: user.id, email: user.email }, expiresAt: expiresAt.toISOString() };
  }

  private async requireActiveSession(authorization?: string) {
    const token = this.bearer(authorization);
    const claims = this.verify(token);

    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    if (!session || session.userId !== claims.sub || session.revokedAt) {
      throw apiError(401, 'SESSION_INVALID', 'Phiên đăng nhập không hợp lệ.');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw apiError(401, 'SESSION_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
    }

    return session;
  }
  async validateSession(authorization?: string): Promise<PublicUser> {
    return (await this.requireActiveSession(authorization)).user;
  }
  async me(authorization?: string): Promise<{ user: PublicUser; expiresAt: string }> {
    const session = await this.requireActiveSession(authorization);
    return { user: session.user, expiresAt: session.expiresAt.toISOString() };
  }

  async logout(authorization?: string): Promise<void> {
    const token = this.bearer(authorization);
    // Expiration is ignored only for revocation; signature and claims are still verified.
    const claims = this.verify(token, true);
    const session = await this.prisma.authSession.findUnique({
      where: { id: claims.sid },
      select: { id: true, userId: true, revokedAt: true },
    });

    if (!session) {
      // P05: a verified token whose session no longer exists is already logged out.
      return;
    }
    if (session.userId !== claims.sub) {
      throw apiError(401, 'SESSION_INVALID', 'Phiên đăng nhập không thuộc tài khoản này.');
    }
    // Repeated logout is idempotent.
    if (session.revokedAt) return;

    const result = await this.prisma.authSession.updateMany({
      where: { id: claims.sid, userId: claims.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) {
      const latest = await this.prisma.authSession.findUnique({
        where: { id: claims.sid },
        select: { id: true, userId: true, revokedAt: true },
      });
      if (!latest) {
        return;
      }
      if (latest.userId !== claims.sub) {
        throw apiError(401, 'SESSION_INVALID', 'Phiên đăng nhập không thuộc tài khoản này.');
      }
      if (!latest.revokedAt) {
        throw new InternalServerErrorException('Không thể thu hồi phiên đăng nhập.');
      }
    }
  }

  private bearer(value?: string): string {
    const match = value?.match(/^Bearer\s+(.+)$/i);
    if (!match) throw apiError(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập.');
    return match[1];
  }
}
