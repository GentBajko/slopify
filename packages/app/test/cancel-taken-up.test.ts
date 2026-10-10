import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHub } from "../src/edge/events/hub.js";
import { createApp } from "../src/edge/http/app.js";
import { connectAgent } from "../src/edge/mcp/mcp.fake.js";
import { derive } from "../src/kernel/runner/graph.js";
import { stagesOf } from "../src/slices/admission/repo.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import { waitingExternalReviews } from "../src/slices/reviews/external-waiting.js";
import { projectHolds } from "../src/slices/reviews/holds.js";
import { boot, cancel, narratingWhileAgentsReview, settleUntil } from "./agent-reviews-run.fake.js";
import { current } from "./revision-rebuild.fake.js";

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const answer = (content: unknown): unknown =>
  JSON.parse(z.array(z.object({ text: z.string() }).loose()).parse(content)[0]?.text ?? "null");

const statesOf = (
  h: Awaited<ReturnType<typeof narratingWhileAgentsReview>>["h"],
): Record<string, string> =>
  Object.fromEntries(stagesOf(h.deps.db, h.projectId).map((stage) => [stage.kind, stage.state]));

// Cancel, then Try narration again, then a restart before it finished: what was taken up again
// reads Stopped and Continue the run (resume_project) goes on with it alone. The images the person
// canceled stay canceled, their reviews closed.
it("continues only the stage taken up after a cancel once a restart stopped it", {
  timeout: 30_000,
}, async () => {
  const { h, call } = await narratingWhileAgentsReview(closers);
  await cancel(h);
  expect(
    await recoverProject(h.deps, h.projectId, {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "retry", stage: "audio" },
    }),
  ).toMatchObject({ ok: true });
  // Narrating again, its call held until the restart.
  await vi.waitFor(() => expect(statesOf(h).audio).toBe("running"), { timeout: 4_000 });
  await h.runner.abortAll();
  const next = boot(h, closers);
  next.runner.tick(h.projectId);
  await next.runner.settled();
  expect(statesOf(h)).toMatchObject({ audio: "pending", images: "canceled", video: "canceled" });
  expect(derive(stagesOf(h.deps.db, h.projectId))).toBe("pending");
  expect([...projectHolds(h.deps.db, { projectId: h.projectId }).stopped]).toEqual([h.projectId]);

  const app = createApp({
    db: h.deps.db,
    paths: h.deps.paths,
    clock: h.deps.clock,
    ids: h.deps.ids,
    log: h.deps.log,
    runner: next.runner,
    hub: createHub(h.deps),
    rebuild: next.deps,
    version: "test",
    webDist: "/missing",
    probe: async () => ({ ran: false, stdout: "" }),
    flushSoon: () => undefined,
  });
  const agent = await connectAgent(app);
  const tool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await agent.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).toBeUndefined();
    return answer(result.content);
  };
  const listed = z
    .object({ entries: z.array(z.object({ kind: z.string(), projectId: z.string() }).loose()) })
    .loose()
    .parse(await tool("needs_attention", {}));
  expect(listed.entries).toContainEqual(
    expect.objectContaining({ kind: "stopped-run", projectId: h.projectId }),
  );
  const listing = z
    .object({ projects: z.array(z.object({ id: z.string(), stateWord: z.string() }).loose()) })
    .loose()
    .parse(await tool("list_projects", {}));
  expect(listing.projects.find((one) => one.id === h.projectId)?.stateWord).toBe("Stopped");

  call.blocks = false;
  await tool("resume_project", {
    id: h.projectId,
    body: {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
    },
  });
  await settleUntil(next.runner, () => statesOf(h).audio === "done");
  expect(statesOf(h)).toMatchObject({ audio: "done", images: "canceled", video: "canceled" });
  expect(waitingExternalReviews(h.deps.db, h.projectId)).toEqual([]);
  expect(derive(stagesOf(h.deps.db, h.projectId))).toBe("canceled");
});
