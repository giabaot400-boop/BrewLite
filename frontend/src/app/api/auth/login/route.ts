import { assertSameOriginPost } from '@/lib/server/auth/csrf';
import { backendAuthUrl } from '@/lib/server/auth/config';
import { setSessionCookie } from '@/lib/server/auth/cookie';
import { backendFetch, backendUnavailable, forwardError, errorResponse } from '@/lib/server/auth/http';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const rejected = assertSameOriginPost(request);
  if (rejected) return rejected;
  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse(400, 'VALIDATION_ERROR', 'Dữ liệu gửi lên không hợp lệ.'); }
  try {
    const upstream = await backendFetch(backendAuthUrl('login'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!upstream.ok) return forwardError(upstream);
    const data = await upstream.json() as { token?: unknown; user?: { id?: unknown; email?: unknown }; expiresAt?: unknown };
    if (typeof data.token !== 'string' || !data.token || !data.user || typeof data.user.id !== 'string' || typeof data.user.email !== 'string' || (typeof data.expiresAt !== 'string' && typeof data.expiresAt !== 'number')) {
      return errorResponse(502, 'UPSTREAM_UNAVAILABLE', 'Phản hồi đăng nhập từ máy chủ không hợp lệ.');
    }
    await setSessionCookie(data.token, data.expiresAt);
    // Never expose the bearer JWT to browser JavaScript.
    return Response.json({ user: data.user, expiresAt: data.expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return backendUnavailable();
  }
}
