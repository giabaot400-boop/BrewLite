import type { NextRequest } from 'next/server';

/**
 * Browser POSTs must carry the UI's non-simple marker and a same-origin Origin.
 * This is a same-origin BFF endpoint; no wildcard CORS is enabled for it.
 */
export function assertSameOriginPost(request: NextRequest): Response | null {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ error: { code: 'REQUEST_FORBIDDEN', message: 'Yêu cầu phải sử dụng JSON.', fieldErrors: {} } }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (request.headers.get('x-brewlite-request') !== '1') {
    return Response.json({ error: { code: 'REQUEST_FORBIDDEN', message: 'Yêu cầu không hợp lệ.', fieldErrors: {} } }, { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (!origin) {
    return Response.json({ error: { code: 'REQUEST_FORBIDDEN', message: 'Thiếu thông tin nguồn yêu cầu.', fieldErrors: {} } }, { status: 403 });
  }
  try {
    if (!process.env.APP_ORIGIN || new URL(origin).origin !== new URL(process.env.APP_ORIGIN).origin) {
      return Response.json({ error: { code: 'REQUEST_FORBIDDEN', message: 'Nguồn yêu cầu không được phép.', fieldErrors: {} } }, { status: 403 });
    }
  } catch {
    return Response.json({ error: { code: 'REQUEST_FORBIDDEN', message: 'Nguồn yêu cầu không hợp lệ.', fieldErrors: {} } }, { status: 403 });
  }
  return null;
}
