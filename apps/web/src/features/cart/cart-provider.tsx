"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../auth/auth-provider";
import type { AuthSnapshot, LogoutInfo } from "../auth/auth-session";
import { CartStorageError } from "./cart-envelope";
import type { PendingCartRequest, ConfirmedCartOrder } from "./cart-envelope";
import { createCartOrderClient } from "./cart-order-client";
import type { OrderPhase, OrderReview } from "./cart-order-client";
import { createCartOrderTransport } from "./cart-order-transport";
import { orderFeedback, localOrderError } from "./cart-order-feedback";
import type { CartOrderFeedback } from "./cart-order-feedback";
import { selectCartQuantity } from "./cart-reducer";
import { createCartSessionBridge } from "./cart-session-bridge";
import { CART_STORAGE_KEY, createCartStorage } from "./cart-storage";
import { cartViewReducer, createCartViewState } from "./cart-view";
import type { CartViewState } from "./cart-view";
import type { CartAction, CartLineDraft } from "./types";
import { CartEditingContext } from "./cart-edit-context";

type CartContextValue = {
  state: CartViewState;
  canMutate: boolean;
  addItem: (item: CartLineDraft) => Promise<boolean>;
  increment: (lineKey: string) => Promise<boolean>;
  decrement: (lineKey: string) => Promise<boolean>;
  removeItem: (lineKey: string) => Promise<boolean>;
  reload: () => Promise<void>;
  pending: PendingCartRequest | null;
  lastOrder: ConfirmedCartOrder | null;
  orderPhase: OrderPhase;
  orderFeedback: CartOrderFeedback | null;
  reviewOrder: (retry?: boolean) => OrderReview | null;
  submitOrder: (review: OrderReview) => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof CartStorageError ? error.message : "Không thể cập nhật giỏ. Vui lòng thử lại.";
}

type VisibleCart = Awaited<ReturnType<ReturnType<typeof createCartSessionBridge>["read"]>>;

