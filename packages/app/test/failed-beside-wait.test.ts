import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { createApp } from "../src/edge/http/app.js";
import { connectAgent } from "../src/edge/mcp/mcp.fake.js";
import type { StageKind } from "../src/kernel/pipeline.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { derive } from "../src/kernel/runner/graph.js";
import type { RunConfig } from "../src/slices/admission/model.js";
import { stageStandingsByProject, stagesOf } from "../src/slices/admission/repo.js";
import { createRunNotifier } from "../src/slices/notifications/notifier.js";
import { noticeOf } from "../src/slices/notifications/rules.js";
import { noticeSubject } from "../src/slices/notifications/subject.js";
import { narrationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { executionStandings } from "../src/slices/rebuild/runtime-store.js";
import { answerExternalReview } from "../src/slices/reviews/external-repo.js";
import { waitingExternalReviews } from "../src/slices/reviews/external-waiting.js";
import { calendarRange } from "../src/slices/schedules/agenda.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

const closers: (() => void)[] = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

const answer = (content: unknown): unknown =>
  JSON.parse(z.array(z.object({ text: z.string() }).loose()).parse(content)[0]?.text ?? "null");

// Narration the provider refuses beside images that wait: for an External agent's review, or
// at the person's checkpoint (Images) before they are made.
async function failedBesideWait(wait: {
  readonly config?: (config: RunConfig) => RunConfig;
  readonly checkpoints?: readonly string[];
  // The step the provider refuses: the narration unless said otherwise.
  readonly failing?: { readonly kind: StageKind; readonly ports: Partial<Registry> };
}) {
  const h = await composedFixture(
    wait.failing?.ports ?? { tts: () => fakeTts({ refuse: "The narration was refused." }) },
  );
  h.setCatalogue({
    ...h.deps.catalogue.read(),
    providers: { ...h.deps.catalogue.read().providers, ...narrationCatalogue.providers },
    llm: narrationCatalogue.llm,
  });
  closers.push(() => h.audioPreviews.close());
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
  const base = current(h.deps, h.projectId);
  const config: RunConfig = {
    ...base.revision.config,
    sources: { ...base.revision.config.sources, audio: "generate" },
    audio: { provider: "openai-tts", model: "tts", voice: "first" },
    provided: { article: "abcd" },
  };
  await save(h.deps, h.projectId, {
    config: wait.config?.(config) ?? config,
    content: base.revision.content,
  });
  // Admitted with nothing started yet, so a checkpoint set now holds the images from the start.
  await start(
    { ...h.deps, runner: { ...h.runner, tick: () => undefined } },
    h.projectId,
    Object.keys(current(h.deps, h.projectId).revision.fingerprints),
  );
  if (wait.checkpoints !== undefined)
    expect(
      (
        await app.request(`/api/projects/${h.projectId}/checkpoints`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            revisionId: current(h.deps, h.projectId).revision.id,
            stages: wait.checkpoints,
          }),
        })
      ).status,
    ).toBe(200);
  h.runner.tick(h.projectId);
  const states = () =>
    Object.fromEntries(stagesOf(h.deps.db, h.projectId).map((stage) => [stage.kind, stage.state]));
  await vi.waitFor(
    async () => {
      await h.runner.settled();
      expect(states()[wait.failing?.kind ?? "audio"]).toBe("failed");
    },
    { timeout: 4_000, interval: 20 },
  );
  const agent = await connectAgent(app);
  const tool = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await agent.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).toBeUndefined();
    return answer(result.content);
  };
  // Every way the project's state is read: the stage rows (header, Projects, Home, calendar),
  // the runner's own standings (its announcement and the notices), and the MCP tools.
  const read = async () => {
    const listing = z
      .object({
        projects: z.array(
          z.object({ id: z.string(), status: z.string(), stateWord: z.string() }).loose(),
        ),
      })
      .loose()
      .parse(await tool("list_projects", {}))
      .projects.find((one) => one.id === h.projectId);
    const attention = z
      .object({ entries: z.array(z.object({ kind: z.string(), projectId: z.string() }).loose()) })
      .loose()
      .parse(await tool("needs_attention", {}))
      .entries.filter((entry) => entry.projectId === h.projectId)
      .map((entry) => entry.kind);
    const announced = h.events.flatMap((event) =>
      event.type === "project.state" && event.projectId === h.projectId ? [event.state] : [],
    );
    const now = Date.now();
    const range = calendarRange(
      { db: h.deps.db, clock: h.deps.clock, template: () => undefined },
      new Date(now - 3_600_000),
      new Date(now + 3_600_000),
    );
    if (!range.ok) throw new Error("The calendar range was refused.");
    return {
      calendar: range.value.projects.find((one) => one.id === h.projectId),
      rows: derive(stagesOf(h.deps.db, h.projectId)),
      listed: derive(stageStandingsByProject(h.deps.db, h.projectId).get(h.projectId) ?? []),
      runner: derive(executionStandings(h.deps, h.projectId)),
      announced: announced.at(-1),
      notice: noticeOf(announced.at(-2), announced.at(-1) ?? "pending"),
      listing,
      attention,
      response: (await (await app.request(`/api/projects/${h.projectId}`)).json()) as unknown,
      page: await tool("get_project", { id: h.projectId }),
    };
  };
  return { h, states, read, tool };
}

