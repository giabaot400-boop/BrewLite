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
