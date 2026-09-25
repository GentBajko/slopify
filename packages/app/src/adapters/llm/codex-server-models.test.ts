import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { nodeCodexModels } from "./codex-models.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture(pages: readonly unknown[], stall = false) {
  const directory = await mkdtemp(join(tmpdir(), "slopify-codex-model-test-"));
  directories.push(directory);
  const binary = join(directory, "codex.mjs");
  await writeFile(
    binary,
    `
    import { appendFileSync } from "node:fs";
    let buffer = "", page = 0;
    const pages = ${JSON.stringify(pages)};
    process.stdin.on("data", (piece) => {
      buffer += piece;
      let newline;
      while ((newline = buffer.indexOf("\\n")) >= 0) {
        const request = JSON.parse(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        appendFileSync(new URL("./requests.jsonl", import.meta.url), JSON.stringify(request) + "\\n");
        if (!['initialize', 'initialized', 'model/list'].includes(request.method)) process.exit(9);
        if (request.method === 'initialized' || ${stall}) continue;
        process.stdout.write(JSON.stringify({ id: request.id, result: request.method === 'initialize' ? {} : pages[page++] }) + "\\n");
      }
    });
  `,
  );
  return { binary, directory, env: { CODEX_HOME: directory } };
}

describe("Codex discovery without a local cache", () => {
  it("queries the configured CLI, follows pages, and keeps visible unique model IDs", async () => {
    const model = {
      model: "gpt-6-astra",
      displayName: "GPT-6-Astra",
      supportedReasoningEfforts: [{ reasoningEffort: "high" }],
    };
    const f = await fixture([
      {
        data: [model, { model: "hidden", displayName: "Hidden", hidden: true }],
        nextCursor: "next",
      },
      { data: [model, { model: "gpt-6-sol", displayName: "GPT-6 Sol" }], nextCursor: null },
    ]);
    expect(await nodeCodexModels(f.env, f.binary, 2000)).toEqual([
      { id: "gpt-6-astra", name: "GPT-6 Astra", thinkingModes: ["high"] },
      { id: "gpt-6-sol", name: "GPT-6 Sol" },
    ]);
    const requests = (await readFile(join(f.directory, "requests.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(requests.map((request) => request.method)).toEqual([
      "initialize",
      "initialized",
      "model/list",
      "model/list",
    ]);
    expect(requests[3].params).toEqual({ limit: 100, includeHidden: false, cursor: "next" });
  });

  it("uses a bridged host catalogue without needing a container login or child process", async () => {
    const f = await fixture([]);
    const path = join(f.directory, "host-models.json");
    await writeFile(
      path,
      JSON.stringify({
        models: [{ slug: "gpt-6-luna", display_name: "GPT-6-Luna", visibility: "list" }],
      }),
    );
    expect(
      await nodeCodexModels({ ...f.env, SLOPIFY_CODEX_MODELS_FILE: path }, "missing-cli"),
    ).toEqual([{ id: "gpt-6-luna", name: "GPT-6 Luna" }]);
  });

  it.each([
    { pages: [] },
    { pages: [{ data: [] }] },
    { pages: [{ data: [{ model: "bad model", displayName: "private-path" }] }] },
  ])("sanitizes unavailable or malformed model replies", async ({ pages }) => {
    const f = await fixture(pages);
    await expect(nodeCodexModels(f.env, f.binary, 1000)).rejects.toThrow(
      /^Slopify could not get the model list from the Codex CLI\./,
    );
  });

  it("bounds a CLI that does not answer", async () => {
    const f = await fixture([], true);
    await expect(nodeCodexModels(f.env, f.binary, 50)).rejects.toThrow(
      /^Slopify could not get the model list from the Codex CLI\./,
    );
  });
});
