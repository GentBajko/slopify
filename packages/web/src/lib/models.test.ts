import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { modelsOf, providerModels } from "./models";

// `providerModels` is a hand-kept copy of the catalogues the adapters ship, because the
// browser cannot import them: they reach `node:fs` through `kernel/log.ts`. Nothing but this
// test stops the two drifting, and drift is silent - the picker simply stops offering a model
// the server would have accepted. Read the adapter source as text rather than importing it,
// so the check cannot itself pull a Node builtin into the web graph.
const adapters = {
  fal: { file: "adapters/image/fal.ts", list: "falModels" },
  replicate: { file: "adapters/image/replicate.ts", list: "replicateModels" },
} as const;

// Vitest runs this project from `packages/web`, but the whole suite can be run from the
// repository root, so the app package is found by walking up rather than by a fixed hop.
function appSrc(): string {
  for (let at = resolve(process.cwd()); ; at = dirname(at)) {
    if (existsSync(join(at, "packages/app/src"))) {
      return join(at, "packages/app/src");
    }
    if (dirname(at) === at) {
      throw new Error("packages/app/src not found above the working directory");
    }
  }
}

function shipped(which: keyof typeof adapters): readonly string[] {
  const { file, list } = adapters[which];
  const source = readFileSync(join(appSrc(), file), "utf8");
  const block = new RegExp(`${list}[^=]*=\\s*\\[([\\s\\S]*?)\\];`).exec(source);
  if (block?.[1] === undefined) {
    throw new Error(`${list} not found in ${file}`);
  }
  return [...block[1].matchAll(/id:\s*"([^"]+)"/g)].map((one) => one[1] ?? "");
}

describe("providerModels", () => {
  it.each(["fal", "replicate"] as const)("offers exactly what the %s adapter ships", (which) => {
    const ours = providerModels[which].map((one) => one.id);

    expect(ours).toEqual(shipped(which));
    expect(ours.length).toBeGreaterThan(0);
  });

  // The Google endpoints arrived after the FLUX ones and take a different aspect field, which
  // the adapter maps per model. The picker only has to offer them.
  it("offers the Google image models on fal", () => {
    expect(providerModels.fal.map((one) => one.id)).toEqual(
      expect.arrayContaining([
        "fal-ai/nano-banana",
        "fal-ai/nano-banana-2",
        "fal-ai/gemini-3.1-flash-image-preview",
      ]),
    );
  });

  // OpenRouter fetches its catalogue per call and runs to thousands of entries, so its model
  // is typed rather than picked and an empty list is the right answer.
  it("offers nothing for OpenRouter", () => {
    expect(modelsOf("openrouter")).toEqual([]);
  });

  it("answers nothing for a provider it does not know", () => {
    expect(modelsOf("constructor")).toEqual([]);
    expect(modelsOf("nope")).toEqual([]);
  });
});
