import { spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { Message } from "../../kernel/ports/llm.js";
import { providerError } from "../../kernel/ports/model.js";

// The local-agent seam, shaped after `slices/settings/cli-status.ts`'s `CliProbe`: a type
// the adapters take as a parameter and one implementation over `node:child_process`
// (05-dependencies, rung 3). It exists once rather than twice because killing the child on
// abort, capping stderr, waiting for the exit code and turning a JSONL line into an event
// are the same problems for Claude Code and for Codex. Everything either of them knows
// about its own CLI - its flags, its event vocabulary, its usage fields - stays in its own
// adapter; there is no base class and no provider framework here.

export interface CliEnded {
  // Null when a signal killed the process rather than it exiting on its own.
  readonly code: number | null;
  // Set when the binary could not be spawned at all - not on PATH, not executable.
  readonly error: Error | null;
}

export interface CliRun {
  readonly pid: number | undefined;
  readonly stdout: AsyncIterable<Uint8Array>;
  // What the CLI has complained about so far. Read when a run ends without an answer: a
  // bare non-zero exit tells the user nothing.
  readonly stderr: () => string;
  // Never rejects. A caller that throws before the process ends must not leave an
  // unhandled rejection behind it.
  readonly ended: Promise<CliEnded>;
  readonly kill: () => void;
}

export type RunCli = (binary: string, args: readonly string[], signal: AbortSignal) => CliRun;

// ceiling: the last 8 KiB of stderr is kept. A CLI that writes megabytes of progress there
// would otherwise be held in memory for the length of a run, and the tail is the part that
// says why it stopped. Streaming stderr to the log is the upgrade if a provider ever
// buries its reason in the first line of a long report.
export const stderrMax = 8192;

export function nodeRunCli(binary: string, args: readonly string[], signal: AbortSignal): CliRun {
  // An argument array, never a shell string: a prompt carrying backticks, `$(...)`,
  // quotes or newlines is one argv element and nothing in it can become a command.
  // stdin is /dev/null because `codex exec` appends piped stdin to the prompt, and a pipe
  // nobody closes would leave it waiting for an EOF that never comes.
  // `signal` is how the child dies: Node sends it SIGTERM when the stage is cancelled, so
  // no agent session outlives the run that started it (`logic/13`).
  const child = spawn(binary, [...args], {
    signal,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  let stderr = "";
  const errorStream = child.stderr;
  if (errorStream !== null) {
    errorStream.setEncoding("utf8");
    errorStream.on("data", (piece: string) => {
      stderr = (stderr + piece).slice(-stderrMax);
    });
  }

  let spawnError: Error | null = null;
  // A process that could not be spawned emits `error`, and an unlistened `error` is thrown
  // at the process. It is recorded rather than rethrown so the one place that reports a
  // failed run is the caller reading `ended`.
  child.on("error", (error: Error) => {
    spawnError = error;
  });

  const ended = new Promise<CliEnded>((resolve) => {
    const settle = (code: number | null): void => {
      resolve({ code, error: spawnError });
    };
    child.once("close", settle);
    // `close` follows `error` when the streams were opened; this is the belt for the case
    // where they were not.
    child.once("error", () => {
      setImmediate(() => {
        settle(null);
      });
    });
  });

  return {
    pid: child.pid,
    stdout: child.stdout === null ? nothing : bytesOf(child.stdout),
    stderr: (): string => stderr,
    ended,
    kill: (): void => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
    },
  };
}

// ceiling: both CLIs take one prompt string, so a system or assistant turn is flattened
// into it under a header rather than being sent as its own message. Claude Code's
// `--append-system-prompt` is the upgrade if a stage ever needs a real system turn; today
// `logic/06` and `logic/07` each compose exactly one user message.
export function promptOf(messages: readonly Message[]): string {
  return messages
    .map((message) =>
      message.role === "user" ? message.content : `[${message.role}]\n${message.content}`,
    )
    .join("\n\n");
}

// A bare non-zero exit tells the user nothing, so whatever the CLI put on stderr is what
// the stage shows (`logic/01` unhappy paths: the provider's error text verbatim).
export function endedWithout(binary: string, ended: CliEnded, stderr: string): string {
  const said = redact(stderr.trim());
  const how =
    ended.error === null
      ? `exited ${ended.code === null ? "on a signal" : String(ended.code)}`
      : `could not be started (${redact(ended.error.message)})`;
  return said === ""
    ? `the ${binary} CLI ${how} without answering`
    : `the ${binary} CLI ${how} without answering: ${said}`;
}

// Unreachable while stdio names `pipe` for fd 1; it is here so the type carries no null
// and no non-null assertion is needed to read the stream.
const nothing: AsyncIterable<Uint8Array> = {
  [Symbol.asyncIterator]: (): AsyncIterator<Uint8Array> => ({
    next: (): Promise<IteratorResult<Uint8Array>> =>
      Promise.resolve({ done: true, value: undefined }),
  }),
};

const typed = z.object({ type: z.string() });

// A JSONL line off a CLI's stdout. The raw value travels with its `type` because a schema
// that names only `type` strips every other key, and each event's own shape is checked
// against the schema that knows it.
export function cliEvent(
  binary: string,
  line: string,
): { readonly type: string; readonly value: unknown } {
  const value = safeJson(line);
  const parsed = typed.safeParse(value);
  if (!parsed.success) {
    // A line that will not parse is a stream cut mid-write or a format this app does not
    // know. The text is not echoed back: half a JSON object is noise to the user.
    throw providerError({
      kind: "other",
      message: `the ${binary} CLI wrote a line this app could not read`,
    });
  }
  return { type: parsed.data.type, value };
}

export function cliShaped<T>(binary: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw providerError({
      kind: "other",
      message: `the ${binary} CLI wrote an event this app could not read`,
    });
  }
  return parsed.data;
}

async function* bytesOf(source: Readable): AsyncGenerator<Uint8Array> {
  for await (const piece of source) {
    if (typeof piece === "string") {
      yield new TextEncoder().encode(piece);
      continue;
    }
    if (piece instanceof Uint8Array) {
      yield piece;
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
