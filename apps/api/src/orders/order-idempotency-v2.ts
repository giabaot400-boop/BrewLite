export type ExistingOrderRequestV2 = {
  canonicalVersion: number;
  requestHash: string;
  state: "SUCCEEDED" | "REJECTED";
};

export type IdempotencyV2Decision =
  | { kind: "NEW" }
  | { kind: "REPLAY" }
  | { kind: "CONFLICT" };

export function decideOrderIdempotencyV2(
  existing: ExistingOrderRequestV2 | null,
  requestHash: string,
): IdempotencyV2Decision {
  if (existing === null) {
    return { kind: "NEW" };
  }

  if (existing.canonicalVersion !== 2 || existing.requestHash !== requestHash) {
    return { kind: "CONFLICT" };
  }

  return { kind: "REPLAY" };
}
