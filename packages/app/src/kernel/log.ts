import { appendFileSync } from "node:fs";
import { join } from "node:path";
import type { Clock } from "./clock.js";

export type LogLevel = "info" | "warn" | "error";

export interface LogFields {
  readonly projectId?: string | undefined;
  readonly stage?: string | undefined;
  readonly detail?: string | undefined;
}

export interface Log {
  readonly write: (level: LogLevel, event: string, fields?: LogFields) => void;
}

// ceiling: prefix matching, not a secret scanner. A provider whose key shape is not
// listed here would slip through, which is why LogFields is a closed set of three
// strings: no caller can hand this module an arbitrary payload to serialise.
const keyLike = /\b(?:sk|rk|pk|hf|gsk|xai|nvapi)[-_][A-Za-z0-9_-]{16,}|\bAIza[A-Za-z0-9_-]{16,}/g;
const bearerLike = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

export function openLog(logsDir: string, clock: Clock): Log {
  return {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      const at = clock.now().toISOString();
      const record: Record<string, string> = { ts: at, level, event };
      if (fields?.projectId !== undefined) {
        record.projectId = fields.projectId;
      }
      if (fields?.stage !== undefined) {
        record.stage = fields.stage;
      }
      if (fields?.detail !== undefined) {
        record.detail = redact(fields.detail);
      }
      // ceiling: one open/append/close per line, and rotation by the date in the file
      // name. A held handle is the upgrade if the runner ever logs per streamed chunk.
      const file = join(logsDir, `slopify-${at.slice(0, 10)}.log`);
      appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    },
  };
}

function redact(text: string): string {
  return text.replace(bearerLike, "Bearer [redacted]").replace(keyLike, "[redacted]");
}
