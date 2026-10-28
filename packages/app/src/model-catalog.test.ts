import { describe, expect, it, vi } from "vitest";
import { keptModels } from "./model-catalog.js";

describe("a model list kept for a short while", () => {
  it("asks once within the time it is kept, and again after", async () => {
    let time = 0;
    const list = vi.fn(async () => [{ id: "sonnet", name: "Sonnet" }]);
    const models = keptModels(list, 30_000, () => time);
    await models("claude-code", "llm");
    time = 29_000;
    await models("claude-code", "llm");
    expect(list).toHaveBeenCalledTimes(1);
    await models("codex", "llm");
    expect(list).toHaveBeenCalledTimes(2);
    time = 31_000;
    await models("claude-code", "llm");
    expect(list).toHaveBeenCalledTimes(3);
  });

  it("asks again after a list that failed", async () => {
    const list = vi
      .fn<() => Promise<readonly { id: string; name: string }[]>>()
      .mockRejectedValueOnce(new Error("CLI busy"))
      .mockResolvedValue([{ id: "sonnet", name: "Sonnet" }]);
    const models = keptModels(list, 30_000, () => 0);
    await expect(models("claude-code", "llm")).rejects.toThrow("CLI busy");
    await expect(models("claude-code", "llm")).resolves.toEqual([{ id: "sonnet", name: "Sonnet" }]);
    expect(list).toHaveBeenCalledTimes(2);
  });
});
