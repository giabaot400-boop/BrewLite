import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import test from "node:test";

const code = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const origin = "https://brewlite.example";
const current = "brewlite-pwa-static-v1";
const publicPaths = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

function worker({ network = async () => new Response("online"), failInstall = false, fallback = true } = {}) {
  const handlers = new Map();
  const calls = { network: [], opened: [], deleted: [], installed: [], matched: [], claimed: 0 };
  const cache = {
    addAll: async (requests) => {
      if (failInstall) throw new Error("install network failure");
      calls.installed.push(...requests);
    },
    match: async (path) => {
      calls.matched.push(path);
      return fallback ? new Response(path === "/offline.html" ? "public offline page" : "public icon") : undefined;
    },
  };
  new Script(code).runInNewContext({
    URL, Request, Response,
    self: {
      location: { origin },
      addEventListener: (name, handler) => handlers.set(name, handler),
      clients: { claim: async () => { calls.claimed++; } },
    },
    caches: {
      open: async (name) => { calls.opened.push(name); return cache; },
      keys: async () => [current, "brewlite-pwa-static-v0", "another-app-cache"],
      delete: async (name) => { calls.deleted.push(name); return true; },
    },
    fetch: async (request, options) => { calls.network.push({ request, options }); return network(request, options); },
  });
  return {
    calls,
    event(name) {
      let completion;
      handlers.get(name)({ waitUntil: (promise) => { completion = promise; } });
      return completion;
    },
    request(path, properties = {}) {
      let response;
      const request = { url: new URL(path, origin).href, method: "GET", mode: "cors", ...properties };
      handlers.get("fetch")({ request, respondWith: (promise) => { response = promise; } });
      return response;
    },
  };
}

test("install caches only three public resources without cookies or HTTP-cache reuse", async () => {
  const w = worker();
  await w.event("install");
  assert.deepEqual(w.calls.opened, [current]);
  assert.deepEqual(w.calls.installed.map((r) => new URL(r.url).pathname), publicPaths);
  for (const r of w.calls.installed) {
    assert.equal(new URL(r.url).origin, origin);
    assert.equal(r.credentials, "omit");
    assert.equal(r.cache, "reload");
  }
});

test("failed precache rejects installation instead of pretending offline support is ready", async () => {
  const w = worker({ failInstall: true });
  await assert.rejects(w.event("install"), /install network failure/);
  assert.equal(w.calls.claimed, 0);
});

test("activate removes only older caches owned by this PWA", async () => {
  const w = worker();
  await w.event("activate");
  assert.deepEqual(w.calls.deleted, ["brewlite-pwa-static-v0"]);
  assert.equal(w.calls.claimed, 1);
});

for (const path of ["/", "/cart", "/login", "/products/coffee-milk", "/orders/private-order"]) {
  test("online navigation uses network without caching account or application HTML: " + path, async () => {
    const w = worker();
    const response = await w.request(path, { mode: "navigate" });
    assert.equal(await response.text(), "online");
    assert.equal(w.calls.network[0].options.cache, "no-store");
    assert.deepEqual(w.calls.opened, []);
    assert.deepEqual(w.calls.installed, []);
  });
}

for (const status of [401, 403, 404, 500]) {
  test("HTTP " + status + " remains the actual response, without offline substitution", async () => {
    const w = worker({ network: async () => new Response("actual HTTP error", { status }) });
    const response = await w.request("/cart", { mode: "navigate" });
    assert.equal(response.status, status);
    assert.equal(await response.text(), "actual HTTP error");
    assert.deepEqual(w.calls.opened, []);
  });
}

test("offline private navigation returns only the generic public fallback", async () => {
  const w = worker({ network: async () => { throw new TypeError("offline"); } });
  assert.equal(await (await w.request("/orders/private-order", { mode: "navigate" })).text(), "public offline page");
  assert.deepEqual(w.calls.opened, [current]);
  assert.deepEqual(w.calls.matched, ["/offline.html"]);
  assert.equal(w.calls.network.length, 1);
});

test("missing offline fallback returns a network error rather than an empty successful page", async () => {
  const w = worker({ fallback: false, network: async () => { throw new TypeError("offline"); } });
  const r = await w.request("/cart", { mode: "navigate" });
  assert.equal(r.type, "error");
  assert.equal(r.status, 0);
});

for (const [path, properties] of [
  ["/api/auth/me", {}], ["/api/auth/me", { mode: "navigate" }],
  ["/api/orders", { method: "POST" }], ["/api/auth/login", { method: "POST" }],
  ["/api/auth/logout", { method: "POST" }], ["/api/payments", { method: "POST" }],
  ["/api/orders/id", {}], ["/api", { mode: "navigate" }],
  ["/cart", { method: "POST" }],
  ["https://api.example/products", {}], ["https://api.example/orders", { method: "POST" }],
  ["/cart?_rsc=private", {}], ["/products/coffee-milk", {}],
  ["/_next/static/chunks/app.js", {}],
  ["/icons/icon-192.png?user=private", {}],
]) {
  test("bypass without fetching, caching or retrying: " + (properties.method || "GET") + " " + path, () => {
    const w = worker();
    assert.equal(w.request(path, properties), undefined);
    assert.deepEqual(w.calls.network, []);
    assert.deepEqual(w.calls.opened, []);
    assert.deepEqual(w.calls.installed, []);
  });
}

test("an installed icon is read only from the dedicated public cache", async () => {
  const w = worker();
  assert.equal(await (await w.request("/icons/icon-192.png")).text(), "public icon");
  assert.deepEqual(w.calls.opened, [current]);
  assert.equal(w.calls.network.length, 0);
});

test("a missing public icon falls back to network without adding a runtime cache entry", async () => {
  const w = worker({ fallback: false });
  assert.equal(await (await w.request("/icons/icon-512.png")).text(), "online");
  assert.equal(w.calls.network.length, 1);
  assert.deepEqual(w.calls.installed, []);
});
