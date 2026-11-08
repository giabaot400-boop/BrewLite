import { CartStorageError } from "./cart-envelope.ts";
import { createCartSessionBridgeV2 } from "./cart-session-bridge-v2.ts";
import { createCartViewState } from "./cart-view.ts";
import { selectCartQuantity } from "./cart-reducer.ts";
import type { AuthSession, AuthSnapshot, LogoutInfo, SignOutPreparation } from "../auth/auth-session";
import type { CartAction } from "./types";
import type { CartViewState } from "./cart-view";

type AuthPort = Pick<AuthSession, "getSnapshot" | "getSessionVersion" | "subscribe" | "refresh"
  | "prepareSignOut" | "setLogoutInfoSource">;
type StoragePort = Parameters<typeof createCartSessionBridgeV2>[0];
type Records = Awaited<ReturnType<ReturnType<typeof createCartSessionBridgeV2>["read"]>>;
type Session = { status: AuthSnapshot["status"]; ownerId: string | null; binding: string | undefined; version: number };
export type CartControllerSnapshotV2 = { state: CartViewState; records: Records | null; session: Session | null };
export const INITIAL_CART_SNAPSHOT_V2: CartControllerSnapshotV2 = { state: createCartViewState(), records: null, session: null };

function sessionOf(auth: Pick<AuthPort, "getSnapshot" | "getSessionVersion">): Session {
  const value = auth.getSnapshot();
  return { status: value.status, ownerId: value.user?.id ?? null, binding: value.binding, version: auth.getSessionVersion() };
}
function sameSession(a: Session | null, b: Session): boolean {
  return a !== null && a.status === b.status && a.ownerId === b.ownerId && a.binding === b.binding && a.version === b.version;
}

/** Pure render selector: hide a previous session in the first render after auth changes. */
export function cartControllerViewV2(value: CartControllerSnapshotV2, auth: Pick<AuthPort, "getSnapshot" | "getSessionVersion">) {
  if (!sameSession(value.session, sessionOf(auth))) {
    return { state: { ...value.state, status: "restoring" as const, cart: null, message: null }, records: null, canMutate: false };
  }
  return { state: value.state, records: value.records,
    canMutate: value.state.status === "ready" && !value.state.isSaving && value.records?.canMutate === true };
}

