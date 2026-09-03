import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { isProviderError } from "../../kernel/ports/model.js";
import type { CliRun } from "./run-cli.js";
import { cliEvent, cliShaped, endedWithout, nodeRunCli, promptOf, stderrMax } from "./run-cli.js";
import { lines } from "./sse-lines.js";

// These tests spawn real processes: the point of them is that the seam does what the
// operating system does, which a double cannot show. No provider is called - the "CLI" is
// a Node script written into a temporary directory.

const dir = mkdtempSync(join(tmpdir(), "slopify-run-cli-"));

function script(name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body, { mode: 0o700 });
  return path;
}

async function textOf(run: CliRun): Promise<string[]> {
  const out: string[] = [];
  for await (const line of lines(run.stdout)) {
    out.push(line);
  }
  return out;
}

function alive(pid: number | undefined): boolean {
  if (pid === undefined) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("nodeRunCli", () => {
  it("delivers every argument verbatim, with no shell between", async () => {
    const path = script(
      "argv.mjs",
      "process.stdout.write(JSON.stringify(process.argv.slice(2)));\n",
    );
    // Everything a shell would have eaten: command substitution, backticks, a variable, a
    // pipe, a semicolon, quotes of both kinds, a newline and a glob.
    const nasty = "`id` $(rm -rf /) $HOME | tee ; 'a' \"b\" \\ *\nsecond line\ttab";
    const run = nodeRunCli(process.execPath, [path, nasty, "--flag=x y"], AbortSignal.any([]));
    const written = (await textOf(run)).join("\n");
    expect(JSON.parse(written)).toEqual([nasty, "--flag=x y"]);
    expect((await run.ended).code).toBe(0);
  });

  it("kills the child on abort and leaves no process behind", async () => {
    // A child that ignores nothing but would otherwise run for a minute.
    const path = script("forever.mjs", "setTimeout(() => {}, 60000);\n");
    const controller = new AbortController();
    const run = nodeRunCli(process.execPath, [path], controller.signal);
    const pid = run.pid;
    expect(pid).toBeDefined();
    // Give it long enough to actually be running before it is stopped.
    await delay(150);
    expect(alive(pid)).toBe(true);

    controller.abort(new Error("cancelled"));
    const ended = await run.ended;
    expect(ended.code).toBeNull();
    // The kernel has reaped it: the pid answers nothing, so nothing was orphaned.
    for (let tries = 0; tries < 50 && alive(pid); tries += 1) {
      await delay(20);
    }
    expect(alive(pid)).toBe(false);
  });

  it("kills the child when the caller stops reading", async () => {
    const path = script("chatty.mjs", "setInterval(() => process.stdout.write('tick\\n'), 10);\n");
    const run = nodeRunCli(process.execPath, [path], AbortSignal.any([]));
    for await (const line of lines(run.stdout)) {
      expect(line).toBe("tick");
      break;
    }
    run.kill();
    await run.ended;
    for (let tries = 0; tries < 50 && alive(run.pid); tries += 1) {
      await delay(20);
    }
    expect(alive(run.pid)).toBe(false);
  });

  it("keeps what the CLI wrote to stderr and the code it exited with", async () => {
    const path = script(
      "grumpy.mjs",
      "process.stderr.write('could not reach the model\\n');process.exitCode = 3;\n",
    );
    const run = nodeRunCli(process.execPath, [path], AbortSignal.any([]));
    await textOf(run);
    const ended = await run.ended;
    expect(ended.code).toBe(3);
    expect(ended.error).toBeNull();
    expect(run.stderr()).toContain("could not reach the model");
  });

  it("keeps only the tail of a CLI that floods stderr", async () => {
    const path = script(
      "flood.mjs",
      // No process.exit: it truncates a pending write to a pipe, and the point of this
      // test is the last line the CLI managed to say.
      `for (let i = 0; i < 4000; i += 1) process.stderr.write('x'.repeat(64) + '\\n');
process.stderr.write('THE REASON\\n');
process.exitCode = 1;\n`,
    );
    const run = nodeRunCli(process.execPath, [path], AbortSignal.any([]));
    await textOf(run);
    await run.ended;
    expect(run.stderr().length).toBeLessThanOrEqual(stderrMax);
    expect(run.stderr()).toContain("THE REASON");
  });

  it("reports a binary that is not on PATH rather than throwing at the process", async () => {
    const run = nodeRunCli("slopify-no-such-binary", [], AbortSignal.any([]));
    const ended = await run.ended;
    expect(ended.error?.message).toContain("ENOENT");
  });

  it("gives the child no stdin, so a CLI that reads it is not left waiting", async () => {
    const path = script(
      "stdin.mjs",
      `let seen = 0;
process.stdin.on('data', () => { seen += 1; });
process.stdin.on('end', () => { process.stdout.write('ended after ' + seen + ' chunks\\n'); });
process.stdin.resume();\n`,
    );
    const run = nodeRunCli(process.execPath, [path], AbortSignal.any([]));
    expect(await textOf(run)).toEqual(["ended after 0 chunks"]);
  });
});

describe("promptOf", () => {
  it("hands a single user turn through untouched", () => {
    expect(promptOf([{ role: "user", content: "write the article" }])).toBe("write the article");
  });

  it("labels the turns a one-prompt CLI has no other place for", () => {
    expect(
      promptOf([
        { role: "system", content: "be terse" },
        { role: "user", content: "write it" },
      ]),
    ).toBe("[system]\nbe terse\n\nwrite it");
  });
});

describe("endedWithout", () => {
  it("says what the CLI put on stderr", () => {
    expect(endedWithout("codex", { code: 1, error: null }, " not signed in \n")).toBe(
      "the codex CLI exited 1 without answering: not signed in",
    );
  });

  it("says so plainly when stderr was empty", () => {
    expect(endedWithout("claude", { code: 2, error: null }, "")).toBe(
      "the claude CLI exited 2 without answering",
    );
  });

  it("names a signal rather than a code", () => {
    expect(endedWithout("claude", { code: null, error: null }, "")).toContain("on a signal");
  });

  it("names a binary that could not be started", () => {
    expect(endedWithout("codex", { code: null, error: new Error("spawn ENOENT") }, "")).toContain(
      "could not be started (spawn ENOENT)",
    );
  });

  it("redacts anything key-shaped a CLI printed", () => {
    const said = endedWithout("codex", { code: 1, error: null }, "bad key sk-abcdefghijklmnopqrst");
    expect(said).not.toContain("sk-abcdefghijklmnopqrst");
    expect(said).toContain("[redacted]");
  });
});

describe("cliEvent and cliShaped", () => {
  it("keeps the whole value beside its type", () => {
    const event = cliEvent("codex", '{"type":"turn.completed","usage":{"input_tokens":1}}');
    expect(event.type).toBe("turn.completed");
    expect(
      cliShaped("codex", z.object({ usage: z.object({ input_tokens: z.number() }) }), event.value),
    ).toEqual({
      usage: { input_tokens: 1 },
    });
  });

  it("names the CLI when a line will not parse, and quotes none of it", () => {
    const error: unknown = (() => {
      try {
        cliEvent("codex", '{"type":"item.compl');
      } catch (thrown: unknown) {
        return thrown;
      }
      return undefined;
    })();
    expect(isProviderError(error) && error.fault.kind).toBe("other");
    expect(String(error)).toBe("Error: the codex CLI wrote a line this app could not read");
  });

  it("fails a line that parses but carries no type", () => {
    expect(() => cliEvent("claude", '{"nope":1}')).toThrow("could not read");
  });

  it("fails an event whose own shape is wrong", () => {
    const event = cliEvent("claude", '{"type":"result"}');
    expect(() => cliShaped("claude", z.object({ subtype: z.string() }), event.value)).toThrow(
      "the claude CLI wrote an event this app could not read",
    );
  });
});
