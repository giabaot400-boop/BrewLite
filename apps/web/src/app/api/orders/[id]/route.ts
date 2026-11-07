import { handleOrderRead } from "@/lib/server/orders/order-read-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return handleOrderRead(request, { kind: "detail", id });
}
