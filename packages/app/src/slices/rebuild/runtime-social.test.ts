import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageProviders } from "../../kernel/runner/providers.js";
import { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { defaultChoices } from "../social/defaults.js";
import { postPacks } from "../social/pack.js";
import { outputsOf } from "../storage/repo.js";
import { admitInitialRevision } from "./runtime-admission.js";
import { materializeAdmittedWork } from "./runtime-materialize.js";
import { runRevisionInvocation } from "./runtime-run.js";
import { executionStages, invocationReady } from "./runtime-store.js";

const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { openrouter: { maxConcurrent: 5 } },
  llm: [
    {
      name: "Test",
      enabled: true,
      deprecated: false,
      keywords: [],
      source: "https://example.test",
      pricing: {},
      provider: "openrouter",
      id: "llm",
      llm: { webSearch: false, thinking: {} },
    },
  ],
  tts: [],
  image: [],
};

async function run(answers: Readonly<Record<string, string>>) {
  const h = revisionFixture();
  const deps = { ...h.deps, ffmpeg: "ffmpeg" };
  const config = {
    ...h.config,
    sources: {
      research: "off" as const,
      article: "generate" as const,
      audio: "off" as const,
      images: "off" as const,
      thumbnail: "off" as const,
      video: "off" as const,
    },
    llm: { provider: "openrouter", model: "llm" },
    articlePrompt: "Article",
    provided: {},
    rendered: { article: "Write the article.", "social.linkedin": "Sound like a person." },
    social: {
      x: { ...defaultChoices.x, text: "prompt" as const },
      linkedin: { ...defaultChoices.linkedin, text: "prompt" as const, prompt: "LinkedIn" },
      bluesky: defaultChoices.bluesky,
    },
  };
  deps.db
    .prepare("UPDATE projects SET config=? WHERE id=?")
    .run(JSON.stringify(config), h.projectId);
  for (const kind of stageKinds)
    deps.db
      .prepare(
        "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,?,'generate','pending')",
      )
      .run(kind, h.projectId, kind);
  const base = await ensureBaseline(deps, h.projectId);
  if (!base.ok) throw new Error("Missing baseline");
  const asked: { key: string; system: string }[] = [];
  let active = "";
  const providers: StageProviders = {
    llm: async (input) => {
      asked.push({ key: active, system: input.messages[0]?.content ?? "" });
      return {
        ok: true,
        value: {
          text: answers[active] ?? "## One\n\nThe lighthouse stood on the rock.",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 2 },
        },
      };
    },
    tts: async () => {
      throw new Error("Unexpected narration");
    },
    image: async () => {
      throw new Error("Unexpected image");
    },
    forPiece: (id) => {
      const row = deps.db.prepare("SELECT work_key FROM revision_work_pieces WHERE id=?").get(id);
      active = String(row?.work_key);
      return providers;
    },
  };
  admitInitialRevision(deps, base.view, catalogue);
  const errors: string[] = [];
  for (let pass = 0; pass < 30; pass++) {
    materializeAdmittedWork(deps, h.projectId);
    const stage = executionStages(deps, h.projectId).find(
      (row) => row.state === "pending" && invocationReady(deps, row.work),
    );
    if (stage === undefined) break;
    expect(claimWork(deps.db, stage.work)).toBe(true);
    const context: StageContext = {
      work: stage.work,
      stage,
      signal: new AbortController().signal,
      maySubmit: (id) => maySubmit(deps.db, stage.work, id),
      emit: () => undefined,
    };
    try {
      expect(await runRevisionInvocation(deps, context, providers)).toBe("done");
      finishWork(deps.db, stage.work, "done", null);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      finishWork(deps.db, stage.work, "failed", null);
      break;
    }
  }
  return { h, asked, errors };
}

it("writes each site's post from the article with its prompt, and the pack carries it", async () => {
  const { h, asked, errors } = await run({
    "social:post:x": '"A tower on a rock the sea covers twice a day."',
    "social:post:linkedin": "Engineers built on a rock that drowned twice a day.",
  });
  try {
    expect(errors).toEqual([]);
    expect(asked.map((one) => one.key).toSorted()).toEqual([
      "article:body",
      "social:post:linkedin",
      "social:post:x",
    ]);
    const system = (key: string) => asked.find((one) => one.key === key)?.system ?? "";
    expect(system("social:post:x")).toContain("Write one post that makes people want to watch");
    expect(system("social:post:x")).toContain("within 280 characters");
    expect(system("social:post:linkedin")).toContain("Sound like a person.");
    expect(system("social:post:linkedin")).not.toContain("Write one post that makes");
    const posts = outputsOf(h.deps.db, h.projectId).filter((one) => one.role === "social_post");
    expect(posts.map((one) => one.meta.platform).toSorted()).toEqual(["linkedin", "x"]);
    const packs = postPacks(h.deps, h.projectId, new Date());
    const x = packs.ok ? packs.packs.packs.find((one) => one.platform === "x") : undefined;
    expect(x?.generated.startsWith("A tower on a rock the sea covers twice a day.")).toBe(true);
  } finally {
    h.close();
  }
}, 30_000);

it("fails the post that runs over its site's limit, naming the site and the fix", async () => {
  const { h, errors } = await run({ "social:post:x": "word ".repeat(80) });
  try {
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(
      /^X post: The AI model's X post is 399 characters; it may be at most 280\. Use Try again/,
    );
    const posts = outputsOf(h.deps.db, h.projectId).filter((one) => one.role === "social_post");
    expect(posts.map((one) => one.meta.platform)).not.toContain("x");
  } finally {
    h.close();
  }
}, 30_000);
