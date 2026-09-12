import { expect, it } from "vitest";
import type { RevisionEdit } from "../revisions/model.js";
import { defaultSubtitles } from "../subtitles/model.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { planRevision } from "./recipe-save.js";

it("keeps regenerated article output after a title save and honors retyping the earlier snapshot", () => {
  const c = { ...config, sources: { ...config.sources, article: "generate" as const } };
  const base = { ...emptyView(c), articleMarkdown: "Newly regenerated article." };
  const unchanged = planRevision(base, { config: { ...c, title: "Renamed" }, content });
  expect(unchanged.ok).toBe(true);
  if (!unchanged.ok) throw new Error("Expected valid title save.");
  expect(unchanged.content.articleEdited).toBe(false);
  expect(unchanged.recipes.find((row) => row.key === "article:body")?.input.kind).toBe("llm");
  const edited = planRevision(base, { config: c, content: { ...content, articleEdited: true } });
  expect(edited.ok).toBe(true);
  if (!edited.ok) throw new Error("Expected valid article edit.");
  expect(edited.content.articleEdited).toBe(true);
  expect(edited.content.articleMarkdown).toBe(content.articleMarkdown);
  expect(edited.recipes.find((row) => row.key === "article:body")?.input.kind).toBe("local");
});

it("accepts normalized Audio Off as a silent video and Video Off with subtitle files", () => {
  const subtitles = { ...defaultSubtitles, mode: "burn-in" as const, fontSize: 64 };
  const c = { ...config, sources: { ...config.sources, audio: "generate" as const }, subtitles };
  const base = emptyView(c);
  for (const source of ["audio", "video"] as const) {
    const edit: RevisionEdit = {
      config: {
        ...c,
        sources: { ...c.sources, [source]: "off" },
        subtitles: { ...subtitles, mode: source === "audio" ? "off" : "files" },
      },
      content,
    };
    const saved = planRevision(base, edit);
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error("Expected valid normalized source change.");
    expect(saved.config.subtitles).toEqual(edit.config.subtitles);
    expect(saved.recipes.some((row) => row.key === "export:video")).toBe(source === "audio");
    expect(saved.recipes.some((row) => row.key === "export:wav")).toBe(source === "video");
  }
});
