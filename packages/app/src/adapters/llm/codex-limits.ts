import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { cliCommand } from "../../kernel/cli-command.js";
import {
  isoOfEpoch,
  type LimitWindow,
  type PlanLimitHit,
  windowKindOf,
} from "../../kernel/ports/plan-limits.js";

// The Codex plan windows. `codex exec --json` reports none, so they are asked of the CLI's
// app server with `account/rateLimits/read` - a metadata-only exchange that starts no thread
// and spends nothing. Measured on 0.155.1: the reply carries `rateLimits.primary` and
// `.secondary`, each `{ usedPercent, windowDurationMins, resetsAt }` with `resetsAt` in epoch
// seconds; a ChatGPT Pro plan answered a weekly (10080-minute) primary and no secondary.

const windowSchema = z
  .object({
    usedPercent: z.number(),
    windowDurationMins: z.number().nullish(),
    resetsAt: z.number().nullish(),
  })
  .nullish();
const readSchema = z.object({
  rateLimits: z.object({ primary: windowSchema, secondary: windowSchema }),
});

export function codexWindows(result: unknown): LimitWindow[] {
  const parsed = readSchema.safeParse(result);
  if (!parsed.success) return [];
  const windows: LimitWindow[] = [];
  for (const one of [parsed.data.rateLimits.primary, parsed.data.rateLimits.secondary]) {
    if (one === null || one === undefined) continue;
    windows.push({
      kind: windowKindOf(one.windowDurationMins),
      usedPercent: Math.max(0, Math.min(100, one.usedPercent)),
      resetsAt: isoOfEpoch(one.resetsAt),
    });
  }
  return windows;
}

// Null whenever the answer cannot be had - no CLI, signed out, an older version without the
// method, a slow start: the windows are reported beside a run, never needed for it.
export async function nodeCodexLimits(
  binary: string,
  env: Readonly<Record<string, string | undefined>>,
  timeoutMs = 10_000,
): Promise<LimitWindow[] | null> {
  const command = cliCommand(binary);
  const directory = await mkdtemp(join(tmpdir(), "slopify-codex-limits-"));
  const child = spawn(command.file, [...command.args, "app-server", "--listen", "stdio://"], {
    cwd: directory,
    env: { ...env, PWD: directory },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  child.stderr.resume();
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const terminate = (signal: NodeJS.Signals): void => {
    if (process.platform !== "win32" && child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        /* The process may already have exited. */
      }
    }
    child.kill(signal);
  };
  const timer = setTimeout(() => terminate("SIGKILL"), timeoutMs);
  const send = (message: unknown) => child.stdin.write(`${JSON.stringify(message)}\n`);
  let buffer = "";
  try {
    send({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "slopify_limits", version: "1.0" } },
    });
    child.stdout.setEncoding("utf8");
    for await (const piece of child.stdout) {
      buffer += piece;
      if (buffer.length > 1024 * 1024) return null;
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (line === "") continue;
        const reply = z
          .object({ id: z.unknown().optional(), result: z.unknown().optional() })
          .safeParse(JSON.parse(line));
        if (!reply.success) continue;
        if (reply.data.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "account/rateLimits/read" });
        } else if (reply.data.id === 2) {
          const windows = codexWindows(reply.data.result);
          return windows.length === 0 ? null : windows;
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    terminate("SIGTERM");
    let grace: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      closed,
      new Promise<void>((resolve) => {
        grace = setTimeout(() => {
          terminate("SIGKILL");
          resolve();
        }, 1000);
      }),
    ]);
    clearTimeout(grace);
    await rm(directory, { recursive: true, force: true });
  }
}

const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Codex refuses a turn over the plan's allowance with "You've hit your usage limit. … Try
// again at <time>." (the messages in the 0.155.1 binary). The time is local and written either
// as "3:04 PM" alone or with a date, "Sep 28th, 2026 3:04 PM". A usage-limit text with no time
// still counts: the wait then checks again later instead of at a known reset.
export function codexPlanLimit(message: string, now: Date): PlanLimitHit | undefined {
  if (!/hit your usage limit|usage limit reached|usage_limit_reached/i.test(message))
    return undefined;
  return { account: "codex", resetsAt: codexRetryAt(message, now) };
}

function codexRetryAt(message: string, now: Date): string | null {
  const dated =
    /try again at\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(
      message,
    );
  if (dated !== null) {
    const month = months.indexOf((dated[1] ?? "").toLowerCase());
    if (month < 0) return null;
    const at = new Date(
      Number(dated[3]),
      month,
      Number(dated[2]),
      hour24(Number(dated[4]), dated[6] ?? ""),
      Number(dated[5]),
    );
    return Number.isNaN(at.getTime()) ? null : at.toISOString();
  }
  const timed = /try again at\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(message);
  if (timed === null) return null;
  const at = new Date(now);
  at.setHours(hour24(Number(timed[1]), timed[3] ?? ""), Number(timed[2]), 0, 0);
  // A time already past today is tomorrow's.
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.toISOString();
}

function hour24(hour: number, meridiem: string): number {
  const pm = meridiem.toUpperCase() === "PM";
  return (hour % 12) + (pm ? 12 : 0);
}
