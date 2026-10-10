import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { createApp } from "../src/edge/http/app.js";
import { connectAgent } from "../src/edge/mcp/mcp.fake.js";
import { type SubtitleAligner, SubtitleMismatch } from "../src/kernel/ports/subtitles.js";
import { lastStarter } from "../src/slices/agents/repo.js";
import { defaultSubtitles } from "../src/slices/subtitles/model.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

const answer = (content: unknown): unknown =>
  JSON.parse(z.array(z.object({ text: z.string() }).loose()).parse(content)[0]?.text ?? "null");

// The aligner hears every word in the fake narration's tenth of a second, except that while
// `misread` is set it hears the second paragraph wrong, as a bad recording of it would sound.
function aligner(): { readonly align: SubtitleAligner; fixed: () => void } {
  let misread = true;
  return {
    align: async (request) => {
      if (misread && request.text.includes("ligh"))
        throw new SubtitleMismatch(
          "The audio stopped matching the text.",
          0.05,
          "The lighthouse turns.",
          "the light house burns",
        );
      const words = request.text.split(/\s+/).filter((word) => word !== "");
      return words.map((text, index) => ({
        text,
        start: (index * 0.09) / words.length,
        end: ((index + 1) * 0.09) / words.length,
      }));
    },
    fixed: () => {
      misread = false;
    },
  };
}

it("lets an agent fix a run stopped by a misread narration chunk: listed, regenerated, continued", {
  timeout: 30_000,
}, async () => {
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const hearing = aligner();
  const h = await composedFixture({ tts: () => audio }, false, hearing.align);
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate", video: "off" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        chunking: { mode: "paragraph" },
        subtitles: { ...defaultSubtitles, mode: "files" },
        provided: {
          article: "The harbor wakes.\n\nThe lighthouse turns.\n\nThe boats come home.",
        },
      },
      content: base.revision.content,
    });
    const app = createApp({
      db: h.deps.db,
      paths: h.deps.paths,
      clock: h.deps.clock,
      ids: h.deps.ids,
      log: h.deps.log,
      runner: h.runner,
      hub: createHub(h.deps),
      rebuild: h.deps,
      version: "test",
      webDist: "/missing",
      probe: async () => ({ ran: false, stdout: "" }),
      flushSoon: () => undefined,
    });
    const agent = await connectAgent(app);
    const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      const result = await agent.callTool({ name, arguments: { id: h.projectId, ...args } });
      expect(result.isError, JSON.stringify(result.content)).toBeUndefined();
      return answer(result.content);
    };
    // The narration is made first; the captions are timed next.
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    const revisionId = current(h.deps, h.projectId).revision.id;
    const chunks = z
      .object({ chunks: z.object({ body: z.array(z.string()) }).loose() })
      .parse(await call("read_narration_chunks", { revisionId })).chunks.body;
    const key = chunks[1];
    if (key === undefined) throw new Error("the body should be read in three chunks");
    // Slopify's own two tries at recording the chunk again are already spent, so the run
    // stops and asks for the fix.
    h.deps.db
      .prepare(
        "INSERT INTO narration_retries(project_id,chunk_key,tries,state,updated_at) VALUES (?,?,2,'started','2026-01-01T00:00:00.000Z')",
      )
      .run(h.projectId, key);
    await start(h.deps, h.projectId, ["subtitles:files"]);
    const stopped = () =>
      h.deps.db
        .prepare("SELECT state, failure_reason FROM stages WHERE project_id=? AND kind='video'")
        .get(h.projectId);
    await vi.waitFor(
      async () => {
        await h.runner.settled();
        expect(stopped()).toMatchObject({ state: "failed" });
      },
      { timeout: 20_000, interval: 50 },
    );
    const attention = z
      .object({
        entries: z.array(
          z
            .object({
              kind: z.string(),
              projectId: z.string().nullable(),
              reason: z.string(),
              agentCanAct: z.boolean(),
              ids: z.record(z.string(), z.string()),
              tools: z.array(z.string()),
            })
            .loose(),
        ),
      })
      .parse(answer((await agent.callTool({ name: "needs_attention", arguments: {} })).content));
    const failed = attention.entries.find(
      (entry) => entry.kind === "failed-step" && entry.projectId === h.projectId,
    );
    expect(failed).toMatchObject({ agentCanAct: true });
    expect(failed?.reason).toMatch(/narration chunk 2 of 3.*Continue the run/);
    expect(failed?.tools).toEqual(
      expect.arrayContaining(["read_narration_chunks", "save_revision", "resume_project"]),
    );

    // The new recording reads the paragraph right.
    hearing.fixed();
    const read = z
      .object({
        view: z.object({
          revision: z.object({ config: z.unknown(), content: z.unknown() }).loose(),
        }),
      })
      .parse(await call("get_revision", { revisionId }));
    const voiced = audio.calls();
    const saved = z
      .object({ view: z.object({ revision: z.object({ id: z.string() }).loose() }).loose() })
      .parse(
        await call("save_revision", {
          body: {
            baseRevisionId: revisionId,
            idempotencyKey: randomUUID(),
            edit: {
              config: read.view.revision.config,
              content: read.view.revision.content,
              regenerate: [key],
            },
          },
        }),
      );
    await call("resume_project", {
      body: { baseRevisionId: saved.view.revision.id, idempotencyKey: randomUUID() },
    });
    await vi.waitFor(
      async () => {
        await h.runner.settled();
        expect(stopped()).toMatchObject({ state: "done" });
      },
      { timeout: 20_000, interval: 50 },
    );
    expect(audio.calls()).toBeGreaterThan(voiced);
    expect(
      h.deps.db
        .prepare("SELECT tool FROM agent_actions WHERE project_id=? ORDER BY rowid")
        .all(h.projectId)
        .map((row) => row.tool),
    ).toEqual(["save_revision", "resume_project"]);
    expect(lastStarter(h.deps.db, h.projectId)).toBe("agent");
  } finally {
    h.audioPreviews.close();
    h.close();
  }
});
