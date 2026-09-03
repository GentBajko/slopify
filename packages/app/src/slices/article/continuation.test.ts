import { describe, expect, it } from "vitest";
import type { LlmEvent, Message } from "../../kernel/ports/llm.js";
import type { LlmAnswer, LlmCall, StageProviders } from "../../kernel/runner/providers.js";
import type { ArticleBrief } from "./continuation.js";
import { articleMessages, continuationLimit, writeArticle } from "./continuation.js";

// `logic/07` step 1 (what one call is composed of), step 3 (the continuation rule) and
// §Q61 (an empty answer is a failed attempt).

const choice = { provider: "openrouter", model: "openai/gpt-5" };
const brief: ArticleBrief = { articlePrompt: "Write about rope." };

interface Answer {
  readonly text: string;
  readonly finishReason?: string;
}

interface Fake {
  readonly providers: StageProviders;
  readonly calls: readonly (readonly Message[])[];
}

// Stands in for the wrapped calls of `kernel/runner/providers.ts`, applying `check`
// exactly as the wrapper does so a rule the slice forgot to hand it is caught here. The
// wrapper's own retries are proved against the real one in `test/article-run.test.ts`.
function fake(script: readonly Answer[]): Fake {
  const calls: (readonly Message[])[] = [];
  let n = 0;

  const providers: StageProviders = {
    llm: (call: LlmCall, onEvent?: (event: LlmEvent) => void) => {
      calls.push(call.messages);
      const scripted = script[n] ?? script.at(-1);
      n += 1;
      const text = scripted?.text ?? "";
      for (const piece of text.split(" ")) {
        onEvent?.({ type: "delta", text: piece });
      }
      const answer: LlmAnswer = {
        text,
        usage: null,
        finishReason: scripted?.finishReason ?? "stop",
      };
      const unusable = call.check?.(answer);
      return unusable === undefined ? Promise.resolve(answer) : Promise.reject(new Error(unusable));
    },
    tts: () => Promise.reject(new Error("the article stage must not narrate")),
    image: () => Promise.reject(new Error("the article stage must not draw")),
    forPiece: (): StageProviders => providers,
  };
  return { providers, calls };
}

function contentOf(messages: readonly Message[]): string {
  return messages.map((message) => message.content).join("\n");
}

describe("articleMessages", () => {
  it("puts the notes under a fixed header before the rendered prompt", () => {
    const messages = articleMessages({ articlePrompt: "Write about rope.", notes: "Rope facts." });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe("user");
    expect(messages[0]?.content).toBe("Research notes\n\nRope facts.\n\nWrite about rope.");
  });

  it("sends the rendered prompt alone when research did not run", () => {
    expect(articleMessages(brief)[0]?.content).toBe("Write about rope.");
  });
});

describe("writeArticle", () => {
  it("makes one call and keeps its text when the model finishes on its own", async () => {
    const llm = fake([{ text: "# Rope\n\nAll of it." }]);

    const written = await writeArticle(llm.providers, choice, brief, () => {});

    expect(llm.calls).toHaveLength(1);
    expect(written.markdown).toBe("# Rope\n\nAll of it.");
    expect(written.sent.map((one) => one.label)).toEqual(["Article"]);
  });

  it("streams every delta in the order it arrived", async () => {
    const llm = fake([{ text: "one two three" }]);
    const seen: string[] = [];

    await writeArticle(llm.providers, choice, brief, (text) => seen.push(text));

    expect(seen).toEqual(["one", "two", "three"]);
  });

  it("continues where the model stopped and joins the pieces with nothing between", async () => {
    const llm = fake([
      { text: "# Rope\n\nA bowline is tied by", finishReason: "length" },
      { text: " passing the end through the bight." },
    ]);

    const written = await writeArticle(llm.providers, choice, brief, () => {});

    expect(llm.calls).toHaveLength(2);
    expect(written.markdown).toBe(
      "# Rope\n\nA bowline is tied by passing the end through the bight.",
    );
    // The continuation carries the article so far and the instruction not to repeat it.
    const second = llm.calls[1] ?? [];
    expect(second[0]?.content).toBe("Write about rope.");
    expect(second[1]).toEqual({ role: "assistant", content: "# Rope\n\nA bowline is tied by" });
    expect(contentOf(second)).toContain("Do not repeat");
    expect(written.sent.map((one) => one.label)).toEqual(["Article", "Continuation 1"]);
  });

  it("hands each continuation everything written so far, not only the last piece", async () => {
    const llm = fake([
      { text: "one", finishReason: "length" },
      { text: " two", finishReason: "length" },
      { text: " three" },
    ]);

    const written = await writeArticle(llm.providers, choice, brief, () => {});

    expect(written.markdown).toBe("one two three");
    expect(llm.calls[2]?.[1]?.content).toBe("one two");
  });

  it("stops after three continuations and fails the attempt on a fourth truncation", async () => {
    const llm = fake([{ text: "on and on", finishReason: "length" }]);

    await expect(writeArticle(llm.providers, choice, brief, () => {})).rejects.toThrow(
      /still unfinished after 3 continuations/,
    );
    expect(llm.calls).toHaveLength(1 + continuationLimit);
  });

  it("fails the attempt on an empty article", async () => {
    const llm = fake([{ text: "   " }]);

    await expect(writeArticle(llm.providers, choice, brief, () => {})).rejects.toThrow(
      /answered with nothing/,
    );
  });

  it("fails the attempt on an empty continuation", async () => {
    const llm = fake([{ text: "the start", finishReason: "length" }, { text: "" }]);

    await expect(writeArticle(llm.providers, choice, brief, () => {})).rejects.toThrow(
      /answered with nothing/,
    );
  });
});
