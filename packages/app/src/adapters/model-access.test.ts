import { describe, expect, it } from "vitest";
import { accessField, modelAccessOf } from "./model-access.js";

describe("modelAccessOf", () => {
  it.each([
    [
      null,
      "The 'gpt-5.5-pro' model is not supported when using Codex with a ChatGPT account.",
      "no-access",
    ],
    [403, "Your organization must be verified to use the model `gpt-image-1`.", "no-access"],
    [403, "Project `proj_x` does not have access to model `gpt-image-1`", "no-access"],
    [null, "This model is not available on your current plan.", "no-access"],
    [400, "Upgrade your plan to use the eleven_v3 model.", "no-access"],
    [404, "The model `gpt-9` does not exist or you do not have access to it.", "not-found"],
    [404, "No endpoints found for openai/gpt-9.", "not-found"],
    [404, "models/gemini-9 is not found for API version v1beta", "not-found"],
    [400, "Invalid model selection: gemini-9", "not-found"],
    [404, "Requested model is gone", "not-found"],
    [403, "Permission denied for model imagen-4", "no-access"],
  ] as const)("reads %s %s", (status, text, access) => {
    expect(modelAccessOf(status, text)).toBe(access);
  });

  it.each([
    [404, "voice_not_found: the voice id is wrong"],
    [400, "A voice with voice_id abc does not exist."],
    [401, "You have used your quota. Upgrade your plan to continue."],
    [403, "Invalid API key"],
    [429, "Rate limit reached for model gpt-5"],
    [500, "Internal error"],
    [null, "stream disconnected"],
  ] as const)("says nothing about the model for %s %s", (status, text) => {
    expect(modelAccessOf(status, text)).toBeUndefined();
    expect(accessField(status, text)).toEqual({});
  });

  it("reads a 404 or 403 from the model's own address as about the model", () => {
    expect(modelAccessOf(404, "Not Found", true)).toBe("not-found");
    expect(modelAccessOf(403, "Imagen API is only accessible to billed users.", true)).toBe(
      "no-access",
    );
    expect(modelAccessOf(422, "bad input", true)).toBeUndefined();
    expect(modelAccessOf(400, "Voice Zed not found", true)).toBeUndefined();
    expect(modelAccessOf(404, "Not Found")).toBeUndefined();
  });

  it("spreads into an error init", () => {
    expect(accessField(404, "model_not_found")).toEqual({ access: "not-found" });
  });
});
