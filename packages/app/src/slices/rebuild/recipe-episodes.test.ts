import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { planRevision } from "./recipes.js";

// Episode memory's earlier episodes ride in the config only when a run was started with them,
// so a project made before episode memory, or with it off, rebuilds exactly as it was.
const written: RunConfig = {
  ...config,
  sources: { ...config.sources, article: "generate" },
  articlePrompt: "Lore",
  provided: {},
  rendered: { article: "Write about Tiamat." },
};
const { articleMarkdown: _provided, ...writtenContent } = content;

function planned(c: RunConfig) {
  const plan = planRevision(emptyView(c, writtenContent), { config: c, content: writtenContent });
  if (!plan.ok) throw new Error(JSON.stringify(plan.fields));
  return plan;
}

describe("earlier episodes in the recipe", () => {
  const before = planned(written).fingerprints;

  it("change no fingerprint when the run carries none", () => {
    expect(planned({ ...written, earlierEpisodes: undefined }).fingerprints).toEqual(before);
    expect(planned({ ...written, earlierEpisodes: [] }).fingerprints).toEqual(before);
  });

  it("are appended to the article prompt, changing the article's fingerprint", () => {
    const withMemory = planned({
      ...written,
      earlierEpisodes: [{ title: "Tiamat Awakens", summary: "She woke." }],
    });
    expect(withMemory.fingerprints["article:body"]).not.toBe(before["article:body"]);
    const article = withMemory.recipes.find((recipe) => recipe.key === "article:body");
    const message = article?.input.kind === "llm" ? article.input.messages.at(-1)?.content : "";
    expect(message).toBe(
      [
        "Write about Tiamat.",
        "",
        "Earlier episodes",
        "",
        "This channel has already made these related episodes. Stay consistent with them and never contradict them; refer back to one where it fits naturally, but don't retell it.",
        "",
        '- "Tiamat Awakens": She woke.',
      ].join("\n"),
    );
  });
});
