import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { KeysDeps } from "./keys.js";
import { keyForAttempt, removeProviderKey, saveProviderKey } from "./keys.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };

// Not a key, and shaped so it cannot be mistaken for one: no provider prefix, no length.
const standIn = "unit-test-placeholder";

function deps(): KeysDeps {
  const db: DatabaseSync = openDb(":memory:");
  migrate(db, clock);
  return { db, clock };
}

describe("saveProviderKey", () => {
  it("stores the value as given, trimmed", () => {
    const keys = deps();

    expect(saveProviderKey(keys, "openrouter", `  ${standIn}  `)).toEqual({ ok: true });

    expect(keyForAttempt(keys, "openrouter")).toEqual({ ok: true, key: standIn });
  });

  it("overwrites the provider's single key", () => {
    const keys = deps();

    saveProviderKey(keys, "elevenlabs", standIn);
    saveProviderKey(keys, "elevenlabs", `${standIn}-2`);

    expect(keyForAttempt(keys, "elevenlabs")).toEqual({ ok: true, key: `${standIn}-2` });
    expect(keys.db.prepare("SELECT count(*) AS n FROM provider_keys").get()).toEqual({ n: 1 });
  });

  it("refuses a value that is blank once trimmed", () => {
    const keys = deps();

    expect(saveProviderKey(keys, "openrouter", "   ")).toEqual({ ok: false, reason: "blank" });
    expect(keyForAttempt(keys, "openrouter")).toEqual({ ok: false, reason: "key-missing" });
  });

  // A local agent CLI signs in through its own login; there is nothing to store.
  it("refuses a key for a CLI provider", () => {
    const keys = deps();

    expect(saveProviderKey(keys, "claude-code", standIn)).toEqual({
      ok: false,
      reason: "cli-provider",
    });
    expect(keys.db.prepare("SELECT count(*) AS n FROM provider_keys").get()).toEqual({ n: 0 });
  });
});

describe("removeProviderKey", () => {
  it("deletes the key", () => {
    const keys = deps();
    saveProviderKey(keys, "fal", standIn);

    expect(removeProviderKey(keys, "fal")).toEqual({ ok: true });
    expect(keyForAttempt(keys, "fal")).toEqual({ ok: false, reason: "key-missing" });
  });

  it("says so when there was nothing to remove", () => {
    expect(removeProviderKey(deps(), "fal")).toEqual({ ok: false, reason: "absent" });
  });

  it("refuses for a CLI provider", () => {
    expect(removeProviderKey(deps(), "codex")).toEqual({ ok: false, reason: "cli-provider" });
  });
});

describe("keyForAttempt", () => {
  // logic/02 §Q16: an attempt reads the key once, at its start. The value it got is a
  // plain string, so a removal landing mid-attempt cannot reach back into it; the next
  // attempt is the one that finds the key gone.
  it("hands an in-flight attempt a value a later removal cannot change", () => {
    const keys = deps();
    saveProviderKey(keys, "cartesia", standIn);

    const inFlight = keyForAttempt(keys, "cartesia");
    removeProviderKey(keys, "cartesia");

    expect(inFlight).toEqual({ ok: true, key: standIn });
    expect(keyForAttempt(keys, "cartesia")).toEqual({ ok: false, reason: "key-missing" });
  });

  it("reads the row again on every attempt, so a replacement reaches the next one", () => {
    const keys = deps();
    saveProviderKey(keys, "cartesia", standIn);
    const first = keyForAttempt(keys, "cartesia");

    saveProviderKey(keys, "cartesia", `${standIn}-2`);

    expect(first).toEqual({ ok: true, key: standIn });
    expect(keyForAttempt(keys, "cartesia")).toEqual({ ok: true, key: `${standIn}-2` });
  });

  it("reports a CLI provider as having no key to read", () => {
    expect(keyForAttempt(deps(), "claude-code")).toEqual({ ok: false, reason: "cli-provider" });
  });
});
