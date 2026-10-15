import { describe, expect, it } from "vitest";
import { nodeAntigravityModels, parseAntigravityModels } from "./antigravity-models.js";

// The listing shape from antigravity.google/docs/cli/headless.md ("agy models").
const listing = `gemini-3.8-flash-high     Gemini 3.8 Flash (High)
gemini-3.8-flash-medium   Gemini 3.8 Flash (Medium)
gemini-3.1-pro-high       Gemini 3.1 Pro (High)
gemini-3.8-flash-high     Gemini 3.8 Flash (High)

Some footer line that is not a model
`;

describe("Antigravity model list", () => {
  it("reads slug and name from each line of agy models, once each", () => {
    expect(parseAntigravityModels(listing)).toEqual([
      { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" },
      { id: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash (Medium)" },
      { id: "gemini-3.1-pro-high", name: "Gemini 3.1 Pro (High)" },
    ]);
  });

  it("runs agy models and explains a failure with what to do", async () => {
    let called: readonly string[] = [];
    const models = await nodeAntigravityModels("agy", async (file, args) => {
      called = [file, ...args];
      return listing;
    });
    expect(called).toEqual(["agy", "models"]);
    expect(models).toHaveLength(3);
    await expect(
      nodeAntigravityModels("agy", async () => {
        throw new Error("ENOENT");
      }),
    ).rejects.toThrow(
      'Slopify could not get the model list from the Antigravity CLI (it ran "agy models"). Check agy is installed and signed in (Settings → Providers), then refresh the list, or type a model slug that "agy models" shows.',
    );
    await expect(nodeAntigravityModels("agy", async () => "nothing here")).rejects.toThrow(
      "Antigravity CLI",
    );
  });
});
