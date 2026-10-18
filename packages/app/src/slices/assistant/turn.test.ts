import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type {
  AssistantCliTurn,
  AssistantStreamEvent,
  RunAssistantCli,
} from "../../kernel/ports/assistant-cli.js";
import type { AssistantCliStates, AssistantEvent } from "./model.js";
import { setCliPreference } from "./repo.js";
import { createTurnTokens } from "./tokens.js";
import { createAssistant } from "./turn.js";

const ready: AssistantCliStates = {
  "claude-code": { installed: true, login: "signed-in" },
  codex: { installed: false, login: "unknown" },
};

type Script = (turn: AssistantCliTurn) => AsyncIterable<AssistantStreamEvent>;

function harness(
  script: Script,
  options: { states?: AssistantCliStates; timeoutMs?: number } = {},
) {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
  const events: AssistantEvent[] = [];
  const turns: AssistantCliTurn[] = [];
  const tokens = createTurnTokens();
  let n = 0;
  const runCli: RunAssistantCli = (turn) => {
    turns.push(turn);
    return script(turn);
  };
  const assistant = createAssistant({
    db,
    ids: { next: () => `id${String(++n).padStart(3, "0")}` },
    clock: fixedClock("2026-10-18T10:00:00.000Z"),
    log: { write: () => undefined },
    emit: (event) => void events.push(event),
    runCli,
    clis: async () => options.states ?? ready,
    binaryOf: (cli) => (cli === "claude-code" ? "claude" : "codex"),
    selfUrl: () => "http://127.0.0.1:6969",
    container: false,
    tokens,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  });
  const settled = async (sessionId: string): Promise<void> => {
    for (let tries = 0; tries < 200; tries += 1) {
      if (assistant.session(sessionId)?.runningTurnId === null) return;
      await delay(5);
    }
    throw new Error("the turn never ended");
  };
  const said = (sessionId: string) =>
    assistant.session(sessionId)?.messages.map((one) => [one.role, one.text]) ?? [];
  return { db, events, turns, tokens, assistant, settled, said };
}

async function* answering(...events: AssistantStreamEvent[]): AsyncGenerator<AssistantStreamEvent> {
  for (const event of events) yield event;
}

// Waits until the turn is stopped, then ends the way an aborted read does.
async function* hanging(turn: AssistantCliTurn): AsyncGenerator<AssistantStreamEvent> {
  yield { type: "partial", text: "Working" };
  await new Promise((resolve) => turn.signal.addEventListener("abort", resolve, { once: true }));
  throw turn.signal.reason;
}

