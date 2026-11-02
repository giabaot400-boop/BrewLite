import { assertSameOriginPost } from '@/lib/server/auth/csrf';
import { backendAuthUrl } from '@/lib/server/auth/config';
import { clearSessionCookie, readSessionToken } from '@/lib/server/auth/cookie';
import { backendFetch, forwardError } from '@/lib/server/auth/http';
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const rejected = assertSameOriginPost(request);
  if (rejected) return rejected;

  const token = await readSessionToken();

  if (!token) {
    await clearSessionCookie();
    return new Response(null, {
      status: 204,
      headers: { 'X-BrewLite-Logout-Scope': 'local', 'Cache-Control': 'no-store' },
    });
  }

  const upstream = await backendFetch(backendAuthUrl('logout'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (upstream.status === 204) {
    await clearSessionCookie();
    return new Response(null, {
      status: 204,
      headers: { 'X-BrewLite-Logout-Scope': 'session', 'Cache-Control': 'no-store' },
    });
  }

  if (upstream.status === 401) {
    const payload = await upstream.clone().json().catch(() => null);
    const code = payload && typeof payload === 'object' && 'error' in payload
      ? (payload as { error?: { code?: string } }).error?.code
      : undefined;

    if (code === 'SESSION_INVALID') {
      await clearSessionCookie();
      return new Response(null, {
        status: 204,
        headers: { 'X-BrewLite-Logout-Scope': 'local', 'Cache-Control': 'no-store' },
      });
    }
  }

  return forwardError(upstream);
}