// The person's decision: while another step can still move, the wait wins over the failure,
// which still shows on the page and is listed as a failed item; the run reads Failed once
// nothing else can go on.
it("reads a failed step beside images an agent reviews as Waiting for the agent, then Failed", {
  timeout: 30_000,
}, async () => {
  const { h, states, read } = await failedBesideWait({
    config: (config) => ({
      ...config,
      reviews: {
        provider: "",
        model: "",
        reviewer: "agent",
        retries: 1,
        stages: { images: { mode: "flag" } },
      },
    }),
  });
  await vi.waitFor(() => expect(waitingExternalReviews(h.deps.db, h.projectId)).toHaveLength(2), {
    timeout: 4_000,
  });
  const waiting = await read();
  expect(waiting).toMatchObject({
    rows: "pending",
    listed: "pending",
    runner: "pending",
    announced: "pending",
    // A run parked on an agent's review sends no "Waiting for you" (`announces`).
    listing: { status: "pending", stateWord: "Waiting for the agent", waitingForAgent: true },
    // Read by its wait on the calendar, the failed step listed apart as on Home.
    calendar: { state: "pending", waitingForAgent: true, stepFailed: true },
    response: { project: { status: "pending", waitingForAgent: true } },
  });
  // Each failure by its identity, so While you were away tells each new one once.
  expect(waiting.listing).toMatchObject({
    stepFailed: true,
    stepFailures: [expect.stringMatching(/^audio@\d{4}-/)],
  });
  expect(waiting.calendar).not.toHaveProperty("needs");
  expect(waiting.attention).toEqual(expect.arrayContaining(["failed-step", "external-review"]));
  // The Notification URL hears what the runner said, read as it goes out.
  const sent: string[] = [];
  const notifier = createRunNotifier({
    url: () => "https://ntfy.example/topic",
    subject: (projectId) => noticeSubject(h.deps.db, projectId),
    send: async (_url, body) => {
      sent.push(body.split("\n")[0] ?? "");
      return { ok: true };
    },
    log: h.deps.log,
  });
  let heard = 0;
  const hear = async () => {
    for (const event of h.events.slice(heard)) notifier.observe(event);
    heard = h.events.length;
    await notifier.settled();
  };
  await hear();
  expect(sent).toEqual(["Step failed: Saved — Narration chunk 1 of 1: The narration was refused."]);

  for (const review of waitingExternalReviews(h.deps.db, h.projectId))
    answerExternalReview(h.deps.db, {
      projectId: h.projectId,
      id: review.id,
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: new Date().toISOString(),
    });
  h.runner.tick(h.projectId);
  await vi.waitFor(
    async () => {
      await h.runner.settled();
      expect(states().images).toBe("done");
    },
    { timeout: 4_000, interval: 20 },
  );
  const ended = await read();
  expect(ended).toMatchObject({
    rows: "failed",
    listed: "failed",
    runner: "failed",
    announced: "failed",
    notice: "failed",
    listing: { status: "failed", stateWord: "Failed" },
    calendar: { state: "failed", needs: "failed" },
  });
  expect(ended.listing).not.toHaveProperty("stepFailed");
  expect(ended.listing).not.toHaveProperty("stepFailures");
  expect(ended.calendar).not.toHaveProperty("stepFailed");
  expect(ended.attention).toEqual(["failed-step"]);
  // The run ended on the failure "Step failed" already told: no second notice.
  await hear();
  expect(sent).toHaveLength(1);
});