describe("a turn", () => {
  it("answers 202-style at once, then keeps the answer, the tools and the end", async () => {
    let tokenDuring: unknown;
    const h = harness(async function* (turn) {
      tokenDuring = h.tokens.resolve(turn.token);
      yield* answering(
        { type: "partial", text: "Let me" },
        { type: "text", text: "Let me check." },
        { type: "tool", name: "list_templates" },
        { type: "text", text: "You have two." },
        { type: "done" },
      );
    });
    const session = h.assistant.newSession();
    const sent = h.assistant.send(session, "Which templates do I have?", { path: "/templates" });
    expect(sent).toEqual({ ok: true, turnId: expect.any(String) });
    expect(h.said(session)).toEqual([["person", "Which templates do I have?"]]);
    await h.settled(session);
    expect(h.said(session)).toEqual([
      ["person", "Which templates do I have?"],
      ["assistant", "Let me check."],
      ["tool", "list_templates"],
      ["assistant", "You have two."],
    ]);
    expect(h.events.map((event) => event.type)).toEqual([
      "assistant.turn",
      "assistant.delta",
      "assistant.tool",
      "assistant.turn",
    ]);
    expect(h.events.at(-1)).toMatchObject({ state: "done" });
    const [turn] = h.turns;
    expect(turn?.url).toBe("http://127.0.0.1:6969/mcp/assistant");
    expect(turn?.prompt).toContain("Current screen");
    expect(turn?.prompt).toContain("Which templates do I have?");
    expect(turn?.system).toContain("You are Slopify's in-app assistant.");
    expect(tokenDuring).toMatchObject({ sessionId: session });
    expect(h.tokens.resolve(turn?.token ?? "")).toBeUndefined();
  });

  it("replays the chat so far into the next turn", async () => {
    const h = harness(() => answering({ type: "text", text: "Two." }, { type: "done" }));
    const session = h.assistant.newSession();
    h.assistant.send(session, "First?", undefined);
    await h.settled(session);
    h.assistant.send(session, "Second?", undefined);
    await h.settled(session);
    expect(h.turns[1]?.prompt).toContain("Person: First?\nYou: Two.");
    expect(h.turns[1]?.prompt).toContain("The person's new message:\nSecond?");
  });

  it("answers one message per chat and two turns at once", async () => {
    const h = harness(hanging);
    const [a, b, c] = [
      h.assistant.newSession(),
      h.assistant.newSession(),
      h.assistant.newSession(),
    ];
    expect(h.assistant.send(a, "one", undefined).ok).toBe(true);
    expect(h.assistant.send(a, "again", undefined)).toEqual({ ok: false, reason: "busy" });
    expect(h.assistant.send(b, "two", undefined).ok).toBe(true);
    expect(h.assistant.send(c, "three", undefined)).toEqual({ ok: false, reason: "too-many" });
    expect(h.assistant.send("nope", "x", undefined)).toEqual({
      ok: false,
      reason: "unknown-session",
    });
    await h.assistant.stopAll();
  });

  it("stops on Stop, says so, and revokes the token", async () => {
    const h = harness(hanging);
    const session = h.assistant.newSession();
    h.assistant.send(session, "Make it", undefined);
    await delay(20);
    expect(h.assistant.stop(session)).toBe(true);
    await h.settled(session);
    expect(h.turns[0]?.signal.aborted).toBe(true);
    expect(h.said(session).at(-1)).toEqual([
      "error",
      expect.stringContaining("You stopped this answer."),
    ]);
    expect(h.events.at(-1)).toMatchObject({ type: "assistant.turn", state: "stopped" });
    expect(h.tokens.resolve(h.turns[0]?.token ?? "")).toBeUndefined();
    expect(h.assistant.stop(session)).toBe(false);
  });

  it("stops a turn past its time limit", async () => {
    const h = harness(hanging, { timeoutMs: 30 });
    const session = h.assistant.newSession();
    h.assistant.send(session, "Slow", undefined);
    await h.settled(session);
    expect(h.said(session).at(-1)?.[1]).toContain("longer than 10 minutes");
    expect(h.events.at(-1)).toMatchObject({ state: "failed" });
  });

  it("stops every turn at shutdown and waits for them", async () => {
    const h = harness(hanging);
    const session = h.assistant.newSession();
    h.assistant.send(session, "x", undefined);
    await delay(10);
    await h.assistant.stopAll();
    expect(h.assistant.session(session)?.runningTurnId).toBeNull();
    expect(h.said(session).at(-1)?.[1]).toContain("shutting down");
  });

  it("keeps what failed and its fix", async () => {
    const h = harness(() =>
      answering({
        type: "failed",
        message: "Claude Code is not signed in. Run claude auth login.",
      }),
    );
    const session = h.assistant.newSession();
    h.assistant.send(session, "x", undefined);
    await h.settled(session);
    expect(h.said(session).at(-1)).toEqual([
      "error",
      "Claude Code is not signed in. Run claude auth login.",
    ]);
    expect(h.events.at(-1)).toMatchObject({ state: "failed" });
  });

  it("stops at a tool from outside Slopify", async () => {
    const h = harness(() => answering({ type: "foreign", name: "Bash" }, { type: "done" }));
    const session = h.assistant.newSession();
    h.assistant.send(session, "x", undefined);
    await h.settled(session);
    expect(h.said(session).at(-1)?.[1]).toContain("a tool from outside Slopify (Bash)");
  });

  it("says why it can't start, with the fix, and runs no CLI", async () => {
    const h = harness(() => answering({ type: "done" }), {
      states: {
        "claude-code": { installed: false, login: "unknown" },
        codex: { installed: true, login: "signed-out" },
      },
    });
    const session = h.assistant.newSession();
    h.assistant.send(session, "x", undefined);
    await h.settled(session);
    expect(h.said(session).at(-1)?.[1]).toContain(
      "Set up Claude Code or Codex in Settings → Providers.",
    );
    expect(h.turns).toEqual([]);
  });

  it("runs the CLI the person chose", async () => {
    const h = harness(() => answering({ type: "done" }), {
      states: { ...ready, codex: { installed: true, login: "signed-in" } },
    });
    setCliPreference(h.db, "codex");
    const session = h.assistant.newSession();
    h.assistant.send(session, "x", undefined);
    await h.settled(session);
    expect(h.turns[0]).toMatchObject({ cli: "codex", binary: "codex" });
  });

  it("says what failed when the CLI couldn't run at all, without a key in it", async () => {
    const h = harness(() => {
      throw new Error("spawn failed with sk-or-v1-0123456789abcdef0123456789abcdef");
    });
    const session = h.assistant.newSession();
    h.assistant.send(session, "x", undefined);
    await h.settled(session);
    const [, text] = h.said(session).at(-1) ?? [];
    expect(text).toContain("Slopify couldn't run the assistant's CLI");
    expect(text).not.toContain("0123456789abcdef0123456789abcdef");
  });
});

