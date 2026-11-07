import { handleOrderRead } from "@/lib/server/orders/order-read-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return handleOrderRead(request, { kind: "history" });
}
