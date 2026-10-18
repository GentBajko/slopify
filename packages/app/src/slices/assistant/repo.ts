import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readJsonSetting, writeSetting } from "../settings/repo.js";
import { asksOf } from "./asks.js";
import {
  type AssistantCliPreference,
  type AssistantMessage,
  type AssistantRole,
  assistantCliPreferences,
  assistantRoles,
} from "./model.js";
import type { PromptLine } from "./prompt.js";

// The assistant's chats: one row per session, its messages in order. Left out of backups.

const preferenceKey = "assistant.cli";

export function cliPreferenceOf(db: DatabaseSync): AssistantCliPreference {
  return readJsonSetting(db, preferenceKey, z.enum(assistantCliPreferences), "auto");
}

export function setCliPreference(db: DatabaseSync, preference: AssistantCliPreference): void {
  writeSetting(db, preferenceKey, JSON.stringify(preference));
}

export function createSession(db: DatabaseSync, id: string, cli: string, now: Date): void {
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO assistant_sessions(id, cli, created_at, updated_at) VALUES (?,?,?,?)",
  ).run(id, cli, at, at);
}

export function sessionExists(db: DatabaseSync, id: string): boolean {
  return db.prepare("SELECT 1 FROM assistant_sessions WHERE id=?").get(id) !== undefined;
}

// The chat the panel opens on: the one written to last.
export function latestSessionId(db: DatabaseSync): string | undefined {
  const row = db
    .prepare("SELECT id FROM assistant_sessions ORDER BY updated_at DESC, rowid DESC LIMIT 1")
    .get();
  return row === undefined ? undefined : String(row.id);
}

const messageRow = z.object({
  id: z.string(),
  session_id: z.string(),
  turn_id: z.string(),
  role: z.enum(assistantRoles),
  text: z.string(),
  meta: z.string(),
  created_at: z.string(),
});
const metaSchema = z.record(z.string(), z.string());

function messageOf(value: unknown): AssistantMessage {
  const row = messageRow.parse(value);
  const meta = metaSchema.safeParse(JSON.parse(row.meta));
  return {
    id: row.id,
    sessionId: row.session_id,
    turnId: row.turn_id,
    role: row.role,
    text: row.text,
    meta: meta.success ? meta.data : {},
    createdAt: row.created_at,
  };
}

export function addMessage(
  db: DatabaseSync,
  message: {
    readonly id: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly role: AssistantRole;
    readonly text: string;
    readonly meta?: Readonly<Record<string, string>>;
  },
  now: Date,
): AssistantMessage {
  const at = now.toISOString();
  db.prepare(
    "INSERT INTO assistant_messages(id, session_id, turn_id, role, text, meta, created_at) VALUES (?,?,?,?,?,?,?)",
  ).run(
    message.id,
    message.sessionId,
    message.turnId,
    message.role,
    message.text,
    JSON.stringify(message.meta ?? {}),
    at,
  );
  db.prepare("UPDATE assistant_sessions SET updated_at=? WHERE id=?").run(at, message.sessionId);
  return messageOf(db.prepare("SELECT * FROM assistant_messages WHERE id=?").get(message.id));
}

// ceiling: the panel shows the last 200 messages of a chat; New chat starts another.
export const shownMessagesMax = 200;

export function messagesOf(db: DatabaseSync, sessionId: string): readonly AssistantMessage[] {
  return db
    .prepare(
      `SELECT * FROM (SELECT *, rowid AS n FROM assistant_messages WHERE session_id=? ORDER BY created_at DESC, rowid DESC LIMIT ${String(shownMessagesMax)}) ORDER BY created_at, n`,
    )
    .all(sessionId)
    .map(messageOf);
}

// The chat as the next turn's prompt replays it, without this turn's own message.
export function transcriptOf(
  db: DatabaseSync,
  sessionId: string,
  exceptTurn: string,
  now: Date,
): readonly PromptLine[] {
  const asks = new Map(asksOf(db, sessionId, now).map((ask) => [ask.id, ask.state]));
  return messagesOf(db, sessionId)
    .filter((message) => message.turnId !== exceptTurn)
    .map((message) => ({
      role: message.role,
      text: message.text,
      askState: message.meta.askId === undefined ? undefined : asks.get(message.meta.askId),
    }));
}
