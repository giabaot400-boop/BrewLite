export async function GET() {
  const base = (
    process.env.BACKEND_INTERNAL_URL ||
    process.env.BACKEND_URL ||
    'http://localhost:3001'
  ).replace(/\/+$/, '');

  try {
    const response = await fetch(`${base}/products`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    return new Response(await response.text(), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return Response.json(
      { error: { code: 'BACKEND_UNAVAILABLE' } },
      {
        status: 502,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}