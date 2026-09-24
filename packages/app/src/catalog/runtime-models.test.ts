import { expect, it } from "vitest";
import { checkRuntimeModel } from "./runtime-models.js";

it("accepts only an exact ID and advertised thinking level after successful discovery", async () => {
  const modelsFor = async () => [{ id: "gpt-6", name: "GPT 6", thinkingModes: ["low" as const] }];
  expect(await checkRuntimeModel(modelsFor, "codex", "llm", "gpt-6", "low")).toBe("available");
  expect(await checkRuntimeModel(modelsFor, "codex", "llm", "gpt-5")).toBe("missing");
  expect(await checkRuntimeModel(modelsFor, "codex", "llm", "gpt-6", "high")).toBe("thinking");
});

it("allows a saved exact LLM ID only when local discovery itself fails", async () => {
  const fails = async () => {
    throw new Error("offline");
  };
  expect(await checkRuntimeModel(fails, "codex", "llm", "gpt-6")).toBe("manual");
  expect(await checkRuntimeModel(fails, "codex", "llm", " ")).toBe("missing");
  expect(await checkRuntimeModel(fails, "codex-image", "image", "codex-imagegen")).toBe("missing");
  expect(await checkRuntimeModel(fails, "openrouter", "llm", "gpt-6")).toBe("missing");
});
