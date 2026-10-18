import { describe, expect, it } from "vitest";
import type { ImageCall, LlmCall, StageProviders } from "../../kernel/runner/providers.js";
import { lateKeywordProviders } from "./runtime-keywords.js";

const held = { ok: false, reason: "held" } as const;

function recording(): { providers: StageProviders; llm: LlmCall[]; images: ImageCall[] } {
  const llm: LlmCall[] = [];
  const images: ImageCall[] = [];
  const providers: StageProviders = {
    llm: (call) => {
      llm.push(call);
      return Promise.resolve(held);
    },
    tts: () => Promise.resolve(held),
    image: (call) => {
      images.push(call);
      return Promise.resolve(held);
    },
    forPiece: () => providers,
  };
  return { providers, llm, images };
}

describe("lateKeywordProviders", () => {
  it("fills the release date and length into a request as it is sent", async () => {
    const seen = recording();
    const wrapped = lateKeywordProviders(seen.providers, () =>
      Promise.resolve({ releaseDate: "Thursday 22 October 2026", duration: "42 min 10 s" }),
    );
    await wrapped.forPiece("p").llm({
      provider: "x",
      model: "y",
      messages: [{ role: "user", content: "Out {{Slopify_Release_Date}}, {{Slopify_Duration}}." }],
    });
    expect(seen.llm[0]?.messages[0]?.content).toBe("Out Thursday 22 October 2026, 42 min 10 s.");
  });

  it("leaves out the line when the video has no release time", async () => {
    const seen = recording();
    const wrapped = lateKeywordProviders(seen.providers, () => Promise.resolve({}));
    await wrapped.image({
      provider: "x",
      model: "y",
      aspect: "16:9",
      prompt: "A poster.\nOut {{Slopify_Release_Date}}",
    });
    expect(seen.images[0]?.prompt).toBe("A poster.");
  });

  it("sends every other call exactly as it was, without looking anything up", async () => {
    const seen = recording();
    let looked = 0;
    const wrapped = lateKeywordProviders(seen.providers, () => {
      looked += 1;
      return Promise.resolve({});
    });
    const call: LlmCall = {
      provider: "x",
      model: "y",
      messages: [{ role: "user", content: "Hi" }],
    };
    await wrapped.llm(call);
    expect(seen.llm[0]).toBe(call);
    expect(looked).toBe(0);
  });

  it("looks the values up once for the whole run", async () => {
    const seen = recording();
    let looked = 0;
    const wrapped = lateKeywordProviders(seen.providers, () => {
      looked += 1;
      return Promise.resolve({ releaseDate: "Friday" });
    });
    const prompt = "{{Slopify_Release_Date}}";
    await wrapped.image({ provider: "x", model: "y", aspect: "16:9", prompt });
    await wrapped.forPiece("q").image({ provider: "x", model: "y", aspect: "16:9", prompt });
    expect(looked).toBe(1);
    expect(seen.images.map((one) => one.prompt)).toEqual(["Friday", "Friday"]);
  });
});