/** External store for the React provider; construction performs no browser I/O. */
export function createCartControllerV2(environment: { auth: AuthPort; storage: StoragePort }) {
  const { auth } = environment, bridge = createCartSessionBridgeV2(environment.storage, auth);
  const listeners = new Set<() => void>();
  let value = INITIAL_CART_SNAPSHOT_V2, active = false, lifetime = 0, sequence = 0, verification = 0, busy = false;
  let reads = Promise.resolve();
  let cleanups: (() => void)[] = [];
  const emit = (next: CartControllerSnapshotV2) => { value = next; listeners.forEach(listener => listener()); };
  const current = (session: Session) => sameSession(session, sessionOf(auth));
  const valid = (life: number, ticket: number, session: Session) => active && life === lifetime && ticket === sequence && current(session);
  const message = (error: unknown) => error instanceof CartStorageError ? error.message : "Không đọc hoặc lưu được giỏ. Vui lòng thử lại.";
  function fail(life: number, ticket: number, session: Session, error: unknown) {
    if (valid(life, ticket, session)) emit({ session, records: null, state: { sequence: ticket, status: "error", cart: null,
      isSaving: busy, message: message(error) } });
  }
  function publish(life: number, ticket: number, session: Session, saved: Records, notice?: string) {
    if (!valid(life, ticket, session)) return;
    const blockMessage = saved.editBlock === "ORDER_PENDING" ? "Lần đặt trước chưa rõ kết quả. Giỏ được khóa để giữ nguyên yêu cầu."
      : saved.editBlock === "PAYMENT_UNRESOLVED" ? "Còn lần thanh toán cần khôi phục. Chưa thể sửa giỏ."
        : saved.editBlock === "CHECKOUT_BOUND" ? "Giỏ đang gắn với đơn chưa kết thúc. Các lựa chọn vẫn được giữ." : null;
    emit({ session, records: saved, state: { sequence: ticket, status: saved.cart ? "ready" : "locked", cart: saved.cart,
      isSaving: busy, message: saved.cart ? notice ?? blockMessage
        : "Giỏ đang thuộc tài khoản khác hoặc phiên trước. Vui lòng đăng nhập đúng tài khoản để tiếp tục." } });
  }
  function read(verifiedIdentity?: AuthSnapshot): Promise<void> {
    if (!active) return Promise.resolve();
    const ticket = ++sequence, life = lifetime;
    emit({ session: sessionOf(auth), records: null, state: { ...value.state, sequence: ticket,
      status: "restoring", cart: null, message: null, isSaving: busy } });
    const task = reads.then(async () => {
      const session = sessionOf(auth);
      if (!valid(life, ticket, session) || session.status === "loading") return;
      try {
        const saved = await bridge.read(verifiedIdentity);
        publish(life, ticket, session, saved);
      } catch (error) { fail(life, ticket, session, error); }
    });
    reads = task.catch(() => {});
    return task;
  }
  async function reload(): Promise<void> {
    if (!active) return;
    const ownVerification = ++verification, life = lifetime, before = auth.getSnapshot();
    const ticket = ++sequence;
    emit({ session: sessionOf(auth), records: null, state: { ...value.state, sequence: ticket,
      status: "restoring", cart: null, message: null, isSaving: busy } });
    try { await auth.refresh(); }
    catch (error) { fail(life, ticket, sessionOf(auth), error); return; }
    if (!active || life !== lifetime || ownVerification !== verification) return;
    const after = auth.getSnapshot();
    await read(after !== before && after.status === "authenticated" ? after : undefined);
  }
  function releaseBusy() {
    busy = false;
    if (active) emit({ ...value, state: { ...value.state, isSaving: false } });
  }
  async function prepareLogout(): Promise<SignOutPreparation> {
    if (!active || busy) throw new CartStorageError("CART_CHANGED", "Giỏ đang được cập nhật. Vui lòng thử đăng xuất lại.");
    busy = true;
    const ticket = ++sequence;
    emit({ ...value, state: { ...value.state, sequence: ticket, isSaving: true } });
    try {
      const prepared = await bridge.prepareLogout();
      let completed = false;
      return {
        async complete(scope) {
          completed = true;
          try { await prepared.complete(scope); await read(); }
          catch (error) { fail(lifetime, sequence, sessionOf(auth), error); throw error; }
          finally { releaseBusy(); }
        },
        cancel() {
          prepared.cancel();
          if (!completed) { releaseBusy(); void read(); }
        },
      };
    } catch (error) { releaseBusy(); void read(); throw error; }
  }
  function logoutInfo(): LogoutInfo | null {
    const visible = cartControllerViewV2(value, auth), saved = visible.records;
    if (visible.state.status !== "ready" || visible.state.isSaving || !saved?.cart) return null;
    return { cartItemCount: selectCartQuantity(saved.cart), hasPendingOrder: saved.pending !== null,
      hasCheckoutOrder: saved.binding !== null,
      hasUnresolvedPayment: saved.recoveries.some(item => item.recoveryStatus === "UNRESOLVED") };
  }

  return {
    getSnapshot: () => value,
    getView: () => cartControllerViewV2(value, auth),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start() {
      if (active) return () => {};
      active = true; lifetime++;
      const startedLife = lifetime;
      cleanups = [auth.subscribe(() => { const identity = auth.getSnapshot(); void read(identity.status === "authenticated" ? identity : undefined); }),
        auth.prepareSignOut(prepareLogout), auth.setLogoutInfoSource(logoutInfo)];
      const identity = auth.getSnapshot();
      void read(identity.status === "authenticated" ? identity : undefined);
      return () => {
        if (!active || startedLife !== lifetime) return;
        active = false; lifetime++; sequence++; verification++;
        cleanups.forEach(cleanup => cleanup()); cleanups = [];
      };
    },
    read,
    reload,
    /** One mounted-provider gate shared by checkout, payment, cancel, edits and logout. */
    async runCheckout<T>(work: () => Promise<T>): Promise<T> {
      const view = cartControllerViewV2(value, auth);
      if (!active || busy || view.state.status !== "ready" || !view.records?.cart) {
        throw new CartStorageError("CART_CHANGED", "Đang xử lý hoặc kiểm tra lại giỏ. Vui lòng chờ rồi xác nhận lại.");
      }
      if (view.records.ownerId === null) {
        throw new CartStorageError("OWNER_MISMATCH", "Cần đăng nhập trước khi thao tác đơn hàng.");
      }
      const session = sessionOf(auth), life = lifetime;
      busy = true;
      emit({ ...value, state: { ...value.state, isSaving: true } });
      try {
        const result = await work();
        if (!active || life !== lifetime || !current(session)) {
          throw new CartStorageError("OWNER_MISMATCH", "Phiên đã thay đổi. Giữ dữ liệu để kiểm tra lại.");
        }
        return result;
      } finally {
        // Reading publishes durable pending/recovery even when HTTP failed; never auto-POST.
        try { if (active && life === lifetime) await read(); }
        finally { releaseBusy(); }
      }
    },
    async mutate(action: CartAction): Promise<boolean> {
      if (!active || busy || !cartControllerViewV2(value, auth).canMutate) return false;
      busy = true;
      const session = sessionOf(auth), life = lifetime, ticket = ++sequence;
      emit({ ...value, state: { ...value.state, sequence: ticket, isSaving: true, message: null } });
      try {
        const saved = await bridge.mutate(action);
        publish(life, ticket, session, saved, saved.error?.message);
        // A newer same-session read may supersede publication without undoing a durable edit.
        return active && life === lifetime && current(session) && saved.error === null;
      } catch (error) { fail(life, ticket, session, error); return false; }
      finally { releaseBusy(); }
    },
  };
}
