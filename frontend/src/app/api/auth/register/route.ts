import { assertSameOriginPost } from '@/lib/server/auth/csrf';
import { backendAuthUrl } from '@/lib/server/auth/config';
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
    const upstream = await backendFetch(backendAuthUrl('register'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!upstream.ok) return forwardError(upstream);
    const data = await upstream.json() as { user?: { id?: unknown; email?: unknown } };
    if (!data.user || typeof data.user.id !== 'string' || typeof data.user.email !== 'string') {
      return errorResponse(502, 'UPSTREAM_UNAVAILABLE', 'Phản hồi đăng ký từ máy chủ không hợp lệ.');
    }
    // Registration never creates a login session.
    return Response.json({ user: data.user }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return backendUnavailable();
  }
}
