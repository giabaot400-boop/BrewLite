import { backendAuthUrl } from '@/lib/server/auth/config';
import { clearSessionCookie, readSessionToken } from '@/lib/server/auth/cookie';
import { backendFetch, backendUnavailable, forwardError, errorResponse } from '@/lib/server/auth/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const token = await readSessionToken();
  if (!token) return errorResponse(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập.');
  try {
    const upstream = await backendFetch(backendAuthUrl('me'), { method: 'GET', headers: { Authorization: `Bearer ${token}` } });
    if (!upstream.ok) {
      if (upstream.status === 401) await clearSessionCookie();
      return forwardError(upstream);
    }
    const data = await upstream.json() as { user?: { id?: unknown; email?: unknown }; expiresAt?: unknown };
    if (!data.user || typeof data.user.id !== 'string' || typeof data.user.email !== 'string' || (typeof data.expiresAt !== 'string' && typeof data.expiresAt !== 'number')) {
      return errorResponse(502, 'UPSTREAM_UNAVAILABLE', 'Phản hồi phiên đăng nhập không hợp lệ.');
    }
    return Response.json({ user: data.user, expiresAt: data.expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // A network failure must not clear the cookie or imply the user signed out.
    return backendUnavailable();
  }
}
