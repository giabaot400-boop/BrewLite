import type { NextRequest } from "next/server";
import { backendAuthUrl } from "@/lib/server/auth/config";
import { readSessionToken } from "@/lib/server/auth/cookie";
import { assertSameOriginPost } from "@/lib/server/auth/csrf";
import { createCancelHandler } from "@/lib/server/orders/cancel-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await context.params;
  return createCancelHandler({
    checkPost: incoming => assertSameOriginPost(incoming as NextRequest),
    readToken: readSessionToken,
    backendUrls: () => {
      const me = backendAuthUrl("me");
      return { me, orders: new URL("../orders", me).href };
    },
    fetch: (url, init) => fetch(url, init),
  }, id)(request);
}
