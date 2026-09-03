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

  it("resolves every TTS provider id to its own adapter", () => {
    const db = migrated();
    const built = registry(db);

    expect(built.tts("elevenlabs").id).toBe("elevenlabs");
    expect(built.tts("openai-tts").id).toBe("openai-tts");
    expect(built.tts("cartesia").id).toBe("cartesia");
    db.close();
  });

  it("resolves every image provider id to its own adapter", () => {
    const db = migrated();
    const built = registry(db);

    expect(built.image("fal").id).toBe("fal");
    expect(built.image("replicate").id).toBe("replicate");
    expect(built.image("openai-image").id).toBe("openai-image");
    db.close();
  });

  it("throws for an id no adapter is built for", () => {
    const db = migrated();
    const built = registry(db);

    expect(() => built.llm("elevenlabs")).toThrow("no llm adapter is registered for elevenlabs");
    expect(() => built.tts("openrouter")).toThrow("no tts adapter is registered for openrouter");
    expect(() => built.image("openrouter")).toThrow(
      "no image adapter is registered for openrouter",
    );
    db.close();
  });

  // `logic/02` invariant again, on the other side of the OpenAI split: the image row's key
  // must never reach the speech endpoint, nor the TTS row's key the images endpoint.
  it("hands each image adapter the key of its own provider row and no other", async () => {
    const db = migrated();
    const save = db.prepare(
      "INSERT INTO provider_keys (provider, key, updated_at) VALUES (?, ?, '2026-09-02T10:00:00.000Z')",
    );
    save.run("fal", "fal-key");
    save.run("replicate", "replicate-key");
    save.run("openai-tts", "openai-tts-key");
    save.run("openai-image", "openai-image-key");
    const sent: string[] = [];
    const built = registry(db, (_input, init) => {
      sent.push(new Headers(init?.headers).get("authorization") ?? "");
      // A 500 with no body: every adapter reports the status and none of them downloads.
      return Promise.resolve(new Response("", { status: 500 }));
    });

    for (const id of ["fal", "replicate", "openai-image"]) {
      await built
        .image(id)
        .generate({
          model: "m",
          prompt: "a rope",
          aspect: "16:9",
          signal: new AbortController().signal,
        })
        .catch(() => undefined);
    }

    expect(sent).toEqual(["Key fal-key", "Bearer replicate-key", "Bearer openai-image-key"]);
    db.close();
  });

  // `logic/02` invariant: "A key is sent only to the provider it belongs to." OpenAI has
  // a TTS row and an image row, so the wrong one reaching the speech endpoint would be a
  // key crossing a provider boundary inside one vendor.
  it("hands each TTS adapter the key of its own provider row and no other", async () => {
    const db = migrated();
    const save = db.prepare(
      "INSERT INTO provider_keys (provider, key, updated_at) VALUES (?, ?, '2026-09-02T10:00:00.000Z')",
    );
    save.run("elevenlabs", "eleven-key");
    save.run("openai-tts", "openai-tts-key");
    save.run("openai-image", "openai-image-key");
    save.run("cartesia", "cartesia-key");
    const sent: string[] = [];
    const built = registry(db, (_input, init) => {
      const headers = new Headers(init?.headers);
      sent.push(
        headers.get("xi-api-key") ?? headers.get("x-api-key") ?? headers.get("authorization") ?? "",
      );
      return Promise.resolve(new Response(new Uint8Array([1]), { status: 200 }));
    });

    for (const id of ["elevenlabs", "openai-tts", "cartesia"]) {
      await built.tts(id).synthesize({
        voiceId: "v1",
        text: "hello",
        signal: new AbortController().signal,
      });
    }

    expect(sent).toEqual(["eleven-key", "Bearer openai-tts-key", "cartesia-key"]);
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
