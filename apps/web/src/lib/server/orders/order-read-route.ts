import "server-only";
import { backendAuthUrl } from "@/lib/server/auth/config";
import { readSessionToken } from "@/lib/server/auth/cookie";
import { createOrderReadHandler, type ReadTarget } from "./order-read-handler";

/** Nối handler thuần với cookie thật và URL backend tin cậy; dùng chung cho hai route GET. */
export function handleOrderRead(request: Request, target: ReadTarget): Promise<Response> {
  return createOrderReadHandler({
    readToken: readSessionToken,
    ordersUrl: () => new URL("../orders", backendAuthUrl("me")).href.replace(/\/$/, ""),
    fetch: (url, init) => fetch(url, init),
  })(request, target);
}
