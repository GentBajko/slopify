import { randomUUID } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHub } from "../src/edge/events/hub.js";
import { createApp } from "../src/edge/http/app.js";
import { connectAgent } from "../src/edge/mcp/mcp.fake.js";
import { derive } from "../src/kernel/runner/graph.js";
import { stageStandingsByProject, stagesOf } from "../src/slices/admission/repo.js";
import { noticeOf } from "../src/slices/notifications/rules.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import { executionStandings } from "../src/slices/rebuild/runtime-store.js";
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

// Taken up again after a Cancel and then failed, the run ends Failed like any run whose step
// failed: on the lists, the page and the MCP tools (the stage rows), and in the runner's own
// announcement, which sends the failed notice and counts in "While you were away".
it("reads a stage taken up after a cancel that then fails as Failed", {
  timeout: 30_000,
}, async () => {
  const { h, call } = await narratingWhileAgentsReview(closers);
  await cancel(h);
  call.blocks = false;
  call.refuses = true;
  expect(
    await recoverProject(h.deps, h.projectId, {
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      idempotencyKey: randomUUID(),
      action: { kind: "retry", stage: "audio" },
    }),
  ).toMatchObject({ ok: true });
  await settleUntil(h.runner, () => statesOf(h).audio === "failed");
  expect(statesOf(h)).toMatchObject({ audio: "failed", images: "canceled", video: "canceled" });
  expect(derive(stagesOf(h.deps.db, h.projectId))).toBe("failed");
  expect(derive(stageStandingsByProject(h.deps.db, h.projectId).get(h.projectId) ?? [])).toBe(
    "failed",
  );
  expect(derive(executionStandings(h.deps, h.projectId))).toBe("failed");
  const announced = h.events.flatMap((event) =>
    event.type === "project.state" && event.projectId === h.projectId ? [event.state] : [],
  );
  expect(announced.at(-1)).toBe("failed");
  expect(noticeOf(announced.at(-2), "failed")).toBe("failed");
});
