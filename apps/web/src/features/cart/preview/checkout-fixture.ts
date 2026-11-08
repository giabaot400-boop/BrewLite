import { createEmptyCartEnvelopeV2, encodeCartEnvelopeV2 } from "../cart-envelope-v2.ts";
import { createCartStorage } from "../cart-storage.ts";
import { cartReducer } from "../cart-reducer.ts";
import { createCartCheckoutClientV2 } from "../cart-checkout-client-v2.ts";
import { createCartPaymentClientV2 } from "../cart-payment-client-v2.ts";
import { createCartCancelClientV2 } from "../cart-cancel-client-v2.ts";
import { createCartOrderTransport } from "../cart-order-transport.ts";
import { createCartMutationTransport } from "../cart-mutation-transport.ts";
import { requireCurrentCartOrder } from "../cart-order-binding-v2.ts";
import type { CheckoutUiEnvironment } from "../cart-checkout-ui";
import type { CartCurrentOrder } from "../cart-order-binding-v2";
import type { CartPaymentView } from "../cart-payment-recovery-v2";
import type { OrderPayloadV2 } from "../cart-envelope-v2";
import type { CartHttpEnvironment } from "../cart-http";
import type { AuthSnapshot } from "../../auth/auth-session";

export type CheckoutPreviewFault = "NONE" | "CREATE_RESPONSE_LOST" | "PAYMENT_RESPONSE_LOST" | "PAYMENT_READ_FAILED";
export type CheckoutPreviewTrace = { operation: "CREATE" | "PAYMENT" | "CANCEL"; key: string | null; replay: boolean };
const OWNER = "checkout-preview-user";
const BINDING = "d".repeat(64);

/**
 * In-memory demonstration ports, not business logic or a backend substitute.
 * No window.localStorage, navigator.locks, cookies or global fetch is used.
 * Fixture prices/outcomes are controlled examples; real stock/points/DB are not exercised.
 */
