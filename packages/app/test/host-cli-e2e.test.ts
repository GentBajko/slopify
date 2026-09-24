import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHostCliClient } from "../src/adapters/host-cli/index.js";
import { nodeRunCli } from "../src/adapters/llm/run-cli.js";
import { ensureBridgeToken, prepareHostPaths } from "../src/host-cli/paths.js";
import { createHostRuntime } from "../src/host-cli/runtime.js";
import { startHostServer } from "../src/host-cli/server.js";
import { resolveHostCommand } from "../src/host-cli/status.js";
import { systemClock } from "../src/kernel/clock.js";
import type { LlmEvent } from "../src/kernel/ports/llm.js";
import { attempt } from "../src/kernel/runner/attempt.js";
import { sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import { nodeCliProbe } from "../src/slices/settings/cli-status.js";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
});
const evidence = z.object({
  provider: z.string(),
  pid: z.number(),
  child: z.number().optional(),
  uid: z.number(),
  cwd: z.string(),
  home: z.string(),
  held: z.string().optional(),
  documents: z.array(z.object({ id: z.string(), sha256: z.string() })),
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "sb-e2e-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const home = join(root, "home");
  const bin = join(home, "bin");
  await mkdir(bin, { recursive: true });
  await writeFile(join(home, "fixture-only"), "test-owned home");
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
    "hex",
  );
  await writeFile(join(home, "image.png"), png);
  const script = await readFile(new URL("./fixtures/host-cli.cjs", import.meta.url), "utf8");
  for (const name of ["claude", "codex", "gemini"]) {
    const path = join(bin, name);
    await writeFile(path, `#!${process.execPath}\n${script}`);
    await chmod(path, 0o700);
  }
  await mkdir(join(home, ".codex"));
  await writeFile(
    join(home, ".codex/models_cache.json"),
    JSON.stringify({
      models: [{ slug: "gpt-test", display_name: "GPT Test", visibility: "list" }],
    }),
  );
  const gemini = join(bin, "node_modules/@google/gemini-cli-core/dist/src/config");
  await mkdir(gemini, { recursive: true });
  await writeFile(
    join(gemini, "models.js"),
    'export const DEFAULT_GEMINI_FLASH_MODEL = "gemini-3.8-flash";',
  );
  vi.stubEnv("HOME", home);
  vi.stubEnv("CODEX_HOME", join(home, ".codex"));
  vi.stubEnv("CLAUDE_CONFIG_DIR", join(home, ".claude"));
  vi.stubEnv("PATH", bin);
  vi.stubEnv("SLOPIFY_CODEX_MODELS_FILE", undefined);
  const paths = await prepareHostPaths(join(root, "bridge"));
  const token = await ensureBridgeToken(paths.tokenFile);
  const ports = createHostRuntime({
    run: nodeRunCli,
    probe: nodeCliProbe,
    env: process.env,
    now: Date.now,
    resolve: (id) => resolveHostCommand(id, process.env),
  });
  const client = createHostCliClient({ directory: paths.share });
  const start = async () => {
    const server = await startHostServer({
      directory: paths.share,
      token,
      version: "1.4.0",
      ports,
    });
    cleanups.push(server.stop);
    return server;
  };
  const calls = async () =>
    (await readFile(join(home, "calls.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => evidence.parse(JSON.parse(line)));
  return { root, home, png, paths, token, ports, client, start, calls };
}
async function collect(source: AsyncIterable<LlmEvent>) {
  const events: LlmEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}
const request = (text: string, signal = AbortSignal.timeout(10_000)) => ({
  model: "fixture",
  messages: [{ role: "user" as const, content: text }],
  signal,
});
function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(process.platform === "win32")("real host processes over the Unix bridge", () => {
  it.each(["claude-code", "codex", "gemini"] as const)(
    "delivers independent documents intact through %s and the real reader",
    async (id) => {
      const f = await fixture();
      await f.start();
      const documents = [
        {
          id: "research-1",
          title: "Original report",
          content: `${"ç🌊".repeat(50000)}\nSources\nhttps://one.test`,
        },
        { id: "editorial-notes", title: "Editorial notes", content: "Keep the originals." },
      ];
      const events = await collect(
        f.client
          .llm(id)
          .complete({ ...request("Write an article from all attached documents."), documents }),
      );
      expect(events).toContainEqual({ type: "delta", text: "Host fixture answer." });
      expect((await f.calls())[0]?.documents).toEqual(
        documents.map((d) => ({
          id: d.id,
          sha256: createHash("sha256").update(d.content).digest("hex"),
        })),
      );
      for (const call of await f.calls()) expect(existsSync(call.cwd)).toBe(false);
    },
  );
  it("admits five generations, refuses a sixth, and drains them on shutdown", async () => {
    const f = await fixture();
    const server = await f.start();
    const results = Array.from({ length: 5 }, () =>
      collect(f.client.llm("codex").complete(request("HOLD_CANCEL"))).catch(
        (error: unknown) => error,
      ),
    );
    await expect.poll(async () => (await f.calls()).length).toBe(5);
    await expect(collect(f.client.llm("codex").complete(request("sixth")))).rejects.toMatchObject({
      fault: { kind: "unavailable" },
    });
    expect(await f.calls()).toHaveLength(5);
    await server.stop();
    expect((await Promise.all(results)).every((result) => result instanceof Error)).toBe(true);
    for (const call of await f.calls()) {
      await expect.poll(() => alive(call.pid) || existsSync(call.cwd)).toBe(false);
    }
  });
  it("stops the host process when a stream consumer leaves early", async () => {
    const f = await fixture();
    await f.start();
    for await (const _ of f.client.llm("codex").complete(request("HOLD_CANCEL"))) break;
    const call = (await f.calls())[0];
    if (!call) throw new Error("Missing fixture process");
    await expect.poll(() => alive(call.pid)).toBe(false);
    await expect.poll(() => existsSync(call.cwd)).toBe(false);
  });
  it.each(["canceled", "unavailable"] as const)(
    "records %s once when a submitted host call is aborted",
    async (outcome) => {
      const f = await fixture();
      await f.start();
      const parent = new AbortController();
      let now = Date.now();
      let expire = () => {};
      const rows: unknown[] = [];
      const result = attempt(
        {
          work: {
            projectId: "p",
            revisionId: "r",
            workId: "w",
            stageId: "s",
            kind: "article",
            fingerprint: "f",
          },
          maySubmit: () => true,
          clock: {
            now: () => new Date(now),
            sleep: async (_ms, signal) =>
              new Promise<void>((resolve, reject) => {
                expire = resolve;
                signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
              }),
          },
          log: { write: () => {} },
          attempts: {
            start: () => {
              rows.push("started");
              return "a1";
            },
            end: (_id, row) => rows.push(row),
          },
          projectId: "p",
          stage: "article",
          stageId: "s",
          signal: parent.signal,
        },
        (signal) => collect(f.client.llm("codex").complete(request("HOLD_CANCEL", signal))),
        { kind: "llm", streaming: true },
      ).catch((error: unknown) => error);
      await expect.poll(async () => (await f.calls()).length).toBe(1);
      if (outcome === "canceled") parent.abort();
      else {
        now += 120_001;
        expire();
      }
      expect(await result).toBeInstanceOf(Error);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ outcome });
      const call = (await f.calls())[0];
      if (!call) throw new Error("Missing fixture process");
      await expect.poll(() => alive(call.pid)).toBe(false);
      expect(await f.calls()).toHaveLength(1);
    },
  );
  it("returns host metadata, prose and image bytes; reconnects after helper restart", async () => {
    const f = await fixture();
    const server = await f.start();
    for (const id of ["claude-code", "codex", "gemini"] as const) {
      expect(await f.client.status(id)).toMatchObject({
        installed: true,
        login: id === "gemini" ? "unknown" : "signed-in",
      });
      expect((await f.client.llm(id).models()).length).toBeGreaterThan(0);
      expect(await collect(f.client.llm(id).complete(request("hello")))).toContainEqual({
        type: "delta",
        text: "Host fixture answer.",
      });
    }
    expect(
      await f.client.image.generate({
        model: "codex-imagegen",
        prompt: "test",
        aspect: "16:9",
        signal: AbortSignal.timeout(5000),
      }),
    ).toEqual({ bytes: f.png, mime: "image/png" });
    const calls = await f.calls();
    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.uid).toBe(process.getuid?.());
      expect(call.home).toBe(f.home);
      expect(call.cwd).not.toBe(process.cwd());
      expect(existsSync(call.cwd)).toBe(false);
      expect(alive(call.pid)).toBe(false);
    }
    await server.stop();
    await f.start();
    await collect(f.client.llm("codex").complete(request("new operation")));
    expect(await f.calls()).toHaveLength(5);
  });

  it("cancels one process group without canceling a concurrent job", async () => {
    const f = await fixture();
    await f.start();
    const cancel = new AbortController();
    const canceled = collect(
      f.client.llm("codex").complete(request("HOLD_CANCEL", cancel.signal)),
    ).catch((error: unknown) => error);
    const finishes = collect(f.client.llm("codex").complete(request("HOLD_FINISH")));
    await expect.poll(async () => (await f.calls()).length).toBe(2);
    const calls = await f.calls();
    const stopped = calls.find((c) => c.held === "HOLD_CANCEL");
    const other = calls.find((c) => c.held === "HOLD_FINISH");
    if (!stopped || !other || !stopped.child) throw new Error("Missing fixture process");
    cancel.abort();
    expect(await canceled).toBeInstanceOf(Error);
    await expect.poll(() => alive(stopped.pid) || alive(stopped.child ?? 0)).toBe(false);
    expect(alive(other.pid)).toBe(true);
    await writeFile(join(f.home, "finish"), "done");
    expect(await finishes).toContainEqual({ type: "delta", text: "Host fixture answer." });
    await expect.poll(() => existsSync(stopped.cwd)).toBe(false);
    expect(existsSync(other.cwd)).toBe(false);
  });

  it("persists one unavailable attempt and never resubmits after an accepted response is lost", async () => {
    const f = await fixture();
    const server = createServer((req, res) => {
      if (req.url === "/v1/health") {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ protocol: 1, version: "1.4.0", active: 0, accepting: true }));
        return;
      }
      req.resume();
      void (async () => {
        for await (const _ of f.ports.llm("codex").complete(request("HOLD_DROP"))) {
          res.destroy();
          break;
        }
      })();
    });
    await new Promise<void>((resolve) => server.listen(f.paths.socket, resolve));
    cleanups.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const db = new DatabaseSync(join(f.root, "attempts.db"));
    cleanups.push(() => db.close());
    db.exec(
      "CREATE TABLE attempts (id TEXT, stage_id TEXT, piece_id TEXT, n INTEGER, started_at TEXT, ended_at TEXT, outcome TEXT, error_text TEXT); CREATE TABLE stages (id TEXT, attempt_count INTEGER);",
    );
    const store = sqliteAttempts(db, { next: randomUUID });
    await expect(
      attempt(
        {
          work: {
            projectId: "p",
            revisionId: "r",
            workId: "w",
            stageId: "s",
            kind: "article",
            fingerprint: "f",
          },
          maySubmit: () => true,
          clock: systemClock,
          log: { write: () => {} },
          attempts: { start: ({ work: _work, ...row }) => store.start(row), end: store.end },
          projectId: "p",
          stage: "article",
          stageId: "s",
          signal: AbortSignal.timeout(10_000),
        },
        (signal) => collect(f.client.llm("codex").complete(request("HOLD_DROP", signal))),
        { kind: "llm", streaming: true },
      ),
    ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
    expect(db.prepare("SELECT n, outcome FROM attempts").all()).toEqual([
      { n: 1, outcome: "unavailable" },
    ]);
    expect(await f.calls()).toHaveLength(1);
    const call = (await f.calls())[0];
    if (!call) throw new Error("Missing fixture process");
    await expect.poll(() => alive(call.pid)).toBe(false);
  });
});
