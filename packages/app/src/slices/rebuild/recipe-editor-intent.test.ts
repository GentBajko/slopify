import { expect, it } from "vitest";
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
