import { afterEach, expect, it } from "vitest";
import { catalogue } from "../model-checks/catalogue.fake.js";
import { workCatalogue, workCatalogueIfSaved, workLlm } from "./runtime-plan.js";
import { workFixture } from "./work.fake.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});

const saved = {
  ...catalogue,
  llm: catalogue.llm.map((model) =>
    model.id === "cheap"
      ? { ...model, llm: { ...model.llm, thinking: { high: { budget: 1234, level: "high" } } } }
      : model,
  ),
};

async function fixture(context: string | null) {
  const h = await workFixture();
  cleanups.push(h.close);
  h.deps.db
    .prepare("UPDATE revision_work SET recipe_context=? WHERE id=?")
    .run(context, h.work.workId);
  return h;
}

it("reads the catalogue a work was admitted with", async () => {
  const { deps, work } = await fixture(JSON.stringify(saved));
  expect(workCatalogue(deps.db, work.workId).llm.map((model) => model.id)).toEqual([
    "cheap",
    "dear",
    "unpriced",
  ]);
  expect(workCatalogueIfSaved(deps.db, work.workId)?.updatedAt).toBe(saved.updatedAt);
  expect(workCatalogueIfSaved(deps.db, "missing")).toBeUndefined();
  expect(() => workCatalogue(deps.db, "missing")).toThrow();
});

it("has no catalogue for a work admitted without one", async () => {
  const { deps, work } = await fixture(null);
  expect(workCatalogueIfSaved(deps.db, work.workId)).toBeUndefined();
  expect(() => workCatalogue(deps.db, work.workId)).toThrow();
});

it("builds an LLM call with the saved thinking settings for the chosen level", async () => {
  const { deps, work } = await fixture(JSON.stringify(saved));
  const messages = [{ role: "user" as const, content: "Hello" }];
  const thinking = workLlm(
    deps.db,
    work.workId,
    { provider: "openrouter", model: "cheap", thinking: "high" },
    "shorts:pick",
  );
  expect(thinking({ messages })).toEqual({
    provider: "openrouter",
    model: "cheap",
    thinking: "high",
    thinkingConfig: { budget: 1234, level: "high" },
    messages,
    webSearch: false,
    previewLabel: "shorts:pick",
  });
  const plain = workLlm(deps.db, work.workId, { provider: "openrouter", model: "dear" }, "k");
  expect(plain({ messages })).toEqual({
    provider: "openrouter",
    model: "dear",
    thinkingConfig: null,
    messages,
    webSearch: false,
    previewLabel: "k",
  });
  const unknown = workLlm(
    deps.db,
    work.workId,
    { provider: "openrouter", model: "gone", thinking: "low" },
    "k",
  );
  expect(unknown({ messages }).thinkingConfig).toBeNull();
});
