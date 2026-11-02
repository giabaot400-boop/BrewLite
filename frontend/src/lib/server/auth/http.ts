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
  return fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(15_000) });
}

export function backendUnavailable(): Response {
  return errorResponse(503, 'UPSTREAM_UNAVAILABLE', 'Dịch vụ xác thực hiện không khả dụng.');
}
