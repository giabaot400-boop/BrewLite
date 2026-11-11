import { strict as assert } from "node:assert";
import { test } from "node:test";

import { decideOrderIdempotencyV2 } from "./order-idempotency-v2.js";

test("UT-S3-D23: new request", () => {
  const result = decideOrderIdempotencyV2(null, "hash-A");

  assert.deepEqual(result, { kind: "NEW" });
});

test("UT-S3-D24: same V2 request", () => {
  const result = decideOrderIdempotencyV2(
    {
      canonicalVersion: 2,
      requestHash: "hash-A",
      state: "SUCCEEDED",
    },
    "hash-A",
  );

  assert.deepEqual(result, { kind: "REPLAY" });
});

test("UT-S3-D25: different hash", () => {
  const result = decideOrderIdempotencyV2(
    {
      canonicalVersion: 2,
      requestHash: "hash-A",
      state: "SUCCEEDED",
    },
    "hash-B",
  );

  assert.deepEqual(result, { kind: "CONFLICT" });
});

test("UT-S3-D26: V1 and V2 must not replay", () => {
  const result = decideOrderIdempotencyV2(
    {
      canonicalVersion: 1,
      requestHash: "hash-A",
      state: "SUCCEEDED",
    },
    "hash-A",
  );

  assert.deepEqual(result, { kind: "CONFLICT" });
});

test("UT-S3-D27: rejected request can replay", () => {
  const result = decideOrderIdempotencyV2(
    {
      canonicalVersion: 2,
      requestHash: "hash-A",
      state: "REJECTED",
    },
    "hash-A",
  );

  assert.deepEqual(result, { kind: "REPLAY" });
});
