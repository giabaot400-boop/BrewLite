import type { NextRequest } from "next/server";
import { backendAuthUrl } from "@/lib/server/auth/config";
import { readSessionToken } from "@/lib/server/auth/cookie";
import { assertSameOriginPost } from "@/lib/server/auth/csrf";
import { createPaymentHandler } from "@/lib/server/payments/payment-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<Response> {
  return createPaymentHandler({
    checkPost: incoming => assertSameOriginPost(incoming as NextRequest),
    readToken: readSessionToken,
    backendUrls: () => {
      const me = backendAuthUrl("me");
      return { me, payments: new URL("../payments", me).href };
    },
    fetch: (url, init) => fetch(url, init),
  })(request);
}