describe("ask first", () => {
  it("shows the ask, and after Allow asks the CLI to call the tool again", async () => {
    let calls = 0;
    const h = harness(async function* (turn) {
      calls += 1;
      if (calls === 1) {
        h.tokens
          .resolve(turn.token)
          ?.ask({ tool: "start_rebuild", argsHash: "h", text: "Start a remake. $0.40." });
        yield { type: "text", text: "I asked you first." };
      }
      yield { type: "done" };
    });
    const session = h.assistant.newSession();
    h.assistant.send(session, "Remake it", undefined);
    await h.settled(session);
    const ask = h.assistant.session(session)?.asks[0];
    expect(ask).toMatchObject({ tool: "start_rebuild", state: "asked" });
    expect(h.said(session)).toContainEqual(["ask", "Start a remake. $0.40."]);
    expect(h.events).toContainEqual(
      expect.objectContaining({ type: "assistant.ask", askId: ask?.id, state: "asked" }),
    );
    expect(h.assistant.answer(ask?.id ?? "", "allow")).toMatchObject({ ok: true });
    await delay(5);
    await h.settled(session);
    expect(h.turns).toHaveLength(2);
    expect(h.turns[1]?.prompt).toContain("Call start_rebuild again now with confirmed: true");
    expect(h.said(session)).toContainEqual(["person", "Allowed: Start a remake. $0.40."]);
    expect(h.assistant.answer(ask?.id ?? "", "deny")).toEqual({ ok: false, reason: "decided" });
  });

  it("starts nothing on Don't", async () => {
    const h = harness(async function* (turn) {
      h.tokens
        .resolve(turn.token)
        ?.ask({ tool: "resume_project", argsHash: "h", text: "Continue." });
      yield { type: "done" };
    });
    const session = h.assistant.newSession();
    h.assistant.send(session, "Go", undefined);
    await h.settled(session);
    const ask = h.assistant.session(session)?.asks[0];
    expect(h.assistant.answer(ask?.id ?? "", "deny")).toMatchObject({
      ok: true,
      ask: { state: "denied" },
    });
    await delay(10);
    expect(h.turns).toHaveLength(1);
  });

  it("waits for the asking turn to end before the follow-up", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const h = harness(async function* (turn) {
      calls += 1;
      if (calls === 1) {
        h.tokens
          .resolve(turn.token)
          ?.ask({ tool: "resume_project", argsHash: "h", text: "Continue." });
        await gate;
      }
      yield { type: "done" };
    });
    const session = h.assistant.newSession();
    h.assistant.send(session, "Go", undefined);
    await delay(10);
    const ask = h.assistant.session(session)?.asks[0];
    h.assistant.answer(ask?.id ?? "", "allow");
    expect(h.turns).toHaveLength(1);
    expect(h.assistant.send(session, "more", undefined)).toEqual({ ok: false, reason: "busy" });
    release();
    await delay(20);
    await h.settled(session);
    expect(h.turns).toHaveLength(2);
  });
});
