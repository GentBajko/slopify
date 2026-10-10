import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readSetting, writeSetting } from "../settings/repo.js";

// When an agent last opened an MCP session. This install's own fact, so backups leave it out
// (`storage/portable.ts`).
export const agentConnectionKey = "agents.lastConnectedAt";

export function recordAgentConnection(db: DatabaseSync, at: string): void {
  writeSetting(db, agentConnectionKey, JSON.stringify(at));
}

export function lastAgentConnection(db: DatabaseSync): string | null {
  const raw = readSetting(db, agentConnectionKey);
  if (raw === undefined) return null;
  const parsed = z.iso.datetime().safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}
