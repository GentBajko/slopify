import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { sampleArticleInstruction } from "../template-studio/scope.js";
import { config, content, emptyView, workFor } from "./recipe-fixture.js";

// A template studio sample (`config.sample`) writes the outline and first chapter and says only
// the narration's opening; every other project plans exactly as it did before samples existed.

const sentence = (n: number) => `Sentence number ${String(n)} has exactly seven words.`;
const article = Array.from({ length: 40 }, (_, i) => sentence(i + 1)).join(" ");

const written: RunConfig = {
  ...config,
  sources: { ...config.sources, article: "generate", audio: "generate" },
  provided: {},
  rendered: { article: "Write about lighthouses." },
};
const spoken: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  provided: { article },
};
const spokenContent = { ...content, articleMarkdown: article };

function fingerprints(c: RunConfig, value = content): Record<string, string> {
  return Object.fromEntries(
    workFor(emptyView(c, value), c, value).recipes.map((row) => [row.key, row.fingerprint]),
  );
}

function articleText(c: RunConfig): string {
  const recipe = workFor(emptyView(c), c).recipes.find((row) => row.key === "article:body");
  return JSON.stringify(recipe?.input);
}

function narrated(c: RunConfig): string {
  return workFor(emptyView(c, spokenContent), c, spokenContent)
    .recipes.filter((row) => row.key.startsWith("audio:body:") && row.input.kind === "tts")
    .map((row) => (row.input.kind === "tts" ? row.input.text : ""))
    .join(" ");
}

describe("a project that is not a sample", () => {
  // Pinned before samples existed: a change here would make every existing project outdated.
  it("keeps the fingerprints it always had", () => {
    expect(fingerprints(written)).toEqual({
      "article:body": "7abfece53719b506c4ae36a3695e51e0da7601684800dc6989295208803f2061",
      "audio:body:concat": "422ffe6a62f1cffedad75f5c9a4f99cf6135943c6fde7005df2ff5e8b560a639",
      "audio:body:future": "bfea989079ed1445103137607cd3c86df38f486a2fb3db593cb6b9753b60d979",
      "export:video": "0d7d5e7349b08a1e923696d8963f5b3c949b605d04d375240ad22f6a86d91f0a",
      "image:harbor": "b7458ae21dddd6a9d750a73ba0314816d18b2114bfe3e7df55e4179a209dfc72",
      "image:hill": "7de96104f1668d979b82ea4c71f43cd8fbaa386e1e4378eb2c3841f53d7f3f20",
    });
    expect(fingerprints(spoken, spokenContent)).toEqual({
      "article:body": "2af9241e70c5d8706882e770acd47dfd97b5b9661959030b224fac69e42fe57b",
      "audio:body:2c3a5316b3adf9051176-1:1":
        "dd32c0623875aaf38d0e1807f4d5c98a79fa1076f11840e1c30813991d411f7f",
      "audio:body:2c3a5316b3adf9051176-1:2":
        "14ac654618a7b16aa80d4028538d95d82b88d875473bb993a70c283dd647e321",
      "audio:body:concat": "7cb223a62e0fc9b2417ef4b7420f18a4d1b70b8944fa7f237c0008b8d22a673b",
      "export:video": "5214efe28e51b86b1b026210d7bd7af5dabdacb85376f92e1410737dda468b98",
      "image:harbor": "b7458ae21dddd6a9d750a73ba0314816d18b2114bfe3e7df55e4179a209dfc72",
      "image:hill": "7de96104f1668d979b82ea4c71f43cd8fbaa386e1e4378eb2c3841f53d7f3f20",
    });
  });

  it("asks for the whole article and narrates all of it", () => {
    expect(articleText(written)).not.toContain(sampleArticleInstruction);
    expect(narrated(spoken)).toContain(sentence(40));
  });
});

describe("a template studio sample", () => {
  it("asks for the outline and first chapter only, unless the full script is asked for", () => {
    expect(articleText({ ...written, sample: { fullScript: false } })).toContain(
      sampleArticleInstruction,
    );
    expect(articleText({ ...written, sample: { fullScript: true } })).not.toContain(
      sampleArticleInstruction,
    );
  });

  it("narrates only the opening, whole sentences of about 80 words", () => {
    const text = narrated({ ...spoken, sample: { fullScript: false } });
    expect(text).toContain(sentence(1));
    expect(text).toContain(sentence(11));
    expect(text).not.toContain(sentence(13));
  });

  it("switching the full script on makes only the article and what follows it again", () => {
    const research: RunConfig = {
      ...written,
      sources: { ...written.sources, research: "generate" },
    };
    const short = fingerprints({ ...research, sample: { fullScript: false } });
    const full = fingerprints({ ...research, sample: { fullScript: true } });
    const changed = Object.keys(full).filter((key) => full[key] !== short[key]);
    expect(changed).toContain("article:body");
    expect(changed.some((key) => key.startsWith("research:"))).toBe(false);
  });
});