export function CartProvider({ children }: { children: ReactNode }) {
  const { sessionSnapshot, getSessionSnapshot, refresh, prepareSignOut, setLogoutInfoSource } = useAuth();
  const [state, dispatch] = useReducer(cartViewReducer, undefined, createCartViewState);
  const [publishedIdentity, setPublishedIdentity] = useState<AuthSnapshot | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [records, setRecords] = useState<{ pending: PendingCartRequest | null; result: ConfirmedCartOrder | null }>({ pending: null, result: null });
  const [phases, setPhases] = useState<ReadonlyMap<string, OrderPhase>>(new Map());
  const [feedback, setFeedback] = useState<{ ownerId: string; revision: number | null; value: CartOrderFeedback } | null>(null);
  const [storage] = useState(() => createCartStorage());
  const [bridge] = useState(() => createCartSessionBridge(storage, getSessionSnapshot));
  const alive = useRef(false);
  const sequence = useRef(0);
  const verificationSequence = useRef(0);
  const ready = useRef(false);
  const saving = useRef(false);
  const identityRef = useRef<AuthSnapshot | null>(null);
  const logoutInfo = useRef<LogoutInfo | null>(null);
  const reads = useRef<Promise<void>>(Promise.resolve());

  const publish = useCallback((version: number, identity: AuthSnapshot, saved: VisibleCart, message?: string) => {
    if (!alive.current || version !== sequence.current || getSessionSnapshot() !== identity) return;
    identityRef.current = identity;
    setPublishedIdentity(identity);
    setHasPending(saved.pending !== null);
    setRecords({ pending: saved.pending, result: saved.result });
    ready.current = saved.cart !== null && saved.pending === null;
    logoutInfo.current = saved.cart === null ? null : {
      cartItemCount: selectCartQuantity(saved.cart), hasPendingOrder: saved.pending !== null,
    };
    if (saved.cart === null) {
      dispatch({ type: "LOCKED", sequence: version,
        message: "Giỏ đang thuộc tài khoản khác hoặc phiên trước. Vui lòng đăng nhập đúng tài khoản để tiếp tục." });
    } else {
      dispatch({ type: "SNAPSHOT", sequence: version, cart: saved.cart, verifiedOwnerId: saved.ownerId,
        message: message ?? (saved.pending ? "Còn lần đặt chưa rõ kết quả của tài khoản này; giỏ đang được khóa để giữ nguyên dữ liệu." : undefined) });
    }
  }, [getSessionSnapshot]);

  const fail = useCallback((version: number, identity: AuthSnapshot, error: unknown) => {
    if (!alive.current || version !== sequence.current || getSessionSnapshot() !== identity) return;
    ready.current = false;
    logoutInfo.current = null;
    identityRef.current = identity;
    setPublishedIdentity(identity);
    dispatch({ type: "FAILED", sequence: version, message: errorMessage(error) });
  }, [getSessionSnapshot]);

  const read = useCallback((verifiedIdentity?: AuthSnapshot): Promise<void> => {
    if (!alive.current) return Promise.resolve();
    const version = ++sequence.current;
    ready.current = false;
    logoutInfo.current = null;
    // Serialize adoption reads so two /me/storage notifications cannot both adopt
    // the same old checkpoint. Obsolete queued reads never start a write.
    const task = reads.current.then(async () => {
      if (!alive.current || version !== sequence.current) return;
      const identity = getSessionSnapshot();
      dispatch({ type: "READ_STARTED", sequence: version });
      if (identity.status === "loading") return;
      if (identity.status === "unknown") {
        fail(version, identity, new CartStorageError("OWNER_MISMATCH", "Chưa kiểm tra được phiên. Vui lòng thử đọc lại giỏ."));
        return;
      }
      try {
        // Permission belongs to this newly verified read, never a stored flag.
        const saved = await bridge.read(verifiedIdentity === identity);
        publish(version, identity, saved);
      } catch (error) { fail(version, identity, error); }
    });
    reads.current = task;
    return task;
  }, [bridge, getSessionSnapshot, publish, fail]);

  const reload = useCallback(async () => {
    const verification = ++verificationSequence.current;
    // Invalidate a displayed cart immediately while verifying the shared cookie.
    const before = getSessionSnapshot();
    const version = ++sequence.current;
    ready.current = false;
    logoutInfo.current = null;
    if (alive.current) dispatch({ type: "READ_STARTED", sequence: version });
    await refresh(); // No Web Lock is held across HTTP.
    // Focus + visibilitychange may overlap. An ignored older /me must not
    // publish cached auth/cart while the newer verification is still pending.
    if (!alive.current || verification !== verificationSequence.current) return;
    const after = getSessionSnapshot();
    await read(after !== before && after.status === "authenticated" ? after : undefined);
  }, [getSessionSnapshot, refresh, read]);

  const [orderClient] = useState(() => createCartOrderClient({ storage, bridge, getSnapshot: getSessionSnapshot,
    transport: createCartOrderTransport({ fetch: (url, init) => fetch(url, init) }),
  }));

  useEffect(() => orderClient.subscribePhase((ownerId, phase) => {
      if (!alive.current) return;
      setPhases(current => {
        const next = new Map(current);
        if (phase === "IDLE") next.delete(ownerId); else next.set(ownerId, phase);
        return next;
      });
      if (getSessionSnapshot().user?.id === ownerId) {
        if (phase === "PREPARING") ready.current = false;
        if (phase === "SENDING") void read(); // Publish durable pending, never send from read().
      }
  }), [orderClient, getSessionSnapshot, read]);

  const reviewOrder = useCallback((retry = false): OrderReview | null => {
    const identity = getSessionSnapshot();
    if (saving.current || state.sequence !== sequence.current || publishedIdentity !== identity
      || state.status !== "ready" || !state.cart) return null;
    try {
      if (retry && !records.pending) throw new CartStorageError("PENDING_NOT_FOUND", "Không còn lần đặt để thử lại.");
      if (!retry && records.pending) throw new CartStorageError("PENDING_REQUEST", "Hãy thử lại cùng lần đặt đang chờ.");
      const review = orderClient.review(state.cart, retry ? records.pending : null);
      setFeedback(null);
      return review;
    } catch (error) {
      if (identity.user) setFeedback({ ownerId: identity.user.id, revision: null, value: localOrderError(errorMessage(error)) });
      return null;
    }
  }, [getSessionSnapshot, publishedIdentity, state, records.pending, orderClient]);

  const submitOrder = useCallback(async (review: OrderReview) => {
    try {
      // A focus/storage refresh invalidates readiness synchronously, before React rerenders.
      if (saving.current || state.sequence !== sequence.current || state.status !== "ready"
        || publishedIdentity !== getSessionSnapshot()) {
        throw new CartStorageError("CART_CHANGED", "Đang kiểm tra lại phiên hoặc giỏ. Vui lòng mở lại xác nhận.");
      }
      const result = await orderClient.submit(review);
      if (alive.current && getSessionSnapshot().user?.id === result.request.ownerId) {
        setFeedback({ ownerId: result.request.ownerId, revision: result.settlement.envelope.cart.revision,
          value: orderFeedback(result.settlement, result.request) });
        const outcome = result.settlement.outcome;
        if (outcome.kind === "UNKNOWN" && ["AUTH_REQUIRED", "SESSION_INVALID", "SESSION_EXPIRED", "REQUEST_FORBIDDEN"].includes(outcome.code)) {
          await reload(); // Recheck the cookie; a mismatch must not sign out another account.
          return;
        }
      }
    } catch (error) {
      if (alive.current && getSessionSnapshot().user?.id === review.ownerId) {
        setFeedback({ ownerId: review.ownerId, revision: null, value: localOrderError(errorMessage(error)
          + " Nếu còn lần đặt đang chờ, hãy giữ nguyên và thử lại cùng lần đặt đó.") });
      }
    }
    await read();
  }, [orderClient, getSessionSnapshot, reload, read, state, publishedIdentity]);

  useEffect(() => {
    alive.current = true;
    function onStorage(event: StorageEvent) {
      if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
      try { if (event.storageArea !== window.localStorage) return; } catch { /* Read will report denial. */ }
      void reload(); // Read current bytes, not a potentially stale event.newValue.
    }
    function onFocus() { void reload(); }
    function onVisibility() { if (document.visibilityState === "visible") void reload(); }
    function onPageShow(event: PageTransitionEvent) { if (event.persisted) void reload(); }
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      alive.current = false;
      ready.current = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reload]);

  useEffect(() => {
    // read() dispatches asynchronously after entering the serialized queue.
    void read(sessionSnapshot.status === "authenticated" ? sessionSnapshot : undefined);
  }, [sessionSnapshot, read]);

  useEffect(() => setLogoutInfoSource(() =>
    identityRef.current === getSessionSnapshot() ? logoutInfo.current : null), [setLogoutInfoSource, getSessionSnapshot]);

  useEffect(() => prepareSignOut(async () => {
    if (saving.current) throw new CartStorageError("CART_CHANGED", "Giỏ đang được cập nhật. Vui lòng thử đăng xuất lại.");
    saving.current = true;
    ready.current = false;
    const identity = getSessionSnapshot();
    const version = ++sequence.current;
    if (alive.current) dispatch({ type: "WRITE_STARTED", sequence: version });
    const release = () => {
      saving.current = false;
      if (alive.current) dispatch({ type: "WRITE_FINISHED" });
    };
    try {
      const prepared = await bridge.prepareLogout();
      let completed = false;
      return {
        complete: async (scope) => {
          completed = true;
          try {
            await prepared.complete(scope);
            await read();
          } catch (error) {
            fail(sequence.current, getSessionSnapshot(), error);
            throw error;
          } finally { release(); }
        },
        cancel: () => {
          prepared.cancel();
          if (!completed) {
            release();
            const current = getSessionSnapshot();
            void read(current !== identity && current.status === "authenticated" ? current : undefined);
          }
        },
      };
    } catch (error) {
      release();
      fail(version, identity, error);
      throw error; // No HTTP logout if its checkpoint could not be captured.
    }
  }), [prepareSignOut, bridge, read, fail, getSessionSnapshot]);

  const mutate = useCallback(async (action: CartAction): Promise<boolean> => {
    const identity = getSessionSnapshot();
    if (!alive.current || !ready.current || saving.current || identityRef.current !== identity) return false;
    saving.current = true;
    const version = ++sequence.current;
    dispatch({ type: "WRITE_STARTED", sequence: version });
    try {
      const saved = await bridge.mutate(action);
      publish(version, identity, saved, saved.error?.message);
      if (saved.error === null && alive.current && getSessionSnapshot() === identity) setFeedback(null);
      return saved.error === null;
    } catch (error) {
      fail(version, identity, error);
      return false;
    } finally {
      saving.current = false;
      if (alive.current) dispatch({ type: "WRITE_FINISHED" });
    }
  }, [bridge, publish, fail, getSessionSnapshot]);

  // Hide the previous owner's snapshot in the very render where auth changes,
  // before the async effect has had time to read/adopt the new owner's cart.
  const value = useMemo<CartContextValue>(() => {
    const visibleState = publishedIdentity === sessionSnapshot ? state
      : { ...state, status: "restoring" as const, cart: null, message: null };
    const ownerId = sessionSnapshot.status === "authenticated" ? sessionSnapshot.user?.id : null;
    const orderPhase = ownerId ? phases.get(ownerId) ?? "IDLE" : "IDLE";
    const visibleRecords = visibleState.status === "ready" && ownerId !== null;
    const visibleFeedback = visibleRecords && feedback !== null && feedback.ownerId === ownerId &&
      (feedback.revision === null || feedback.revision === visibleState.cart?.revision) ? feedback.value : null;
    return {
      state: visibleState,
      canMutate: visibleState.status === "ready" && !visibleState.isSaving && !hasPending && orderPhase === "IDLE",
      pending: visibleRecords ? records.pending : null,
      lastOrder: visibleRecords ? records.result : null,
      orderPhase,
      orderFeedback: visibleFeedback,
      reviewOrder,
      submitOrder,
      addItem: (item) => mutate({ type: "ADD_ITEM", item }),
      increment: (lineKey) => mutate({ type: "INCREMENT", lineKey }),
      decrement: (lineKey) => mutate({ type: "DECREMENT", lineKey }),
      removeItem: (lineKey) => mutate({ type: "REMOVE_ITEM", lineKey }),
      reload,
    };
  }, [publishedIdentity, sessionSnapshot, state, hasPending, mutate, reload, phases, feedback, records, reviewOrder, submitOrder]);

  return <CartContext.Provider value={value}><CartEditingContext.Provider value={value}>{children}</CartEditingContext.Provider></CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