it("reads a failed step beside images held at the person's checkpoint as Waiting for your review", {
  timeout: 30_000,
}, async () => {
  const { read } = await failedBesideWait({ checkpoints: ["images"] });
  const waiting = await read();
  expect(waiting).toMatchObject({
    rows: "pending",
    listed: "pending",
    runner: "pending",
    announced: "pending",
    notice: "waiting",
    listing: { status: "pending", stateWord: "Waiting for your review", stepFailed: true },
    calendar: { state: "pending", needs: "review", stepFailed: true },
    // The page's header reads the project's own body: by its wait, not Queued.
    response: { project: { status: "pending", stepFailed: true } },
    page: { project: { stateWord: "Waiting for your review", stepFailed: true } },
  });
  expect(waiting.attention).toEqual(expect.arrayContaining(["failed-step", "checkpoint"]));
});

// A thumbnail drawn from its own prompt needs no article (`dependenciesOf`), so the runner goes
// on to it while the article has failed: parked on an agent's review, it still moves on once
// answered, and the run reads by that wait. It reads Failed once, after the verdict.
it("reads a failed article beside a thumbnail from its own prompt an agent reviews as waiting", {
  timeout: 30_000,
}, async () => {
  const { h, states, read } = await failedBesideWait({
    failing: {
      kind: "article",
      ports: { llm: () => fakeLlm({ refuse: "The article was refused." }) },
    },
    config: (config) => ({
      ...config,
      provided: {},
      sources: { ...config.sources, article: "generate", thumbnail: "from_prompt" },
      llm: { provider: "openrouter", model: "llm" },
      rendered: { ...config.rendered, article: "Write about rope.", thumbnailPrompt: "Cover" },
      reviews: {
        provider: "",
        model: "",
        reviewer: "agent",
        retries: 1,
        stages: { thumbnail: { mode: "flag" } },
      },
    }),
  });
  await vi.waitFor(() => expect(waitingExternalReviews(h.deps.db, h.projectId)).toHaveLength(1), {
    timeout: 4_000,
  });
  const waiting = await read();
  expect(waiting).toMatchObject({
    rows: "pending",
    listed: "pending",
    runner: "pending",
    announced: "pending",
    listing: { status: "pending", stateWord: "Waiting for the agent", stepFailed: true },
  });

  for (const review of waitingExternalReviews(h.deps.db, h.projectId))
    answerExternalReview(h.deps.db, {
      projectId: h.projectId,
      id: review.id,
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: new Date().toISOString(),
    });
  h.runner.tick(h.projectId);
  await vi.waitFor(
    async () => {
      await h.runner.settled();
      expect(states().thumbnail).toBe("done");
    },
    { timeout: 4_000, interval: 20 },
  );
  expect(await read()).toMatchObject({ rows: "failed", runner: "failed", announced: "failed" });
  const announced = h.events.flatMap((event) =>
    event.type === "project.state" && event.projectId === h.projectId ? [event.state] : [],
  );
  const notices = announced.map((state, at) => noticeOf(announced[at - 1], state));
  expect(notices.filter((notice) => notice === "failed")).toHaveLength(1);
});
