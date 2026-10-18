import { setTimeout as delay } from "node:timers/promises";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { AssistantCliTurn, AssistantStreamEvent } from "../../kernel/ports/assistant-cli.js";
import type { AllowedCall, RunAllowedCall } from "../../slices/assistant/access.js";
import { cliPreferenceOf } from "../../slices/assistant/repo.js";
import { createTurnTokens } from "../../slices/assistant/tokens.js";
import { type Assistant, createAssistant } from "../../slices/assistant/turn.js";
import { agentBindings, assistantBindings } from "./actor.js";
import { assistantRoutes } from "./assistant.js";

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function harness(
  script?: (turn: AssistantCliTurn) => AsyncIterable<AssistantStreamEvent>,
  runAllowed?: RunAllowedCall,
) {
  const db = openDb(":memory:");
  const clock = fixedClock("2026-10-18T10:00:00.000Z");
  migrate(db, clock);
  let n = 0;
  const tokens = createTurnTokens();
  const assistant: Assistant = createAssistant({
    db,
    ids: { next: () => `id${String(++n)}` },
    clock,
    log: { write: () => undefined },
    emit: () => undefined,
    runCli:
      script ??
      async function* (turn) {
        await new Promise((resolve) => turn.signal.addEventListener("abort", resolve));
        yield { type: "done" };
      },
    clis: async () => ({
      "claude-code": { installed: true, login: "signed-in" },
      codex: { installed: false, login: "unknown" },
    }),
    binaryOf: () => "claude",
    selfUrl: () => "http://127.0.0.1:1",
    container: false,
    tokens,
  });
  cleanups.push(async () => {
    await assistant.stopAll();
    db.close();
  });
  const app = new Hono().route("/api/assistant", assistantRoutes({ db, assistant }, runAllowed));
  const call = (
    path: string,
    init: { method?: string; body?: unknown } = {},
    env?: object,
  ): Promise<Response> =>
    Promise.resolve(
      app.request(
        `/api/assistant${path}`,
        {
          method: init.method ?? "GET",
          ...(init.body === undefined
            ? {}
            : { headers: { "content-type": "application/json" }, body: JSON.stringify(init.body) }),
        },
        env,
      ),
    );
  return { db, app, assistant, call };
}

async function newSession(call: ReturnType<typeof harness>["call"]): Promise<string> {
  const response = await call("/sessions", { method: "POST" });
  expect(response.status).toBe(201);
  const { session } = (await response.json()) as { session: { id: string } };
  return session.id;
}

