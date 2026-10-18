import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { askWindowMs } from "./gate.js";
import { type AssistantAsk, askStates } from "./model.js";

// What the assistant asked the person first, and their answer. An Allow is a grant for that
// one call: used once, within 15 minutes, in the session it was asked in.

const askRow = z.object({
  id: z.string(),
  session_id: z.string(),
  tool: z.string(),
  text: z.string(),
  state: z.enum(askStates),
  created_at: z.string(),
  decided_at: z.string().nullable(),
});

function askOf(value: unknown): AssistantAsk {
  const row = askRow.parse(value);
  return {
    id: row.id,
    sessionId: row.session_id,
    tool: row.tool,
    text: row.text,
    state: row.state,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

const columns = "id, session_id, tool, text, state, created_at, decided_at";

function windowStart(now: Date): string {
  return new Date(now.valueOf() - askWindowMs).toISOString();
}

// Asks nobody answered and Allows nobody used in time.
function expire(db: DatabaseSync, now: Date): void {
  const since = windowStart(now);
  db.prepare(
    "UPDATE assistant_asks SET state='expired' WHERE (state='asked' AND created_at<?) OR (state='allowed' AND decided_at<?)",
  ).run(since, since);
}

// The same call asked again while the first ask still waits is the same card.
export function openAsk(
  db: DatabaseSync,
  ask: {
    readonly id: string;
    readonly sessionId: string;
    readonly tool: string;
    readonly argsHash: string;
    readonly text: string;
  },
  now: Date,
): AssistantAsk {
  expire(db, now);
  const waiting = db
    .prepare(
      `SELECT ${columns} FROM assistant_asks WHERE session_id=? AND tool=? AND args_hash=? AND state='asked'`,
    )
    .get(ask.sessionId, ask.tool, ask.argsHash);
  if (waiting !== undefined) return askOf(waiting);
  db.prepare(
    "INSERT INTO assistant_asks(id, session_id, tool, args_hash, text, state, created_at) VALUES (?,?,?,?,?,'asked',?)",
  ).run(ask.id, ask.sessionId, ask.tool, ask.argsHash, ask.text, now.toISOString());
  return askOf(db.prepare(`SELECT ${columns} FROM assistant_asks WHERE id=?`).get(ask.id));
}

export type DecideResult =
  | { readonly ok: true; readonly ask: AssistantAsk }
  | { readonly ok: false; readonly reason: "unknown" | "decided" | "expired" };

export function decideAsk(
  db: DatabaseSync,
  id: string,
  answer: "allow" | "deny",
  now: Date,
): DecideResult {
  expire(db, now);
  const found = db.prepare(`SELECT ${columns} FROM assistant_asks WHERE id=?`).get(id);
  if (found === undefined) return { ok: false, reason: "unknown" };
  const ask = askOf(found);
  if (ask.state === "expired") return { ok: false, reason: "expired" };
  if (ask.state !== "asked") return { ok: false, reason: "decided" };
  db.prepare("UPDATE assistant_asks SET state=?, decided_at=? WHERE id=? AND state='asked'").run(
    answer === "allow" ? "allowed" : "denied",
    now.toISOString(),
    id,
  );
  return {
    ok: true,
    ask: askOf(db.prepare(`SELECT ${columns} FROM assistant_asks WHERE id=?`).get(id)),
  };
}

// Uses the person's Allow for this exact call, once. False when there is none to use.
export function consumeGrant(
  db: DatabaseSync,
  grant: { readonly sessionId: string; readonly tool: string; readonly argsHash: string },
  now: Date,
): boolean {
  expire(db, now);
  const used = db
    .prepare(
      `UPDATE assistant_asks SET state='used' WHERE id=(
         SELECT id FROM assistant_asks WHERE session_id=? AND tool=? AND args_hash=? AND state='allowed'
         ORDER BY decided_at DESC LIMIT 1)
       RETURNING id`,
    )
    .all(grant.sessionId, grant.tool, grant.argsHash);
  return used.length > 0;
}

export function asksOf(db: DatabaseSync, sessionId: string, now: Date): readonly AssistantAsk[] {
  expire(db, now);
  return db
    .prepare(`SELECT ${columns} FROM assistant_asks WHERE session_id=? ORDER BY created_at, rowid`)
    .all(sessionId)
    .map(askOf);
}
