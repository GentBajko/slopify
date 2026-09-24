import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { cliBinary, saveCliPath } from "./cli-paths.js";
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
  it("uses host readiness and rejects path changes without erasing native overrides", async () => {
    const deps = harness(installed);
    await saveCliPath(deps, "codex", process.execPath);
    const host = {
      ...deps,
      probe: async () => {
        throw new Error("Container probe");
      },
      hostCliStatus: async (id: import("../../kernel/ports/host-cli.js").HostCliId) => ({
        id,
        command: "/host/codex",
        installed: true,
        login: "signed-out" as const,
        issueKind: "login" as const,
        issue: "Sign in on the host.",
      }),
    };
    try {
      expect(statusOf(await providerStatuses(host), "codex")).toMatchObject({
        cliPath: { configured: null, command: "/host/codex", managedOnHost: true },
        readiness: { issueKind: "login", issue: "Sign in on the host." },
      });
      expect(await saveCliPath(host, "codex", "/never-stat-this")).toMatchObject({
        ok: false,
        message: expect.stringContaining("host"),
      });
      expect(cliBinary(deps.db, "codex")).toBe(process.execPath);
    } finally {
      deps.db.close();
    }
  });
  // Listed, not hidden, so Play can grey a row with a reason.
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

  // A CLI provider is ready when its binary answers, and a key is never involved.
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

  it("shares Codex readiness and the saved executable across text and images", async () => {
    const deps = harness(async () => ({ ran: true, stdout: "codex-cli 0.148.0" }));
    await saveCliPath(deps, "codex", process.execPath);
    const statuses = await providerStatuses(deps);
    const text = statuses.find((row) => row.id === "codex");
    const image = statuses.find((row) => row.id === "codex-image");
    expect(image).toMatchObject({
      family: "image",
      cliPath: text?.cliPath,
      readiness: text?.readiness,
    });
    expect(image?.readiness).toMatchObject({ issue: expect.stringContaining("0.149.1") });
    deps.db.close();
  });

  it("probes each CLI provider's own binary and nothing else", async () => {
    const probed: string[] = [];
    const probe: CliProbe = (binary) => {
      probed.push(binary);
      return Promise.resolve({ ran: false, stdout: "" });
    };

    await providerStatuses(harness(probe));

    expect(probed.toSorted()).toEqual(["claude", "codex", "gemini"]);
  });

  it("reports saved command paths and probes the latest override", async () => {
    const probed: string[] = [];
    const deps = harness(async (binary) => {
      probed.push(binary);
      return { ran: true, stdout: "0.16.0" };
    });
    await saveCliPath(deps, "gemini", process.execPath);
    probed.length = 0;
    const statuses = await providerStatuses(deps);
    expect(probed).toContain(process.execPath);
    expect(probed).not.toContain("gemini");
    expect(statusOf(statuses, "gemini")).toMatchObject({
      displayName: "Gemini CLI",
      cliPath: { configured: process.execPath, command: process.execPath },
      readiness: { installed: true, version: "0.16.0" },
    });
    expect(statusOf(statuses, "codex").cliPath).toEqual({ configured: null, command: "codex" });
    expect(statusOf(statuses, "openrouter").cliPath).toBeUndefined();
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
