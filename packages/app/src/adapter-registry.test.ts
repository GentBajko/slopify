import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "./adapter-registry.js";
import type { CliRun } from "./adapters/llm/run-cli.js";
import { fixedClock, manualClock } from "./kernel/clock.fake.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import type { Log } from "./kernel/log.js";
import type { LlmPort } from "./kernel/ports/llm.js";
import type { Registry } from "./kernel/ports/registry.js";
import type {
  Attempt,
  AttemptEnd,
  AttemptStart,
  AttemptStore,
} from "./kernel/runner/attempt-repo.js";
import type { StageContext } from "./kernel/runner/index.js";
import { stageProviders } from "./kernel/runner/providers.js";
import type { CliProbe } from "./slices/settings/cli-status.js";
import { providerIds } from "./slices/settings/model.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const silent: Log = { write: (): void => {} };

// Nothing in this file may reach the network or spawn a binary: the CLIs cost money and
// there is no key to call OpenRouter with (06-testing Doubles, "no live provider calls").
const refuseFetch: typeof globalThis.fetch = () => {
  throw new Error("the registry test made a request");
};
const refuseSpawn = (): CliRun => {
  throw new Error("the registry test spawned a CLI");
};
const notInstalled: CliProbe = () => Promise.resolve({ ran: false, stdout: "" });

function migrated(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  return db;
}

function registry(db: DatabaseSync, fetcher: typeof globalThis.fetch = refuseFetch): Registry {
  return buildRegistry({ db, fetch: fetcher, spawn: refuseSpawn, clock, probe: notInstalled });
}

interface Recorder extends AttemptStore {
  readonly rows: readonly Attempt[];
}

function recorder(): Recorder {
  const rows: Attempt[] = [];
  return {
    rows,
    start: (start: AttemptStart): string => {
      const id = `a${rows.length + 1}`;
      rows.push({ ...start, id, endedAt: null, outcome: null, errorText: null });
      return id;
    },
    end: (id: string, ended: AttemptEnd): void => {
      const at = rows.findIndex((row) => row.id === id);
      const row = rows[at];
      if (row !== undefined) {
        rows[at] = { ...row, ...ended };
      }
    },
  };
}

// The 400 above means the first `next()` throws, so nothing is ever yielded.
async function drain(port: LlmPort): Promise<void> {
  for await (const _event of port.complete({
    model: "openai/gpt-5",
    messages: [{ role: "user", content: "hello" }],
    signal: new AbortController().signal,
  })) {
    throw new Error("the stub answered 400 and should have yielded nothing");
  }
}

function context(signal: AbortSignal): StageContext {
  return {
    stage: { id: "s1", projectId: "p1", kind: "research", state: "running" },
    signal,
    emit: (): void => {},
  };
}

describe("buildRegistry", () => {
  it("resolves every LLM provider id to its own adapter", () => {
    const db = migrated();
    const built = registry(db);

    expect(built.llm("openrouter").id).toBe("openrouter");
    expect(built.llm("claude-code").id).toBe("claude-code");
    expect(built.llm("codex").id).toBe("codex");
    db.close();
  });

  it("throws for an id no adapter is built for", () => {
    const db = migrated();
    const built = registry(db);

    expect(() => built.llm("elevenlabs")).toThrow("no llm adapter is registered for elevenlabs");
    expect(() => built.tts("elevenlabs")).toThrow("no tts adapter is registered for elevenlabs");
    expect(() => built.image("fal")).toThrow("no image adapter is registered for fal");
    db.close();
  });

  // `logic/02` step 5 and §Q135: every supported provider is listed, keyed or not, found
  // or not.
  it("lists the whole catalogue with each provider's readiness", async () => {
    const db = migrated();
    db.prepare("INSERT INTO provider_keys (provider, key, updated_at) VALUES (?, ?, ?)").run(
      "openrouter",
      "sk-or-v1-not-a-real-key",
      "2026-09-02T10:00:00.000Z",
    );

    const listed = await registry(db).list();

    expect(listed.map((one) => one.id)).toEqual([...providerIds]);
    expect(listed.find((one) => one.id === "openrouter")).toEqual({
      family: "llm",
      id: "openrouter",
      name: "OpenRouter",
      readiness: { kind: "keyed", hasKey: true },
    });
    expect(listed.find((one) => one.id === "elevenlabs")?.readiness).toEqual({
      kind: "keyed",
      hasKey: false,
    });
    expect(listed.find((one) => one.id === "codex")?.readiness).toEqual({
      kind: "cli",
      installed: false,
    });
    db.close();
  });

  // `logic/02` §Q13: "the next attempt finds no key, fails immediately without retries".
  it("fails a call with no key on the first attempt, without calling the provider", async () => {
    const db = migrated();
    let requests = 0;
    const beat = manualClock("2026-09-02T10:00:00.000Z");
    const attempts = recorder();
    const controller = new AbortController();
    const providers = stageProviders(
      {
        registry: registry(db, () => {
          requests += 1;
          return Promise.resolve(new Response(null, { status: 200 }));
        }),
        attempts,
        clock: beat,
        log: silent,
      },
      context(controller.signal),
    );

    await expect(
      beat.settle(
        providers.llm({
          provider: "openrouter",
          model: "openai/gpt-5",
          messages: [{ role: "user", content: "hello" }],
        }),
      ),
    ).rejects.toThrow("no OpenRouter key is stored");

    expect(attempts.rows).toHaveLength(1);
    expect(attempts.rows[0]?.outcome).toBe("missing_key");
    expect(requests).toBe(0);
    // No backoff was served: the clock never moved.
    expect(beat.now().toISOString()).toBe("2026-09-02T10:00:00.000Z");
    db.close();
  });

  // `logic/02` §Q16: the key is read at the moment the attempt starts, so one saved after
  // the registry was built still reaches the next call.
  it("reads the key the database holds when the call is made", async () => {
    const db = migrated();
    const sent: string[] = [];
    const built = registry(db, (_input, init) => {
      sent.push(new Headers(init?.headers).get("authorization") ?? "none");
      return Promise.resolve(new Response("{}", { status: 400 }));
    });
    // Saved after the registry was built, so a key the adapter had closed over would not
    // be this one.
    db.prepare("INSERT INTO provider_keys (provider, key, updated_at) VALUES (?, ?, ?)").run(
      "openrouter",
      "later-key",
      "2026-09-02T10:00:00.000Z",
    );

    await expect(drain(built.llm("openrouter"))).rejects.toThrow("OpenRouter answered 400");

    expect(sent).toEqual(["Bearer later-key"]);
    db.close();
  });
});
