import { assertSameOriginPost } from '@/lib/server/auth/csrf';
import { backendAuthUrl } from '@/lib/server/auth/config';
import { clearSessionCookie, readSessionToken } from '@/lib/server/auth/cookie';
import { backendFetch } from '@/lib/server/auth/http';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const rejected = assertSameOriginPost(request);
  if (rejected) return rejected;
  const token = await readSessionToken();
  if (!token) {
    await clearSessionCookie();
    return new Response(null, { status: 204, headers: { 'X-BrewLite-Logout-Scope': 'local', 'Cache-Control': 'no-store' } });
  }
  try {
    const upstream = await backendFetch(backendAuthUrl('logout'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    if (upstream.status === 204) {
      await clearSessionCookie();
      return new Response(null, { status: 204, headers: { 'X-BrewLite-Logout-Scope': 'session', 'Cache-Control': 'no-store' } });
    }
    if (upstream.status === 401) {
      await clearSessionCookie();
      return new Response(null, { status: 204, headers: { 'X-BrewLite-Logout-Scope': 'local', 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Chưa thể đăng xuất khỏi máy chủ. Vui lòng thử lại.', fieldErrors: {} } }, { status: upstream.status >= 500 ? 502 : 502, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // Keep cookie: backend failure is not proof that the session was revoked.
    return Response.json({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Chưa thể đăng xuất khỏi máy chủ. Vui lòng thử lại.', fieldErrors: {} } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
