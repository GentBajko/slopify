import { randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { isProviderError } from "../../kernel/ports/model.js";
import type { CliRun, RunCli } from "../llm/run-cli.js";
import { codexImage, codexImageArgs } from "./codex.js";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==",
  "base64",
);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function generatedRun(
  change: (path: string, directory: string) => void = (path) => writeFileSync(path, png),
  id?: string,
) {
  const home = mkdtempSync(join(tmpdir(), "slopify-codex-output-test-"));
  homes.push(home);
  const threadId = id ?? randomUUID();
  const directory = join(home, "generated_images", threadId);
  const path = join(directory, `exec-${randomUUID()}.png`);
  const fake = fakeRun(
    () => {
      if (id === undefined) {
        mkdirSync(directory, { recursive: true });
        change(path, directory);
      }
    },
    `${[
      JSON.stringify({ type: "thread.started", thread_id: threadId }),
      JSON.stringify({
        type: "item.completed",
        item: { id: "item_0", type: "agent_message", text: "Image generated." },
      }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } }),
    ].join("\n")}\n`,
  );
  return { ...fake, home, path, directory, env: { CODEX_HOME: home } };
}
it.each(["turn.failed", "error"])(
  "preserves actionable %s details and classifies missing login",
  async (type) => {
    for (const message of [
      "Not logged in. Run codex login",
      "Image tool unavailable for this account",
    ]) {
      const event = type === "error" ? { type, message } : { type, error: { message } };
      const fake = fakeRun(() => {}, `${JSON.stringify(event)}\n`);
      const result = codexImage({ run: fake.run }).generate(request());
      if (message.startsWith("Not"))
        await expect(result).rejects.toMatchObject({ fault: { kind: "missing_key" } });
      else await expect(result).rejects.toThrow(message);
    }
  },
);
const request = (signal = new AbortController().signal) => ({
  model: "codex-imagegen",
  prompt: "A moonlit castle",
  aspect: "16:9" as const,
  signal,
});

function fakeRun(write: (directory: string) => void, events = '{"type":"turn.completed"}\n') {
  const calls: {
    binary: string;
    args: readonly string[];
    directory: string;
    env: NodeJS.ProcessEnv | undefined;
  }[] = [];
  let kills = 0;
  const run: RunCli = (binary, args, _signal, options): CliRun => {
    const directory = options?.cwd ?? "";
    calls.push({ binary, args, directory, env: options?.env });
    write(directory);
    return {
      pid: 42,
      stdout: {
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(events);
        },
      },
      stderr: () => "",
      ended: Promise.resolve({ code: 0, error: null }),
      kill: () => {
        kills++;
      },
    };
  };
  return { run, calls, kills: () => kills };
}