export function createCheckoutFixture(options: { delayMs?: number } = {}) {
  const listeners = new Set<() => void>();
  let tick = 0, tail = Promise.resolve();
  const emit = () => { tick++; listeners.forEach(listener => listener()); };
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  let outcome: "SUCCEEDED" | "FAILED" = "SUCCEEDED", fault: CheckoutPreviewFault = "NONE", failRead = false;
  const trace: CheckoutPreviewTrace[] = [];
  const orders = new Map<string, CartCurrentOrder>();
  const creates = new Map<string, { status: number; body: unknown }>();
  const payments = new Map<string, CartPaymentView>();
  const now = () => new Date().toISOString();
  const initial = createEmptyCartEnvelopeV2();
  const sample = { productId: "cappuccino", productName: "Cappuccino", imageUrl: "/images/cappuccino.svg", size: "M" as const,
    toppingIds: [], toppingNames: {}, previewUnitPrice: 50000 };
  for (let cup = 0; cup < 2; cup++) initial.cart = cartReducer({ cart: initial.cart, error: null }, { type: "ADD_ITEM", item: sample }).cart;
  initial.cart = { ...initial.cart, ownerId: OWNER };
  let raw = encodeCartEnvelopeV2(initial);
  function request<T>(name: string, callback: LockGrantedCallback<T>): Promise<Awaited<T>>;
  function request<T>(name: string, settings: LockOptions, callback: LockGrantedCallback<T>): Promise<Awaited<T>>;
  function request<T>(_name: string, settings: LockOptions | LockGrantedCallback<T>, callback?: LockGrantedCallback<T>): Promise<Awaited<T>> {
    const action = typeof settings === "function" ? settings : callback!;
    const signal = typeof settings === "function" ? undefined : settings.signal;
    const work = tail.then(() => { signal?.throwIfAborted(); return action(null); });
    tail = work.then(() => {}, () => {}); return work as Promise<Awaited<T>>;
  }
  const storage = createCartStorage({ storage: { getItem: () => raw, setItem: (_key, value) => { raw = value; emit(); } }, locks: { request } });
  const identity: AuthSnapshot = { status: "authenticated", user: { id: OWNER, email: "preview@example.invalid" },
    sessionExpired: false, binding: BINDING };
  const auth = { getSnapshot: () => identity, getSessionVersion: () => 1, subscribe: () => () => {} };
  const sessionClient = { async me() { return { user: identity.user!, binding: BINDING, expiresAt: now() }; } };
  const delayed = async (response: Response, signal?: AbortSignal | null) => {
    if ((options.delayMs ?? 150) > 0) await new Promise(resolve => setTimeout(resolve, options.delayMs ?? 150));
    signal?.throwIfAborted(); return response;
  };
  const error = (code: string, reason?: string) => Response.json({ error: { code,
    message: "Mã giảm giá không áp dụng trong dữ liệu mẫu.", ...(reason ? { details: { reason } } : {}) } }, { status: 409 });
  const fetchFixture: CartHttpEnvironment["fetch"] = async (path, init) => {
    init.signal?.throwIfAborted();
    const headers = new Headers(init.headers), key = headers.get("Idempotency-Key") ?? "";
    const body = JSON.parse(init.body as string);
    if (path === "/api/orders") {
      const prior = creates.get(key);
      trace.push({ operation: "CREATE", key, replay: !!prior });
      if (prior) { emit(); return delayed(Response.json(prior.body, { status: prior.status === 201 ? 200 : prior.status }), init.signal); }
      const payload = body as OrderPayloadV2;
      if (payload.promotionCode !== null && payload.promotionCode !== "DEMO10") {
        const response = error("PROMOTION_NOT_APPLICABLE", "NOT_FOUND");
        creates.set(key, { status: 409, body: await response.clone().json() }); emit(); return delayed(response, init.signal);
      }
      const id = `preview-order-${orders.size + 1}`, time = now();
      orders.set(id, { id, version: 0, status: "PENDING", total: payload.expectedTotal,
        paymentDeadline: new Date(Date.parse(time) + 15 * 60000).toISOString(), paidAt: null,
        canPay: true, canCancel: true, serverTime: time });
      const reply = { id, status: "PENDING", total: payload.expectedTotal };
      creates.set(key, { status: 201, body: reply });
      const lose = fault === "CREATE_RESPONSE_LOST"; if (lose) fault = "NONE"; emit();
      if (lose) throw Error("Fixture: create committed but response lost");
      return delayed(Response.json(reply, { status: 201 }), init.signal);
    }
    if (path === "/api/payments") {
      const prior = payments.get(key);
      trace.push({ operation: "PAYMENT", key, replay: !!prior });
      if (prior) { emit(); return delayed(Response.json({ ...prior, serverTime: now() }), init.signal); }
      const order = orders.get(body.orderId);
      if (!order || !order.canPay) { emit(); return delayed(error("ORDER_NOT_PAYABLE"), init.signal); }
      const time = now(), status = outcome;
      const payment: CartPaymentView = { id: `preview-payment-${payments.size + 1}`, version: 0, orderId: order.id,
        method: body.method, amount: order.total, status, failureCode: status === "FAILED" ? "PAYMENT_DECLINED" : null,
        createdAt: time, resolvedAt: time, refundedAmount: 0, refundedAt: null, serverTime: time };
      payments.set(key, payment);
      orders.set(order.id, { ...order, version: order.version + 1, status: status === "FAILED" ? "PAYMENT_FAILED" : "PAID",
        paidAt: status === "SUCCEEDED" ? time : null, canPay: status === "FAILED", serverTime: time });
      const lose = fault === "PAYMENT_RESPONSE_LOST";
      if (fault === "PAYMENT_READ_FAILED") failRead = true;
      if (lose || failRead) fault = "NONE"; emit();
      if (lose) throw Error("Fixture: payment committed but response lost");
      return delayed(Response.json(payment), init.signal);
    }
    const match = /^\/api\/orders\/([^/]+)\/cancel$/.exec(path);
    if (!match || JSON.stringify(body) !== "{}") throw Error("Unknown fixture request");
    const id = decodeURIComponent(match[1]), order = orders.get(id);
    trace.push({ operation: "CANCEL", key: null, replay: order?.status === "CANCELLED" });
    if (!order) throw Error("Fixture order missing");
    const time = now();
    if (order.status !== "CANCELLED") {
      orders.set(id, { ...order, status: "CANCELLED", version: order.version + 1, canPay: false, canCancel: false, serverTime: time });
      for (const [key, payment] of payments) if (payment.orderId === id && payment.status === "SUCCEEDED") {
        payments.set(key, { ...payment, version: 1, refundedAmount: payment.amount, refundedAt: time, serverTime: time });
      }
    }
    emit(); return delayed(Response.json({ ...orders.get(id), serverTime: time }), init.signal);
  };
  const readOrder: Parameters<typeof createCartCheckoutClientV2>[0]["readOrder"] = async ({ orderId, session, signal }) => {
    signal?.throwIfAborted();
    if (session.ownerId !== OWNER || session.binding !== BINDING) throw Error("Fixture owner mismatch");
    if (failRead) { failRead = false; emit(); throw Error("Fixture current Order read failed"); }
    const order = orders.get(orderId);
    if (!order) throw Error("Fixture Order not found");
    return { session, order: { ...order, serverTime: now() } };
  };
  const mutation = createCartMutationTransport({ fetch: fetchFixture, now });
  const common = { auth, sessionClient, storage, readOrder };
  const environment: CheckoutUiEnvironment = {
    auth, storage, subscribeCart: subscribe,
    checkout: createCartCheckoutClientV2({ ...common, transport: createCartOrderTransport({ fetch: fetchFixture, now }), now }),
    payment: createCartPaymentClientV2({ ...common, transport: mutation, now }),
    cancel: createCartCancelClientV2({ ...common, transport: mutation,
      parseOrderDetail: body => { const order = body as CartCurrentOrder; requireCurrentCartOrder(order); return order; } }),
  };
  return { environment, subscribe, getTick: () => tick, getTrace: () => trace.map(item => ({ ...item })),
    getOutcome: () => outcome, getFault: () => fault,
    setOutcome(value: "SUCCEEDED" | "FAILED") { outcome = value; emit(); },
    setFault(value: CheckoutPreviewFault) { fault = value; emit(); },
    addSample: () => storage.mutateCartV2({ type: "ADD_ITEM", item: sample }, OWNER, () => true),
  };
}
