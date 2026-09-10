import { describe, expect, it } from "vitest";
import { googleImage } from "./google.js";
import { openAiImage } from "./openai.js";

// Constructed catalogue fixtures; the future ids prove discovery is not a whitelist.
describe("image model discovery", () => {
  it("loads new GPT image models while excluding text and legacy incompatible image models", async () => {
    const calls: string[] = [];
    const port = openAiImage({
      key: () => "placeholder",
      fetch: async (input, init) => {
        calls.push(String(input));
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return Response.json({
          data: [{ id: "gpt-image-future" }, { id: "gpt-text" }, { id: "dall-e-3" }],
        });
      },
    });
    expect(await port.models()).toEqual([{ id: "gpt-image-future", name: "gpt-image-future" }]);
    expect(calls).toEqual(["https://api.openai.com/v1/models"]);
  });
  it("follows Google pagination and offers only compatible image models", async () => {
    const calls: string[] = [];
    const port = googleImage({
      key: () => "placeholder",
      fetch: async (input, init) => {
        calls.push(String(input));
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return Response.json(
          calls.length === 1
            ? {
                models: [
                  {
                    name: "models/gemini-future-image",
                    displayName: "Future image",
                    supportedGenerationMethods: ["generateContent"],
                  },
                  {
                    name: "models/gemini-future-pro",
                    supportedGenerationMethods: ["generateContent"],
                  },
                  { name: "models/imagen-future", supportedGenerationMethods: ["predict"] },
                ],
                nextPageToken: "second",
              }
            : {
                models: [
                  {
                    name: "models/gemini-future-image-preview",
                    supportedGenerationMethods: ["generateContent"],
                  },
                ],
              },
        );
      },
    });
    expect(await port.models()).toEqual([
      { id: "gemini-future-image", name: "Future image" },
      { id: "gemini-future-image-preview", name: "gemini-future-image-preview" },
    ]);
    expect(calls[1]).toContain("pageToken=second");
    expect(calls.every((url) => !url.includes("placeholder"))).toBe(true);
  });
  it("keeps credentials and upstream error bodies out of discovery failures", async () => {
    for (const make of [googleImage, openAiImage]) {
      const port = make({
        key: () => "placeholder",
        fetch: async () => new Response("private upstream response", { status: 401 }),
      });
      await expect(port.models()).rejects.toThrow("model list could not be loaded");
      await expect(
        make({
          key: () => undefined,
          fetch: async () => {
            throw new Error("must not call");
          },
        }).models(),
      ).rejects.toThrow("Save an API key");
    }
  });
  it("rejects malformed responses and repeated page tokens", async () => {
    await expect(
      openAiImage({
        key: () => "placeholder",
        fetch: async () => Response.json({ bad: true }),
      }).models(),
    ).rejects.toThrow();
    await expect(
      googleImage({
        key: () => "placeholder",
        fetch: async () => Response.json({ models: [], nextPageToken: "same" }),
      }).models(),
    ).rejects.toThrow();
  });
});
