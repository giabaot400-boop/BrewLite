import 'server-only';

export type ApiError = { error: { code: string; message: string; fieldErrors: Record<string, string[]> } };

export function errorResponse(status: number, code: string, message: string): Response {
  const body: ApiError = { error: { code, message, fieldErrors: {} } };
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function forwardError(response: Response): Promise<Response> {
  let payload: unknown;
  try { payload = await response.json(); } catch { payload = null; }
  if (payload && typeof payload === 'object' && 'error' in payload) {
    return Response.json(payload, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  }
  return errorResponse(response.status, response.status === 401 ? 'INVALID_CREDENTIALS' : 'UPSTREAM_UNAVAILABLE', 'Không thể xử lý yêu cầu xác thực.');
}

export async function backendFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return errorResponse(504, 'UPSTREAM_TIMEOUT', 'Yêu cầu đến máy chủ mất quá nhiều thời gian.');
    }
    return errorResponse(502, 'UPSTREAM_UNAVAILABLE', 'Không thể kết nối đến máy chủ.');
  }
}

export function backendUnavailable(): Response {
  return errorResponse(503, 'UPSTREAM_UNAVAILABLE', 'Dịch vụ xác thực hiện không khả dụng.');
}