it("advertises one built-in capability and passes prompt/aspect as data to an isolated child", async () => {
  const fake = generatedRun();
  const port = codexImage({ run: fake.run, binary: "/configured/codex", env: fake.env });
  expect(await port.models()).toEqual([{ id: "codex-imagegen", name: "Codex default" }]);
  // The turn's token counts ride along, for the Run cost tab.
  expect(await port.generate(request())).toEqual({
    bytes: png,
    mime: "image/png",
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  const call = fake.calls[0];
  expect(call?.binary).toBe("/configured/codex");
  expect(call?.directory).not.toBe(process.cwd());
  expect(call?.args).toEqual(codexImageArgs(request(), call?.directory ?? ""));
  expect(call?.args.at(-1)).toContain("A moonlit castle");
  expect(call?.args.at(-1)).toContain("16:9");
  expect(call?.args.at(-1)).not.toContain("result.png");
  expect(call?.args).toContain("shell_tool");
  expect(call?.env?.CODEX_HOME).toBe(fake.home);
  expect(call?.env?.OPENAI_API_KEY).toBeUndefined();
  expect(call?.env?.PWD).toBe(call?.directory);
  expect(existsSync(call?.directory ?? "")).toBe(false);
  expect(existsSync(fake.path)).toBe(true);
  expect(fake.kills()).toBe(1);
});

it("accepts JPEG bytes and uses a fresh private directory for concurrent images", async () => {
  const fake = generatedRun((path) => writeFileSync(path, jpeg));
  const second = generatedRun();
  const [one, two] = await Promise.all([
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
    codexImage({ run: second.run, env: second.env }).generate(request()),
  ]);
  expect(one.mime).toBe("image/jpeg");
  expect(two.mime).toBe("image/png");
  expect(fake.calls[0]?.directory).not.toBe(second.calls[0]?.directory);
  expect(fake.calls.every((call) => !existsSync(call.directory))).toBe(true);
});

it.each([
  "missing",
  "symlink",
  "hardlink",
  "html",
  "oversized",
  "empty",
  "stale",
  "directory",
] as const)("rejects %s output without leaking a project asset", async (kind) => {
  const fake = generatedRun((path, dir) => {
    if (kind === "missing") return;
    if (kind === "symlink") {
      symlinkSync(join(dir, "missing.png"), path);
      return;
    }
    if (kind === "directory") {
      mkdirSync(path);
      return;
    }
    writeFileSync(
      path,
      kind === "html"
        ? Buffer.from("<html>no image</html>")
        : kind === "oversized"
          ? Buffer.alloc(32 * 1024 * 1024 + 1)
          : kind === "empty"
            ? Buffer.alloc(0)
            : png,
    );
    if (kind === "hardlink") linkSync(path, join(dir, "..", "linked.png"));
    if (kind === "stale") utimesSync(path, new Date(0), new Date(0));
  });
  const error: unknown = await codexImage({ run: fake.run, env: fake.env })
    .generate(request())
    .catch((e: unknown) => e);
  expect(isProviderError(error)).toBe(true);
  expect(isProviderError(error) && error.fault.kind).toBe("unavailable");
  expect(fake.calls[0] && existsSync(fake.calls[0].directory)).toBe(false);
});

it("rejects a blank or flag-like model before starting Codex", async () => {
  for (const model of ["", "-c"]) {
    const fake = fakeRun(() => {});
    const error: unknown = await codexImage({ run: fake.run })
      .generate({ ...request(), model })
      .catch((e: unknown) => e);
    expect(isProviderError(error) && error.fault.kind).toBe("unsupported");
    expect(fake.calls).toEqual([]);
  }
});

it("passes -m and the reasoning effort only when they are chosen", () => {
  const plain = codexImageArgs(request(), "/job");
  expect(plain).not.toContain("-m");
  expect(plain.some((arg) => arg.startsWith("model_reasoning_effort"))).toBe(false);
  // Codex default keeps view_image off, as before the choice existed.
  expect(plain[plain.indexOf("view_image") - 1]).toBe("--disable");

  const chosen = codexImageArgs({ ...request(), model: "gpt-6-sol", thinking: "ultra" }, "/job");
  expect(chosen.slice(chosen.indexOf("-m"), chosen.indexOf("-m") + 2)).toEqual(["-m", "gpt-6-sol"]);
  expect(chosen).toContain('model_reasoning_effort="ultra"');
  // The agent may look at its own images to review them.
  expect(chosen[chosen.indexOf("view_image") - 1]).toBe("--enable");
  expect(chosen).not.toContain("--disable view_image");
  expect(chosen.filter((arg) => arg === "view_image")).toHaveLength(1);
  expect(chosen).toContain("shell_tool");

  const off = codexImageArgs({ ...request(), thinking: "off" }, "/job");
  expect(off).toContain('model_reasoning_effort="none"');
  expect(off).not.toContain("-m");
});

it("asks for a faithful detailed prompt, a review loop and one final image", () => {
  const text = codexImageArgs(request(), "/job").at(-1) ?? "";
  expect(text).toContain("detailed, faithful visual description");
  expect(text).toContain("do not pad the prompt");
  expect(text).toContain("the last image you generate is the one Slopify uses");
  expect(text).toContain("Deliver exactly one final image");
  expect(text).not.toContain("referenced_image_paths");
});

it("copies the establishing image into the job folder and names its absolute path", async () => {
  let seen: Buffer | undefined;
  const fake = generatedRun((path, _dir) => writeFileSync(path, png));
  const run: RunCli = (binary, args, signal, options) => {
    seen = readFileSync(join(options?.cwd ?? "", "reference.jpg"));
    return fake.run(binary, args, signal, options);
  };
  const reference = { bytes: jpeg, mime: "image/jpeg" as const };
  await codexImage({ run, env: fake.env }).generate({ ...request(), reference });
  const call = fake.calls[0];
  const path = join(call?.directory ?? "", "reference.jpg");
  expect(seen).toEqual(jpeg);
  expect(call?.args.at(-1)).toContain(`A reference image is saved at ${path}.`);
  expect(call?.args.at(-1)).toContain("referenced_image_paths");
  expect(call?.args.at(-1)).toContain("do not copy its composition");
  expect(existsSync(call?.directory ?? "")).toBe(false);
});

it("waits for the whole turn and takes the latest of several images in its thread", async () => {
  const later = Buffer.concat([png, Buffer.from("later")]);
  const fake = generatedRun((path, dir) => {
    writeFileSync(path, png);
    const first = new Date(Date.now() + 1000);
    utimesSync(path, first, first);
    const last = join(dir, "exec-z-last.png");
    writeFileSync(last, later);
    const second = new Date(Date.now() + 5000);
    utimesSync(last, second, second);
    // An earlier-named file drawn in between.
    const middle = join(dir, "exec-a-middle.png");
    writeFileSync(middle, png);
    const between = new Date(Date.now() + 3000);
    utimesSync(middle, between, between);
  });
  const image = await codexImage({ run: fake.run, env: fake.env }).generate(request());
  expect(Buffer.from(image.bytes)).toEqual(later);
});

it("reports how many images the thread has drawn while the job runs", async () => {
  const lines: string[] = [];
  const fake = generatedRun();
  await codexImage({ run: fake.run, env: fake.env }).generate({
    ...request(),
    onProgress: (text) => lines.push(text),
  });
  expect(lines[0]).toBe("Codex is working on the image…");
  expect(lines.at(-1)).toBe("Codex is refining the image… 1 image so far");
});

it("lists Codex default first, then the Codex CLI's own models with their efforts", async () => {
  const port = codexImage({
    run: fakeRun(() => {}).run,
    readModels: async () => [
      { id: "gpt-6-sol", name: "GPT-6-Sol", thinkingModes: ["low", "ultra"] },
    ],
  });
  expect(await port.models()).toEqual([
    { id: "codex-imagegen", name: "Codex default" },
    { id: "gpt-6-sol", name: "GPT-6-Sol", thinkingModes: ["low", "ultra"] },
  ]);
  const failing = codexImage({
    run: fakeRun(() => {}).run,
    readModels: () => Promise.reject(new Error("no list")),
  });
  expect(await failing.models()).toEqual([{ id: "codex-imagegen", name: "Codex default" }]);
  expect(port.timeoutMs).toBeGreaterThanOrEqual(20 * 60_000);
});

it.each(["../other", "", "not-a-thread"])("rejects unsafe session identifier %s", async (id) => {
  const fake = generatedRun(undefined, id);
  await expect(
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
  ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
});

it("does not collect another session or an agent-named file", async () => {
  const fake = generatedRun(() => {});
  const other = join(fake.home, "generated_images", randomUUID());
  mkdirSync(other, { recursive: true });
  writeFileSync(join(other, "exec-other.png"), png);
  await expect(
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
  ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
});

it("rejects a linked session directory", async () => {
  const fake = generatedRun((path, dir) => {
    const target = join(dir, "..", "elsewhere");
    mkdirSync(target);
    rmSync(dir, { recursive: true });
    symlinkSync(target, dir, "junction");
    writeFileSync(path, png);
  });
  await expect(
    codexImage({ run: fake.run, env: fake.env }).generate(request()),
  ).rejects.toMatchObject({ fault: { kind: "unavailable" } });
});

it("requires a completed turn and cleans up refused or failed calls", async () => {
  const fake = fakeRun(() => {}, '{"type":"turn.failed","error":{"message":"refused"}}\n');
  const error: unknown = await codexImage({ run: fake.run })
    .generate(request())
    .catch((e: unknown) => e);
  expect(isProviderError(error) && error.fault.kind).toBe("refusal");
  expect(fake.calls[0] && existsSync(fake.calls[0].directory)).toBe(false);
});

it("does not scan an unrelated filename even if Codex wrote it", async () => {
  const fake = fakeRun((dir) => writeFileSync(join(dir, "other.png"), png));
  const error: unknown = await codexImage({ run: fake.run })
    .generate(request())
    .catch((e: unknown) => e);
  expect(isProviderError(error)).toBe(true);
  expect(fake.calls[0] && existsSync(fake.calls[0].directory)).toBe(false);
});

it("rejects duplicate session events rather than selecting an unrelated output", async () => {
  const id = randomUUID();
  const event = JSON.stringify({ type: "thread.started", thread_id: id });
  const fake = fakeRun(() => {}, `${event}\n${event}\n{"type":"turn.completed"}\n`);
  await expect(codexImage({ run: fake.run }).generate(request())).rejects.toMatchObject({
    fault: { kind: "unavailable" },
  });
});

it("copies every cast picture beside the establishing image and names each path", async () => {
  const fake = generatedRun((path, _dir) => writeFileSync(path, png));
  const written: Buffer[] = [];
  const run: RunCli = (binary, args, signal, options) => {
    written.push(readFileSync(join(options?.cwd ?? "", "reference.jpg")));
    written.push(readFileSync(join(options?.cwd ?? "", "reference-2.png")));
    return fake.run(binary, args, signal, options);
  };
  await codexImage({ run, env: fake.env }).generate({
    ...request(),
    reference: { bytes: jpeg, mime: "image/jpeg" },
    cast: [
      {
        name: "Tiamat",
        description: "five-headed dragon",
        images: [{ bytes: png, mime: "image/png" }],
      },
    ],
  });
  const call = fake.calls[0];
  const text = call?.args.at(-1) ?? "";
  const directory = call?.directory ?? "";
  expect(written).toEqual([jpeg, png]);
  expect(text).toContain(
    `Pass all of them in referenced_image_paths on every image generation call: ${join(directory, "reference.jpg")}, ${join(directory, "reference-2.png")}.`,
  );
  expect(text).toContain(
    `${join(directory, "reference-2.png")} shows Tiamat (five-headed dragon): draw Tiamat to look exactly like this.`,
  );
  expect(call?.args).toContain("view_image");
});
