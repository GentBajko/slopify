import { expect, it } from "vitest";
import { bridgeLimits, hostFrameSchema, hostImageSchema, hostLlmSchema } from "./host-cli.js";

const valid = { model: "installed", messages: [{ role: "user", content: "Write text" }] };
it.each(["binary", "args", "env", "cwd", "path", "outputPath", "thinkingConfig"])(
  "rejects caller-controlled %s",
  (field) => {
    expect(hostLlmSchema.safeParse({ ...valid, [field]: "forbidden" }).success).toBe(false);
  },
);
it.each([0, 129])("rejects %i messages", (count) => {
  expect(
    hostLlmSchema.safeParse({
      ...valid,
      messages: Array.from({ length: count }, () => valid.messages[0]),
    }).success,
  ).toBe(false);
});
it("bounds prompt strings, IDs and nested keys", () => {
  expect(
    hostImageSchema.safeParse({ model: "codex-imagegen", prompt: "a", aspect: "16:9" }).success,
  ).toBe(true);
  expect(
    hostImageSchema.safeParse({
      model: "codex-imagegen",
      prompt: "a".repeat(bridgeLimits.text + 1),
      aspect: "16:9",
    }).success,
  ).toBe(false);
  expect(hostLlmSchema.safeParse({ ...valid, model: "x".repeat(257) }).success).toBe(false);
  expect(
    hostLlmSchema.safeParse({ ...valid, messages: [{ role: "user", content: "ok", env: {} }] })
      .success,
  ).toBe(false);
  expect(
    hostFrameSchema.safeParse({ type: "done", usage: null, finishReason: null, token: "no" })
      .success,
  ).toBe(false);
});
