import type { NextRequest } from "next/server";
import { backendAuthUrl } from "@/lib/server/auth/config";
import { readSessionToken } from "@/lib/server/auth/cookie";
import { assertSameOriginPost } from "@/lib/server/auth/csrf";
import { createOrderHandler } from "@/lib/server/orders/order-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return createOrderHandler({
    checkPost: incoming => assertSameOriginPost(incoming as NextRequest),
    readToken: readSessionToken,
    backendUrls: () => {
      const me = backendAuthUrl("me");
      return { me, orders: new URL("../orders", me).href };
    },
    fetch: (url, init) => fetch(url, init),
  })(request);
}
