import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { CliProbe } from "./cli-status.js";
import { saveProviderKey } from "./keys.js";
import type { ProviderId, ProviderStatus } from "./model.js";
import { providerIds } from "./model.js";
import type { ReadinessDeps } from "./readiness.js";
import { providerStatuses } from "./readiness.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const standIn = "unit-test-placeholder";

const installed: CliProbe = (binary) => Promise.resolve({ ran: true, stdout: `${binary} 1.2.3` });
const notFound: CliProbe = () => Promise.resolve({ ran: false, stdout: "" });

function harness(probe: CliProbe): ReadinessDeps {
  const db: DatabaseSync = openDb(":memory:");
  migrate(db, clock);
  return { db, probe };
}

function statusOf(statuses: readonly ProviderStatus[], id: ProviderId): ProviderStatus {
  const match = statuses.find((status) => status.id === id);
  if (match === undefined) {
    throw new Error(`${id} is not in the status list`);
  }
  return match;
}

describe("providerStatuses", () => {
  // `logic/02` step 5: listed, not hidden, so Play can grey a row with a reason.
  it("lists every supported provider whether it is ready or not", async () => {
    const statuses = await providerStatuses(harness(notFound));

    expect(statuses.map((status) => status.id)).toEqual([...providerIds]);
  });

  it("reports a keyed provider with no key as having none", async () => {
    const statuses = await providerStatuses(harness(notFound));

    expect(statusOf(statuses, "openrouter").readiness).toEqual({ kind: "keyed", hasKey: false });
  });

  it("reports a keyed provider with a key as having one", async () => {
    const deps = harness(notFound);
    saveProviderKey({ db: deps.db, clock }, "elevenlabs", standIn);

    const statuses = await providerStatuses(deps);

    expect(statusOf(statuses, "elevenlabs").readiness).toEqual({ kind: "keyed", hasKey: true });
  });

  it("keys one provider without keying another", async () => {
    const deps = harness(notFound);
    saveProviderKey({ db: deps.db, clock }, "elevenlabs", standIn);

    const statuses = await providerStatuses(deps);

    expect(statusOf(statuses, "cartesia").readiness).toEqual({ kind: "keyed", hasKey: false });
  });

  it("forgets the key once it is removed", async () => {
    const deps = harness(notFound);
    saveProviderKey({ db: deps.db, clock }, "fal", standIn);
    deps.db.prepare("DELETE FROM provider_keys WHERE provider = 'fal'").run();

    const statuses = await providerStatuses(deps);

    expect(statusOf(statuses, "fal").readiness).toEqual({ kind: "keyed", hasKey: false });
  });

  // §Q135: a CLI provider is ready when its binary answers, and a key is never involved.
  it("reports a CLI provider whose binary answers as installed", async () => {
    const statuses = await providerStatuses(harness(installed));

    expect(statusOf(statuses, "claude-code").readiness).toEqual({
      kind: "cli",
      installed: true,
      version: "1.2.3",
    });
    expect(statusOf(statuses, "codex").readiness).toEqual({
      kind: "cli",
      installed: true,
      version: "1.2.3",
    });
  });

  it("reports a CLI provider whose binary is missing as not installed", async () => {
    const statuses = await providerStatuses(harness(notFound));

    expect(statusOf(statuses, "claude-code").readiness).toEqual({ kind: "cli", installed: false });
  });

  it("probes each CLI provider's own binary and nothing else", async () => {
    const probed: string[] = [];
    const probe: CliProbe = (binary) => {
      probed.push(binary);
      return Promise.resolve({ ran: false, stdout: "" });
    };

    await providerStatuses(harness(probe));

    expect(probed.toSorted()).toEqual(["claude", "codex"]);
  });

  it("carries each provider's family and display name for the grouped rails", async () => {
    const statuses = await providerStatuses(harness(notFound));

    expect(statusOf(statuses, "openrouter")).toEqual({
      id: "openrouter",
      family: "llm",
      displayName: "OpenRouter",
      readiness: { kind: "keyed", hasKey: false },
    });
  });
});
