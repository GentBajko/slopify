import { expect, it } from "vitest";
import { type CheckpointResult, createCheckpointAuthority } from "./checkpoint-authority.js";

const identity = { revisionId: "revision", fingerprint: "inputs", idempotencyKey: "approval" };

it("wakes once after successful committed release, never for duplicate or refused approvals", () => {
  let committed = false;
  const wakes: string[] = [];
  const authority = createCheckpointAuthority({
    decide: () => ({ kind: "eligible" }),
    approve: (_projectId, _checkpointId, input): CheckpointResult<string> => {
      if (input.fingerprint !== identity.fingerprint) return { ok: false, reason: "conflict" };
      if (committed) return { ok: false, reason: "duplicate", value: "released" };
      committed = true;
      return { ok: true, value: "released" };
    },
    inTransaction: () => false,
    wake: (id) => {
      expect(committed).toBe(true);
      wakes.push(id);
    },
    log: { write: () => undefined },
  });
  expect(authority.release("project", "audio", { ...identity, fingerprint: "old" })).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(authority.release("project", "audio", identity)).toEqual({ ok: true, value: "released" });
  expect(authority.release("project", "audio", identity)).toEqual({
    ok: false,
    reason: "duplicate",
    value: "released",
  });
  expect(wakes).toEqual(["project"]);
});

it("refuses release inside a caller transaction before approving or waking", () => {
  const authority = createCheckpointAuthority({
    decide: () => ({ kind: "eligible" }),
    approve: () => {
      throw new Error("must not approve inside another transaction");
    },
    inTransaction: () => true,
    wake: () => {
      throw new Error("must not wake uncommitted work");
    },
    log: { write: () => undefined },
  });
  expect(authority.release("project", "audio", identity)).toEqual({
    ok: false,
    reason: "conflict",
  });
});

it("retains committed success and logs a failed wake", () => {
  const logged: string[] = [];
  const authority = createCheckpointAuthority({
    decide: () => ({ kind: "eligible" }),
    approve: () => ({ ok: true, value: "released" }),
    inTransaction: () => false,
    wake: () => {
      throw new Error("standings unavailable");
    },
    log: { write: (_level, event) => logged.push(event) },
  });
  expect(authority.release("project", "audio", identity)).toEqual({ ok: true, value: "released" });
  expect(logged).toEqual(["checkpoint.wake"]);
});
