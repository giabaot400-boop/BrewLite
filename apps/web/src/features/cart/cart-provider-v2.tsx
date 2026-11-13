"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "../auth/auth-provider";
import { CartEditingContext, type CartEditingValue } from "./cart-edit-context";
import { createCartControllerV2, cartControllerViewV2, INITIAL_CART_SNAPSHOT_V2 } from "./cart-controller-v2";
import { CART_STORAGE_KEY, createCartStorage } from "./cart-storage";
import { createCartCheckoutRuntimeV2 } from "./cart-checkout-runtime-v2";
import { activateCartV2 } from "./cart-activation-v2";
import { CartStorageError } from "./cart-envelope";
import type { CheckoutUiEnvironment } from "./cart-checkout-ui";

type Controller = ReturnType<typeof createCartControllerV2>;
type Value = CartEditingValue & { records: ReturnType<Controller["getView"]>["records"]; checkoutEnvironment: CheckoutUiEnvironment };
const CartV2Context = createContext<Value | null>(null);

/** Prepared for the S3 activation switch. Never mount beside the v1 provider. */
export function CartProviderV2({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [environment] = useState(() => ({ auth: { getSnapshot: auth.getSessionSnapshot, getSessionVersion: auth.getSessionVersion,
    subscribe: auth.subscribeSession, refresh: auth.refresh, prepareSignOut: auth.prepareSignOut, setLogoutInfoSource: auth.setLogoutInfoSource },
    storage: createCartStorage() }));
  const [controller] = useState(() => createCartControllerV2(environment));
  const [checkoutEnvironment] = useState(() => createCartCheckoutRuntimeV2({ ...environment, controller }));
  const [activation, setActivation] = useState({ attempt: 0, error: null as string | null });
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, () => INITIAL_CART_SNAPSHOT_V2);
  useEffect(() => activateCartV2({ storage: environment.storage, controller,
    onError: error => setActivation(current => ({ ...current, error: error instanceof CartStorageError
      ? error.message : "Chưa nâng cấp được giỏ đã lưu. Vui lòng thử đọc lại giỏ." })) }),
  [controller, environment, activation.attempt]);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== CART_STORAGE_KEY) return;
      try { if (event.storageArea !== window.localStorage) return; } catch { /* Reload reports denied storage. */ }
      void controller.reload();
    };
    const onFocus = () => { void controller.reload(); };
    const onVisible = () => { if (document.visibilityState === "visible") void controller.reload(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void controller.reload(); };
    window.addEventListener("storage", onStorage); window.addEventListener("focus", onFocus); window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("storage", onStorage); window.removeEventListener("focus", onFocus); window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [controller]);
  const value = useMemo<Value>(() => {
    const current = cartControllerViewV2(snapshot, { getSnapshot: () => auth.sessionSnapshot, getSessionVersion: () => auth.sessionVersion });
    const view = activation.error === null ? current : { ...current, records: null, canMutate: false,
      state: { ...current.state, status: "error" as const, cart: null, isSaving: false, message: activation.error } };
    return { ...view, checkoutEnvironment, reload: async () => {
      if (activation.error !== null) setActivation(previous => ({ attempt: previous.attempt + 1, error: null }));
      else await controller.reload();
    }, addItem: item => controller.mutate({ type: "ADD_ITEM", item }),
      increment: lineKey => controller.mutate({ type: "INCREMENT", lineKey }),
      decrement: lineKey => controller.mutate({ type: "DECREMENT", lineKey }),
      removeItem: lineKey => controller.mutate({ type: "REMOVE_ITEM", lineKey }) };
  }, [snapshot, controller, checkoutEnvironment, auth.sessionSnapshot, auth.sessionVersion, activation.error]);
  return <CartV2Context.Provider value={value}><CartEditingContext.Provider value={value}>{children}</CartEditingContext.Provider></CartV2Context.Provider>;
}

export function useCartV2(): Value {
  const value = useContext(CartV2Context);
  if (!value) throw new Error("useCartV2 phải nằm trong CartProviderV2.");
  return value;
}
