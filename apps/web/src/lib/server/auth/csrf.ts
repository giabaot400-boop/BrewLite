import type { NextRequest } from 'next/server';

/**
 * Browser POSTs must carry the UI's non-simple marker and a same-origin Origin.
 * This is a same-origin BFF endpoint; no wildcard CORS is enabled for it.
 */
export function assertSameOriginPost(request: NextRequest): Response | null {
  const contentType = request.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';', 1)[0].trim().toLowerCase();
  if (mediaType !== 'application/json') {
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
    const configuredOrigin = process.env.APP_ORIGIN;
    if (!configuredOrigin) throw new Error('APP_ORIGIN is not configured');
    const expected = new URL(configuredOrigin);
    const received = new URL(origin);
    const configuredIsOrigin = expected.pathname === '/' && !expected.search && !expected.hash;
    const receivedIsOrigin = received.origin === origin;
    if (!configuredIsOrigin || !receivedIsOrigin || received.origin !== expected.origin) {
      return Response.json({ error: { code: 'REQUEST_FORBIDDEN', message: 'Nguồn yêu cầu không được phép.', fieldErrors: {} } }, { status: 403 });
    }
  } catch {
    return Response.json({ error: { code: 'REQUEST_FORBIDDEN', message: 'Nguồn yêu cầu không hợp lệ.', fieldErrors: {} } }, { status: 403 });
  }
  return null;
}
