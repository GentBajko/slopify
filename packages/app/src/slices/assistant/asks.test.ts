import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { asksOf, consumeGrant, decideAsk, openAsk } from "./asks.js";
import { argsHash, assistantCostlyTools, isGated } from "./gate.js";

const t0 = new Date("2026-10-18T10:00:00.000Z");
const at = (minutes: number) => new Date(t0.valueOf() + minutes * 60_000);

function db() {
  const one = openDb(":memory:");
  migrate(one, fixedClock(t0.toISOString()));
  for (const id of ["s1", "s2"])
    one
      .prepare(
        "INSERT INTO assistant_sessions(id, cli, created_at, updated_at) VALUES (?,'claude-code',?,?)",
      )
      .run(id, t0.toISOString(), t0.toISOString());
  return one;
}

const call = { sessionId: "s1", tool: "start_rebuild", argsHash: "h1" };
const ask = (id = "k1") => ({ id, ...call, text: "Start a remake. About $0.40." });

describe("isGated", () => {
  it("gates removals, confirmed tools and paid work, nothing else", () => {
    expect(isGated({ name: "delete_template", method: "DELETE" })).toBe(true);
    expect(
      isGated({ name: "keep_project_outputs", method: "POST", confirm: "Removes files." }),
    ).toBe(true);
    for (const name of assistantCostlyTools) expect(isGated({ name, method: "POST" })).toBe(true);
    expect(isGated({ name: "list_templates", method: "GET" })).toBe(false);
    expect(isGated({ name: "update_prompt", method: "PUT" })).toBe(false);
  });
});

describe("argsHash", () => {
  it("ignores confirmed and the retry key, and nothing else", () => {
    const base = { id: "p1", body: { baseRevisionId: "r1", previewId: "v1", idempotencyKey: "a" } };
    expect(
      argsHash({ ...base, confirmed: true, body: { ...base.body, idempotencyKey: "b" } }),
    ).toBe(argsHash(base));
    expect(argsHash({ body: { previewId: "v1", baseRevisionId: "r1" }, id: "p1" })).toBe(
      argsHash(base),
    );
    expect(argsHash({ ...base, body: { ...base.body, previewId: "v2" } })).not.toBe(argsHash(base));
    expect(argsHash({ ...base, id: "p2" })).not.toBe(argsHash(base));
  });
});

describe("asks", () => {
  it("asks once for the same waiting call", () => {
    const d = db();
    expect(openAsk(d, ask("k1"), t0).id).toBe("k1");
    expect(openAsk(d, ask("k2"), at(1)).id).toBe("k1");
    expect(asksOf(d, "s1", at(1))).toHaveLength(1);
  });

  it("uses an Allow once, for that call and session only", () => {
    const d = db();
    openAsk(d, ask(), t0);
    expect(consumeGrant(d, call, at(1))).toBe(false);
    expect(decideAsk(d, "k1", "allow", at(1))).toMatchObject({
      ok: true,
      ask: { state: "allowed" },
    });
    expect(consumeGrant(d, { ...call, sessionId: "s2" }, at(2))).toBe(false);
    expect(consumeGrant(d, { ...call, argsHash: "other" }, at(2))).toBe(false);
    expect(consumeGrant(d, { ...call, tool: "start_draft" }, at(2))).toBe(false);
    expect(consumeGrant(d, call, at(2))).toBe(true);
    expect(consumeGrant(d, call, at(3))).toBe(false);
    expect(asksOf(d, "s1", at(3))[0]?.state).toBe("used");
  });

  it("never turns Don't into a grant, and answers once", () => {
    const d = db();
    openAsk(d, ask(), t0);
    expect(decideAsk(d, "k1", "deny", at(1))).toMatchObject({ ok: true, ask: { state: "denied" } });
    expect(consumeGrant(d, call, at(2))).toBe(false);
    expect(decideAsk(d, "k1", "allow", at(2))).toEqual({ ok: false, reason: "decided" });
    expect(decideAsk(d, "nope", "allow", at(2))).toEqual({ ok: false, reason: "unknown" });
  });

  it("expires an ask nobody answered, and an Allow nobody used, after 15 minutes", () => {
    const d = db();
    openAsk(d, ask("k1"), t0);
    expect(decideAsk(d, "k1", "allow", at(16))).toEqual({ ok: false, reason: "expired" });
    openAsk(d, ask("k2"), at(20));
    decideAsk(d, "k2", "allow", at(21));
    expect(consumeGrant(d, call, at(37))).toBe(false);
    expect(asksOf(d, "s1", at(37)).map((one) => one.state)).toEqual(["expired", "expired"]);
  });
});
