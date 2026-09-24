import { expect, it } from "vitest";
import { catalogue, config, emptyView } from "./recipe-fixture.js";
import { planRevisionWork } from "./recipes.js";

it("keeps original reports separate for the editor, writer and continuations", () => {
  const c = {
    ...config,
    sources: { ...config.sources, research: "generate" as const, article: "generate" as const },
  };
  const view = emptyView(c);
  const findings = [
    { title: "First", notes: `${"ç🌊".repeat(50000)}\nSources\nhttps://one.test` },
    { title: "Second", notes: "Original second report\nSources\nhttps://two.test" },
  ];
  const resolve = (reports: typeof findings, researchNotes: string | null) =>
    planRevisionWork(view.revision, view, catalogue, new Set(), {
      articleMarkdown: null,
      researchNotes,
      research: { outline: findings.map((f) => f.title), findings: reports },
      articleContinuation: "Continue this.",
    }).recipes;
  const before = resolve([], null);
  const after = resolve(findings, "Editorial notes\nSources\nhttps://one.test");
  const originals = findings.map((f, i) => ({
    id: `research-${i + 1}`,
    title: f.title,
    content: f.notes,
  }));
  expect(after.find((r) => r.key === "research:notes")?.input).toMatchObject({
    documents: originals,
  });
  for (const key of ["article:body", "article:continuation"]) {
    const input = after.find((r) => r.key === key)?.input;
    expect(input).toMatchObject({
      documents: [
        ...originals,
        {
          id: "editorial-notes",
          title: "Editorial notes",
          content: "Editorial notes\nSources\nhttps://one.test",
        },
      ],
    });
    expect(input?.kind === "llm" && JSON.stringify(input.messages)).not.toContain(
      findings[0]?.notes,
    );
  }
  for (const key of ["research:planner", "research:chapter:1", "research:chapter:2"]) {
    expect(after.find((r) => r.key === key)?.fingerprint).toBe(
      before.find((r) => r.key === key)?.fingerprint,
    );
    expect(after.find((r) => r.key === key)?.input).not.toHaveProperty("documents");
  }
  expect(before.find((r) => r.key === "research:notes")?.input.kind).toBe("deferred");
});
