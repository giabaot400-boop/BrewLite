import test from "node:test";
import assert from "node:assert/strict";
import { createAuthSession } from "./auth-session.ts";
import { AuthApiError } from "./auth-error.ts";

/** Promise có thể hoàn tất thủ công để kiểm soát thứ tự trả lời. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const session = (email = "a@b.co") => ({ user: { id: "1", email }, expiresAt: 1 });
const authRequired = () => new AuthApiError("AUTH_REQUIRED", "", 401);

function fakeClient(overrides = {}) {
  return {
    me: async () => {
      throw authRequired();
    },
    login: async () => session(),
    register: async () => ({ id: "1", email: "a@b.co" }),
    logout: async () => "session",
    ...overrides,
  };
}

test("/me bắt đầu trước login nhưng trả 401 sau login thành công không đưa UI về anonymous", async () => {
  const me = deferred();
  const s = createAuthSession(fakeClient({ me: () => me.promise }));
  const refreshing = s.refresh();
  await s.login({ email: "a@b.co", password: "x" });
  assert.equal(s.getSnapshot().status, "authenticated");
  me.reject(authRequired());
  await refreshing;
  assert.equal(s.getSnapshot().status, "authenticated");
  assert.equal(s.getSnapshot().user.email, "a@b.co");
});

test("/me cũ trả thành công sau logout không đưa UI về authenticated", async () => {
  const me = deferred();
  const s = createAuthSession(fakeClient({ me: () => me.promise }));
  const refreshing = s.refresh();
  await s.logout();
  assert.equal(s.getSnapshot().status, "anonymous");
  me.resolve(session());
  await refreshing;
  assert.equal(s.getSnapshot().status, "anonymous");
  assert.equal(s.getSnapshot().user, null);
});

test("/me cũ lỗi mạng sau login không ghi đè trạng thái", async () => {
  const me = deferred();
  const s = createAuthSession(fakeClient({ me: () => me.promise }));
  const refreshing = s.refresh();
  await s.login({ email: "a@b.co", password: "x" });
  me.reject(new AuthApiError("NETWORK_ERROR", ""));
  await refreshing;
  assert.equal(s.getSnapshot().status, "authenticated");
});

test("/me mới nhất vẫn được áp dụng khi không có login/logout xen vào", async () => {
  const s = createAuthSession(fakeClient({ me: async () => session("x@y.co") }));
  await s.refresh();
  assert.equal(s.getSnapshot().status, "authenticated");
  assert.equal(s.getSnapshot().user.email, "x@y.co");
});

test("hai /me đồng thời: phản hồi cũ không ghi đè tài khoản mới nhất", async () => {
  const older = deferred(), newer = deferred();
  let calls = 0;
  const s = createAuthSession(fakeClient({ me: () => ++calls === 1 ? older.promise : newer.promise }));
  const first = s.refresh(), second = s.refresh();
  newer.resolve({ user: { id: "2", email: "new@example.com" }, expiresAt: 1 });
  await second;
  const identity = s.getSnapshot();
  older.resolve(session());
  await first;
  assert.equal(s.getSnapshot(), identity);
  assert.equal(s.getSnapshot().user.id, "2");
});

test("401 của /me cũ không xóa phiên đã được /me mới xác nhận", async () => {
  const older = deferred();
  let calls = 0;
  const s = createAuthSession(fakeClient({ me: () => ++calls === 1 ? older.promise : Promise.resolve(session()) }));
  const first = s.refresh();
  await s.refresh();
  const identity = s.getSnapshot();
  older.reject(authRequired());
  await first;
  assert.equal(s.getSnapshot(), identity);
});

test("login thất bại không làm kẹt trạng thái loading do /me ban đầu", async () => {
  const s = createAuthSession(
    fakeClient({
      login: async () => {
        throw new AuthApiError("INVALID_CREDENTIALS", "", 401);
      },
    }),
  );
  await assert.rejects(s.login({ email: "a@b.co", password: "x" }));
  await s.refresh();
  assert.equal(s.getSnapshot().status, "anonymous");
});

test("lỗi hệ thống của /me -> unknown, không suy ra hết hạn", async () => {
  const s = createAuthSession(fakeClient({ me: async () => { throw new AuthApiError("NETWORK_ERROR", ""); } }));
  await s.refresh();
  assert.equal(s.getSnapshot().status, "unknown");
  assert.equal(s.getSnapshot().sessionExpired, false);
});

test("SESSION_EXPIRED -> anonymous và đánh dấu hết hạn", async () => {
  const s = createAuthSession(fakeClient({ me: async () => { throw new AuthApiError("SESSION_EXPIRED", "", 401); } }));
  await s.refresh();
  assert.equal(s.getSnapshot().status, "anonymous");
  assert.equal(s.getSnapshot().sessionExpired, true);
});

test("logout lỗi: giữ đăng nhập và KHÔNG gọi handler dọn giỏ", async () => {
  const s = createAuthSession(
    fakeClient({
      me: async () => session(),
      logout: async () => {
        throw new AuthApiError("INVALID_RESPONSE", "", 204);
      },
    }),
  );
  await s.refresh();
  let cleaned = 0;
  s.onSignedOut(() => cleaned++);
  await assert.rejects(s.logout());
  assert.equal(s.getSnapshot().status, "authenticated");
  assert.equal(cleaned, 0);
});

test("logout thành công gọi handler với đúng scope", async () => {
  const s = createAuthSession(fakeClient({ logout: async () => "local" }));
  const seen = [];
  const off = s.onSignedOut((scope) => seen.push(scope));
  await s.logout();
  off();
  await s.logout();
  assert.deepEqual(seen, ["local"]);
});

test("logout info: null khi chưa đăng ký, đọc mới nhất khi đã đăng ký", () => {
  const s = createAuthSession(fakeClient());
  assert.equal(s.getLogoutInfo(), null);
  let n = 2;
  const off = s.setLogoutInfoSource(() => ({ cartItemCount: n, hasPendingOrder: false }));
  assert.equal(s.getLogoutInfo().cartItemCount, 2);
  n = 5;
  assert.equal(s.getLogoutInfo().cartItemCount, 5);
  off();
  assert.equal(s.getLogoutInfo(), null);
});

test("same-owner /me refresh preserves UI continuity but still replaces the guarded snapshot", async () => {
  const s = createAuthSession(fakeClient({ me: async () => session() }));
  await s.refresh();
  const before = s.getSnapshot(), version = s.getSessionVersion();
  await s.refresh();
  assert.notEqual(s.getSnapshot(), before);
  assert.equal(s.getSessionVersion(), version);
});

test("explicit same-owner login invalidates reviews even without a logout", async () => {
  const s = createAuthSession(fakeClient({ me: async () => session() }));
  await s.refresh();
  const version = s.getSessionVersion();
  await s.login({ email: "a@b.co", password: "fixture" });
  assert.ok(s.getSessionVersion() > version);
});

test("account A -> B -> A advances continuity so a batched return cannot revive an old review", async () => {
  let current = session();
  const s = createAuthSession(fakeClient({ me: async () => current }));
  await s.refresh();
  const version = s.getSessionVersion();
  current = { user: { id: "2", email: "b@example.com" }, expiresAt: 1 };
  await s.refresh();
  current = session();
  await s.refresh();
  assert.equal(s.getSnapshot().user.id, "1");
  assert.equal(s.getSessionVersion(), version + 2);
});

test("session expiry and re-login invalidate continuity; a late old /me cannot change it", async () => {
  let action = async () => session();
  const s = createAuthSession(fakeClient({ me: () => action() }));
  await s.refresh();
  const version = s.getSessionVersion();
  action = async () => { throw new AuthApiError("SESSION_EXPIRED", "", 401); };
  await s.refresh();
  assert.ok(s.getSessionVersion() > version);
  const old = deferred(); action = () => old.promise;
  const lateRefresh = s.refresh();
  await s.login({ email: "a@b.co", password: "fixture" });
  const afterLogin = s.getSessionVersion();
  old.resolve({ user: { id: "2", email: "b@example.com" }, expiresAt: 1 });
  await lateRefresh;
  assert.equal(s.getSessionVersion(), afterLogin);
  assert.equal(s.getSnapshot().user.id, "1");
});

test("failed /me is not new verification and logout then same-owner login changes continuity", async () => {
  const s = createAuthSession(fakeClient({ me: async () => { throw new AuthApiError("NETWORK_ERROR", ""); } }));
  await s.login({ email: "a@b.co", password: "fixture" });
  const identity = s.getSnapshot(), version = s.getSessionVersion();
  await s.refresh();
  assert.equal(s.getSnapshot(), identity);
  assert.equal(s.getSessionVersion(), version);
  await s.logout();
  await s.login({ email: "a@b.co", password: "fixture" });
  assert.ok(s.getSessionVersion() > version);
});