describe("/api/assistant", () => {
  it("says which CLI it runs on and opens on the latest chat", async () => {
    const { call } = harness();
    const before = await call("");
    expect(await before.json()).toEqual({
      available: true,
      cli: "claude-code",
      reason: null,
      fix: null,
      preference: "auto",
      session: null,
    });
    const id = await newSession(call);
    const after = (await (await call("")).json()) as { session: { id: string } };
    expect(after.session.id).toBe(id);
  });

  it("explains it is unavailable when this copy has no assistant", async () => {
    const db = openDb(":memory:");
    migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
    cleanups.push(() => db.close());
    const app = new Hono().route("/api/assistant", assistantRoutes({ db }));
    const answer = (await (await app.request("/api/assistant")).json()) as {
      available: boolean;
      reason: string;
    };
    expect(answer.available).toBe(false);
    expect(answer.reason).toContain("Restart Slopify");
    expect((await app.request("/api/assistant/sessions", { method: "POST" })).status).toBe(503);
  });

  it("takes a message with 202 at once and refuses a second one while it answers", async () => {
    const { call } = harness();
    const id = await newSession(call);
    const sent = await call(`/sessions/${id}/messages`, {
      method: "POST",
      body: { text: "Which templates do I have?", screen: { path: "/templates" } },
    });
    expect(sent.status).toBe(202);
    expect(await sent.json()).toEqual({ turnId: expect.any(String) });
    const again = await call(`/sessions/${id}/messages`, {
      method: "POST",
      body: { text: "More" },
    });
    expect(again.status).toBe(409);
    expect(await again.text()).toContain("press Stop");
    const stopped = await call(`/sessions/${id}/stop`, { method: "POST" });
    expect(await stopped.json()).toEqual({ stopped: true });
  });

  it("refuses an empty, long or unknown-chat message, and a bad screen", async () => {
    const { call } = harness();
    const id = await newSession(call);
    for (const body of [
      { text: "  " },
      { text: "x".repeat(4001) },
      { text: "ok", screen: { path: "/", projectId: "../x" } },
      { text: "ok", extra: 1 },
    ])
      expect((await call(`/sessions/${id}/messages`, { method: "POST", body })).status).toBe(400);
    const missing = await call("/sessions/nope/messages", { method: "POST", body: { text: "hi" } });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Press New chat");
  });

  it("answers an ask once and says when it is gone", async () => {
    let asked = "";
    const { call, assistant } = harness(async function* (turn) {
      asked =
        assistant.tokens
          .resolve(turn.token)
          ?.ask({ tool: "resume_project", argsHash: "h", text: "Continue." }).id ?? "";
      yield { type: "done" };
    });
    const id = await newSession(call);
    await call(`/sessions/${id}/messages`, { method: "POST", body: { text: "Go" } });
    for (let tries = 0; tries < 100 && asked === ""; tries += 1) await delay(5);
    const denied = await call(`/asks/${asked}`, { method: "POST", body: { answer: "deny" } });
    expect(denied.status).toBe(200);
    expect(await denied.json()).toMatchObject({ ask: { state: "denied" } });
    expect(
      (await call(`/asks/${asked}`, { method: "POST", body: { answer: "allow" } })).status,
    ).toBe(409);
    expect((await call("/asks/nope", { method: "POST", body: { answer: "allow" } })).status).toBe(
      404,
    );
    expect(
      (await call(`/asks/${asked}`, { method: "POST", body: { answer: "maybe" } })).status,
    ).toBe(400);
  });

  it("makes the asked call on Allow with the arguments it was asked with", async () => {
    let asked = "";
    const ran: AllowedCall[] = [];
    const { call, assistant } = harness(
      async function* (turn) {
        if (asked === "")
          asked =
            assistant.tokens.resolve(turn.token)?.ask({
              tool: "resume_project",
              argsHash: "h",
              text: "Continue.",
              args: { id: "p1", body: { baseRevisionId: "r1" } },
            }).id ?? "";
        yield { type: "done" };
      },
      async (allowed) => {
        ran.push(allowed);
        return { ok: true, text: "{}" };
      },
    );
    const id = await newSession(call);
    await call(`/sessions/${id}/messages`, { method: "POST", body: { text: "Go" } });
    for (let tries = 0; tries < 100 && asked === ""; tries += 1) await delay(5);
    await delay(10);
    expect(
      (await call(`/asks/${asked}`, { method: "POST", body: { answer: "allow" } })).status,
    ).toBe(200);
    for (let tries = 0; tries < 100 && ran.length === 0; tries += 1) await delay(5);
    expect(ran).toEqual([
      { sessionId: id, tool: "resume_project", args: { id: "p1", body: { baseRevisionId: "r1" } } },
    ]);
  });

  it("is the person's: an agent or the assistant itself is refused", async () => {
    const { call } = harness();
    const id = await newSession(call);
    for (const env of [agentBindings, assistantBindings]) {
      expect((await call("", {}, env)).status).toBe(403);
      expect(
        (await call("/asks/x", { method: "POST", body: { answer: "allow" } }, env)).status,
      ).toBe(403);
      expect(
        (await call(`/sessions/${id}/messages`, { method: "POST", body: { text: "hi" } }, env))
          .status,
      ).toBe(403);
      expect(
        (await call("/cli", { method: "PUT", body: { preference: "codex" } }, env)).status,
      ).toBe(403);
    }
  });

  it("keeps the CLI the person picks", async () => {
    const { call, db } = harness();
    const response = await call("/cli", { method: "PUT", body: { preference: "codex" } });
    expect(await response.json()).toEqual({ preference: "codex" });
    expect(cliPreferenceOf(db)).toBe("codex");
    expect((await call("/cli", { method: "PUT", body: { preference: "gemini" } })).status).toBe(
      400,
    );
  });
});
