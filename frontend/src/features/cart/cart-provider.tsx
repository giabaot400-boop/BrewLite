"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CartStorageError } from "./cart-envelope";
import type { CartEnvelope } from "./cart-envelope";
import { CART_STORAGE_KEY, createCartStorage } from "./cart-storage";
import { cartViewReducer, createCartViewState } from "./cart-view";
import type { CartViewState } from "./cart-view";
import type { CartAction, CartLineDraft } from "./types";

type CartContextValue = {
  state: CartViewState;
  canMutate: boolean;
  addItem: (item: CartLineDraft) => Promise<boolean>;
  increment: (lineKey: string) => Promise<boolean>;
  decrement: (lineKey: string) => Promise<boolean>;
  removeItem: (lineKey: string) => Promise<boolean>;
  reload: () => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof CartStorageError ? error.message : "Không thể cập nhật giỏ. Vui lòng thử lại.";
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartViewReducer, undefined, createCartViewState);
  const [storage] = useState(() => createCartStorage());
  const alive = useRef(false);
  const sequence = useRef(0);
  const ready = useRef(false);
  const saving = useRef(false);

  const publish = useCallback((version: number, envelope: CartEnvelope, message?: string) => {
    if (!alive.current || version !== sequence.current) return;
    ready.current = envelope.cart.ownerId === null;
    dispatch({ type: "SNAPSHOT", sequence: version, cart: envelope.cart, message });
  }, []);

  const fail = useCallback((version: number, error: unknown) => {
    if (!alive.current || version !== sequence.current) return;
    ready.current = false;
    dispatch({ type: "FAILED", sequence: version, message: errorMessage(error) });
  }, []);

  const reload = useCallback(async () => {
    if (!alive.current) return;
    const version = ++sequence.current;
    ready.current = false;
    dispatch({ type: "READ_STARTED", sequence: version });
    try { publish(version, await storage.read()); } catch (error) { fail(version, error); }
  }, [storage, publish, fail]);

  useEffect(() => {
    alive.current = true;
    // Initial state already says restoring. State changes only after async read;
    // there is no effect that persists the initial empty React state.
    const initialVersion = ++sequence.current;
    void storage.read().then(
      (envelope) => publish(initialVersion, envelope),
      (error: unknown) => fail(initialVersion, error),
    );

    function onStorage(event: StorageEvent) {
      if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
      try { if (event.storageArea !== window.localStorage) return; } catch {
        // A denied storage getter will also be handled by the next read.
      }
      void reload(); // Read current bytes, not the event's potentially stale newValue.
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
      // alive blocks late completions; the next setup advances sequence.
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [storage, reload, publish, fail]);

  const mutate = useCallback(async (action: CartAction): Promise<boolean> => {
    // Ref guard acts immediately, including two clicks before React re-renders.
    if (!alive.current || !ready.current || saving.current) return false;
    saving.current = true;
    const version = ++sequence.current;
    dispatch({ type: "WRITE_STARTED", sequence: version });
    try {
      const saved = await storage.mutateCart(action, null); // Guest slice only.
      publish(version, saved.envelope, saved.error?.message);
      return saved.error === null;
    } catch (error) {
      fail(version, error);
      return false;
    } finally {
      saving.current = false;
      if (alive.current) dispatch({ type: "WRITE_FINISHED" });
    }
  }, [storage, publish, fail]);

  const value = useMemo<CartContextValue>(() => ({
    state,
    canMutate: state.status === "ready" && !state.isSaving,
    addItem: (item) => mutate({ type: "ADD_ITEM", item }),
    increment: (lineKey) => mutate({ type: "INCREMENT", lineKey }),
    decrement: (lineKey) => mutate({ type: "DECREMENT", lineKey }),
    removeItem: (lineKey) => mutate({ type: "REMOVE_ITEM", lineKey }),
    reload: () => reload(),
  }), [state, mutate, reload]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
