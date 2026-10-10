import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { z } from "zod";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { createApp } from "../src/edge/http/app.js";
import { connectAgent } from "../src/edge/mcp/mcp.fake.js";
import { composedFixture, current, save, start, tone } from "./revision-rebuild.fake.js";

const answer = (content: unknown): unknown =>
  JSON.parse(z.array(z.object({ text: z.string() }).loose()).parse(content)[0]?.text ?? "null");

it("fixes one narration chunk through MCP the way the error says, voicing only that chunk again", async () => {
  const audio = fakeTts({ bytesFor: () => [tone()] });
  const h = await composedFixture({ tts: () => audio });
  try {
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: "generate" },
        audio: { provider: "openai-tts", model: "tts", voice: "first" },
        chunking: { mode: "paragraph" },
        provided: {
          article: "The harbor wakes.\n\nThe lighthouse turns.\n\nThe boats come home.",
        },
      },
      content: base.revision.content,
    });
    await start(h.deps, h.projectId, ["export:wav"]);
    await h.runner.settled();
    const voiced = audio.calls();
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
    const revisionId = current(h.deps, h.projectId).revision.id;
    const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
      const result = await agent.callTool({ name, arguments: { id: h.projectId, ...args } });
      expect(result.isError, JSON.stringify(result.content)).toBeUndefined();
      return answer(result.content);
    };
    const chunks = z
      .object({ chunks: z.object({ body: z.array(z.string()) }).loose() })
      .parse(await call("read_narration_chunks", { revisionId })).chunks.body;
    const key = chunks[1];
    if (key === undefined) throw new Error("the body should be read in three chunks");
    const read = z
      .object({
        view: z.object({
          revision: z.object({ config: z.unknown(), content: z.unknown() }).loose(),
        }),
      })
      .parse(await call("get_revision", { revisionId }));
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
    const preview = z
      .object({
        value: z
          .object({
            id: z.string(),
            baseRevisionId: z.string(),
            work: z.array(z.object({ key: z.string(), disposition: z.string() }).loose()),
            costs: z.object({ unknown: z.number() }).loose(),
          })
          .loose(),
      })
      .parse(
        await call("preview_rebuild", {
          body: { baseRevisionId: saved.view.revision.id, request: { kind: "allAffected" } },
        }),
      ).value;
    const remade = preview.work
      .filter((work) => work.disposition === "generate")
      .map((work) => work.key);
    expect(chunks.filter((chunk) => remade.some((one) => one.startsWith(`${chunk}:`)))).toEqual([
      key,
    ]);
    await call("start_rebuild", {
      body: {
        baseRevisionId: preview.baseRevisionId,
        idempotencyKey: randomUUID(),
        previewId: preview.id,
        acknowledgeUnknownCosts: preview.costs.unknown > 0,
        confirmedProvidedWorkKeys: [],
      },
    });
    for (let round = 0; round < 20 && audio.calls() === voiced; round++) {
      await h.runner.settled();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    await h.runner.settled();
    expect(audio.calls()).toBe(voiced + remade.filter((one) => one.startsWith(`${key}:`)).length);
  } finally {
    h.audioPreviews.close();
    h.close();
  }
});
