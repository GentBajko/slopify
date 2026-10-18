import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { createHub } from "../src/edge/events/hub.js";
import { createApp } from "../src/edge/http/app.js";
import { connectAgent } from "../src/edge/mcp/mcp.fake.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import type { TtsPort } from "../src/kernel/ports/tts.js";
import { setProjectPaused } from "../src/slices/admission/repo.js";
import { needsAttention } from "../src/slices/agents/attention.js";
import { recoverCheckpointWork } from "../src/slices/checkpoints/recovery.js";
import { recoverProject } from "../src/slices/rebuild/recovery.js";
import {
  answerExternalReview,
  settleExternalReviews,
} from "../src/slices/reviews/external-repo.js";
import { externalReviewById } from "../src/slices/reviews/external-rows.js";
import { reviewStanding, waitingExternalReviews } from "../src/slices/reviews/external-waiting.js";
import { actOnVerdict, pendingRedos } from "../src/slices/reviews/repo.js";
import { markUploaded } from "../src/slices/uploads/repo.js";
import { current } from "./revision-rebuild.fake.js";
import {
  articleConfig,
  noImages,
  quiet,
  reviewedRun,
  section,
  still,
} from "./revision-reviews-stages.fake.js";

vi.mock("../src/adapters/alignment/index.js", () => {
  const mocked = {
    alignSubtitles: async (request: { readonly text: string }) =>
      request.text
        .split(/\s+/)
        .filter((word) => word !== "")
        .map((text, index) => ({ text, start: index, end: index + 0.9 })),
  };
  return { ...mocked, alignSubtitlesWith: () => mocked.alignSubtitles };
});

it("shows the article reviewer the prompt, the research and the article, and flags a failed one", async () => {
  const { h, asked, llm, verdicts } = await reviewedRun({
    fail: () => ["It invents a rope museum."],
    config: articleConfig,
    content: noImages,
    reviews: { retries: 1, stages: { article: { mode: "flag" } } },
  });
  try {
    expect(asked).toHaveLength(1);
    const text = asked[0]?.text ?? "";
    expect(section(text, "Article prompt the article was written from")).toBe(
      "Write about rope in one paragraph.",
    );
    expect(section(text, "Research notes")).toContain("Rope was first twisted from reeds.");
    expect(section(text, "Article")).toContain("Rope holds.");
    expect(asked[0]?.images).toEqual([]);
    expect(
      verdicts().map((row) => [row.itemKey, row.stage, row.outcome, row.attempt, row.reasons]),
    ).toEqual([["article:body", "article", "flagged", 1, ["It invents a rope museum."]]]);
    // One article, one review: Flag only writes nothing again.
    expect(llm.calls()).toBe(2);
  } finally {
    h.close();
  }
});

it("writes a failed article again once, then keeps it and flags it", async () => {
  let written = 0;
  const { h, deps, asked, verdicts } = await reviewedRun({
    fail: () => ["It invents a rope museum."],
    work: () => [`# Rope\n\nRope holds, take ${String(++written)}.`],
    config: articleConfig,
    content: noImages,
    reviews: { retries: 1, stages: { article: { mode: "redo" } } },
  });
  try {
    expect(verdicts().map((row) => [row.itemKey, row.attempt, row.outcome, row.redoState])).toEqual(
      [
        ["article:body", 1, "redo", "started"],
        ["article:body", 2, "flagged", null],
      ],
    );
    expect(written).toBe(2);
    // The second review read the article written again.
    expect(asked.map((one) => section(one.text, "Article"))).toEqual([
      expect.stringContaining("take 1."),
      expect.stringContaining("take 2."),
    ]);
    expect(current(deps, h.projectId).revision.content.regenerationTokens).toHaveProperty(
      "article:body",
    );
  } finally {
    h.close();
  }
});

it("shows the narration reviewer the hand-edited words the voice read, not the article", async () => {
  const { h, asked, verdicts } = await reviewedRun({
    fail: () => ["The second sentence is missing."],
    // Long enough for every word the timing hears at one a second.
    speech: quiet(12),
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", images: "off" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds fast in the museum." },
    }),
    content: noImages,
    // The narration's one part, reworded by hand in Edit project → Narration.
    handEdit: (saved) => {
      const parts = Object.keys(saved.revision.fingerprints).flatMap((key) => {
        const logical = /^(audio:body:.+):\d+$/.exec(key)?.[1];
        return logical === undefined || logical === "audio:body:concat" ? [] : [logical];
      });
      expect(parts).toHaveLength(1);
      return {
        ...saved.revision.content,
        narrationOverrides: Object.fromEntries(
          parts.map((key) => [key, { kind: "text" as const, text: "Rope holds fast and true." }]),
        ),
      };
    },
    reviews: { stages: { narration: { mode: "flag" } } },
  });
  try {
    expect(asked).toHaveLength(1);
    const text = asked[0]?.text ?? "";
    const read = section(text, "Text the narration was read from");
    expect(read).toContain("Rope holds fast and true.");
    expect(read).not.toContain("museum");
    expect(section(text, "What the timing heard")).toBe("Rope holds fast and true.");
    expect(section(text, "Stretches of text the timing could not hear")).toBe("None.");
    expect(asked[0]?.images).toEqual([]);
    expect(
      verdicts().map((row) => [row.itemKey, row.stage, row.outcome, row.reasons, row.redoState]),
    ).toEqual([["narration", "narration", "flagged", ["The second sentence is missing."], null]]);
  } finally {
    h.close();
  }
});

it("shows the thumbnail reviewer the thumbnail file and the video title", async () => {
  const { h, asked, images, verdicts } = await reviewedRun({
    fail: () => ["The title text cannot be read on a phone."],
    config: (base) => ({
      ...base,
      title: "Rope Tricks",
      sources: { ...base.sources, images: "off", thumbnail: "from_prompt" },
      rendered: { ...base.rendered, thumbnailPrompt: "A bold rope thumbnail." },
    }),
    content: noImages,
    reviews: { stages: { thumbnail: { mode: "flag" } } },
  });
  try {
    expect(images.calls()).toBe(1);
    expect(asked).toHaveLength(1);
    const text = asked[0]?.text ?? "";
    expect(section(text, "Video title")).toBe("Rope Tricks");
    expect(section(text, "Brief the image was drawn from")).toContain("A bold rope thumbnail.");
    expect(text).toContain("Attached images (look at every one before answering): the thumbnail");
    // The thumbnail file itself, still on disk.
    expect(asked[0]?.images).toHaveLength(1);
    expect(existsSync(asked[0]?.images[0] ?? "")).toBe(true);
    expect(verdicts().map((row) => [row.itemKey, row.stage, row.outcome, row.reasons])).toEqual([
      ["thumbnail:image", "thumbnail", "flagged", ["The title text cannot be read on a phone."]],
    ]);
  } finally {
    h.close();
  }
});

// Two shorts from forty words at one a second (as `revision-shorts.test.ts` sets them up):
// sentences 1-3 in two vertical images, sentences 5-8 in three.
const clip = (first: number, last: number) => ({
  first,
  last,
  title: `Sentences ${String(first)} to ${String(last)}`,
  description: "A clip that stands alone.",
  hashtags: ["#Sentences", "#Words", "#Test"],
  why: "It has a hook.",
});
function shortsWork(request: LlmCompletion): readonly string[] {
  const system = request.messages[0]?.content ?? "";
  if (system.startsWith("You pick clips")) return [JSON.stringify([clip(1, 3), clip(5, 8)])];
  const count = Number(/Exactly (\d+) prompt/.exec(system)?.[1] ?? "0");
  return [JSON.stringify(Array.from({ length: count }, (_value, at) => `Image ${String(at + 1)}`))];
}

it("shows each short's reviewer its title and its images, and flags a failed short on its own", {
  timeout: 60_000,
}, async () => {
  const { h, asked, verdicts } = await reviewedRun({
    fail: (one) =>
      section(one.text, "Title of the short") === "Sentences 5 to 8"
        ? ["The third image shows stray letters."]
        : undefined,
    work: shortsWork,
    image: fakeImage({ bytes: still("270x480") }),
    speech: quiet(40),
    config: (base) => ({
      ...base,
      title: "Sentences",
      sources: { ...base.sources, audio: "generate", images: "off", video: "off" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      llm: { provider: "openrouter", model: "llm" },
      chunking: { mode: "whole" },
      provided: {
        article: Array.from(
          { length: 8 },
          (_value, at) => `Sentence ${String(at + 1)} has five words.`,
        ).join(" "),
      },
      edgeSilenceSeconds: 2,
      imageSeconds: 10,
      motionStyle: "still",
      shorts: { enabled: true, count: 2, minSeconds: 15, maxSeconds: 25 },
    }),
    content: noImages,
    reviews: { stages: { shorts: { mode: "flag" } } },
  });
  try {
    const byTitle = Object.fromEntries(
      asked.map((one) => [section(one.text, "Title of the short"), one]),
    );
    expect(Object.keys(byTitle).sort()).toEqual(["Sentences 1 to 3", "Sentences 5 to 8"]);
    // Each review is shown its own short's stills: two and three vertical images.
    expect(byTitle["Sentences 1 to 3"]?.images).toHaveLength(2);
    expect(byTitle["Sentences 5 to 8"]?.images).toHaveLength(3);
    expect(byTitle["Sentences 5 to 8"]?.text).toContain(
      "image 1 of the short; image 2 of the short; image 3 of the short",
    );
    expect(
      verdicts()
        .map((row) => [row.itemKey, row.stage, row.outcome, row.reasons])
        .sort(),
    ).toEqual([
      ["shorts:1", "shorts", "passed", []],
      ["shorts:2", "shorts", "flagged", ["The third image shows stray letters."]],
    ]);
  } finally {
    h.close();
  }
});

it("lets Overrule call off a redo that has not started, and releases the work held for it", {
  timeout: 30_000,
}, async () => {
  // The redos are not bound during the run, so image "one"'s failed review stays a pending
  // redo and the video that shows it waits.
  const { h, deps, runner, redos, images, verdicts, settle } = await reviewedRun({
    fail: (one) => (one.text.includes('"""\nOne\n"""') ? ["A hand has six fingers."] : undefined),
    speech: quiet(2),
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", video: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds fast." },
      motionStyle: "still",
    }),
    reviews: { retries: 1, stages: { images: { mode: "redo" } } },
    unbound: true,
  });
  try {
    const video = () =>
      current(deps, h.projectId).outputs.filter(
        (row) =>
          row.workKey === "export:video" &&
          row.output.role === "video" &&
          row.selected &&
          row.state === "ready",
      );
    const waiting = pendingRedos(deps.db, h.projectId);
    expect(waiting.map((row) => [row.itemKey, row.outcome, row.redoState])).toEqual([
      ["image:one", "redo", "pending"],
    ]);
    expect(video()).toEqual([]);
    expect(images.calls()).toBe(2);

    const pending = waiting[0];
    if (pending === undefined) throw new Error("no pending redo");
    expect(actOnVerdict(deps.db, h.projectId, pending.id, "overruled", "now")).toMatchObject({
      ok: true,
      value: { action: "overruled", redoState: null },
    });
    expect(pendingRedos(deps.db, h.projectId)).toEqual([]);

    // Nothing is left to redo once the redos run, and the held video goes ahead.
    redos.bind(deps);
    redos.kick(h.projectId);
    runner.tick(h.projectId);
    await settle();
    expect(images.calls()).toBe(2);
    expect(video()).toHaveLength(1);
    expect(
      verdicts()
        .filter((row) => row.itemKey === "image:one")
        .map((row) => [row.attempt, row.outcome, row.action, row.redoState]),
    ).toEqual([[1, "redo", "overruled", null]]);
    expect(current(deps, h.projectId).revision.content.regenerationTokens).not.toHaveProperty(
      "image:one",
    );
  } finally {
    h.close();
  }
});

it("holds the video while an agent's reviews wait, opens new ones after Re-run, and renders once answered", {
  timeout: 30_000,
}, async () => {
  const { h, deps, runner, images, asked, settle } = await reviewedRun({
    fail: () => undefined,
    speech: quiet(2),
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", video: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds fast." },
      motionStyle: "still",
    }),
    reviews: { reviewer: "agent", retries: 0, stages: { images: { mode: "flag" } } },
  });
  try {
    const video = () =>
      current(deps, h.projectId).outputs.filter(
        (row) =>
          row.workKey === "export:video" &&
          row.output.role === "video" &&
          row.selected &&
          row.state === "ready",
      );
    const first = waitingExternalReviews(deps.db, h.projectId);
    expect(first).toHaveLength(2);
    expect(video()).toEqual([]);
    expect(images.calls()).toBe(2);

    // Pause, then Re-run Images while the reviews wait: the new images get reviews of their
    // own and the old ones are replaced.
    setProjectPaused(deps.db, h.projectId, true, new Date().toISOString());
    expect(
      await recoverProject(deps, h.projectId, {
        baseRevisionId: current(deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "rerun", stage: "images" },
      }),
    ).toMatchObject({ ok: true });
    runner.tick(h.projectId);
    await settle();
    const second = waitingExternalReviews(deps.db, h.projectId);
    expect(images.calls()).toBe(4);
    expect(second).toHaveLength(2);
    expect(second.map((row) => row.id)).not.toEqual(
      expect.arrayContaining(first.map((row) => row.id)),
    );
    expect(video()).toEqual([]);

    // The few-seconds settle (`main.ts` releaseReviews) marks the replaced ones.
    settleExternalReviews(deps.db, new Date());
    for (const old of first) {
      const replaced = externalReviewById(deps.db, h.projectId, old.id);
      expect(replaced?.state).toBe("superseded");
      // Its item's new review waits, so the old one says it was replaced (`replacementWaits`).
      if (replaced !== undefined) expect(reviewStanding(deps.db, replaced)).toBe("superseded");
    }
    for (const review of second)
      answerExternalReview(deps.db, {
        projectId: h.projectId,
        id: review.id,
        verdict: { passed: true, reasons: [] },
        by: "agent",
        at: new Date().toISOString(),
      });
    runner.tick(h.projectId);
    await settle();
    expect(video()).toHaveLength(1);
    expect(asked).toEqual([]);
  } finally {
    h.close();
  }
});

// A restart holds every unfinished step for Continue the run (`recoverWork`); an agent's answer
// releases only the step it reviewed. So while the agent reviews, the person is offered
// Continue, and the run goes on to its video once both are done.
it("offers Continue the run while an agent reviews when a restart held the video, and renders", {
  timeout: 30_000,
}, async () => {
  const { h, deps, runner, settle } = await reviewedRun({
    fail: () => undefined,
    speech: quiet(2),
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", video: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds fast." },
      motionStyle: "still",
    }),
    reviews: { reviewer: "agent", retries: 0, stages: { images: { mode: "flag" } } },
  });
  try {
    const app = createApp({
      ...h.deps,
      hub: createHub(h.deps),
      runner,
      version: "test",
      webDist: "/missing",
      probe: async () => ({ ran: false, stdout: "" }),
      flushSoon: () => undefined,
    });
    const page = async () =>
      (await (await app.request(`/api/projects/${h.projectId}`)).json()) as {
        readonly resumable: boolean;
        readonly project: { readonly waitingForAgent?: boolean };
      };
    const video = () =>
      current(deps, h.projectId).outputs.filter(
        (row) =>
          row.workKey === "export:video" &&
          row.output.role === "video" &&
          row.selected &&
          row.state === "ready",
      );
    // What boot does before anything runs (`main.ts`).
    recoverCheckpointWork(deps.db);
    const waiting = await page();
    expect(waiting.resumable).toBe(true);
    expect(waiting.project.waitingForAgent).toBeUndefined();
    expect(
      await recoverProject(deps, h.projectId, {
        baseRevisionId: current(deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" },
      }),
    ).toMatchObject({ ok: true });
    await settle();
    // Only the agent's reviews hold the run now: nothing for the person to press.
    expect(await page()).toMatchObject({ resumable: false, project: { waitingForAgent: true } });
    for (const review of waitingExternalReviews(deps.db, h.projectId))
      answerExternalReview(deps.db, {
        projectId: h.projectId,
        id: review.id,
        verdict: { passed: true, reasons: [] },
        by: "agent",
        at: new Date().toISOString(),
      });
    runner.tick(h.projectId);
    await settle();
    expect(video()).toHaveLength(1);
  } finally {
    h.close();
  }
});

// An uploaded project whose remake a restart held is not settled: its admitted steps wait for
// Continue the run, so it reads Stopped everywhere it is listed, and the remake finishes after.
it("stops an uploaded project's remake a restart held, and finishes it after Continue", {
  timeout: 30_000,
}, async () => {
  const { h, deps, runner, settle } = await reviewedRun({
    fail: () => undefined,
    speech: quiet(2),
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", video: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article: "Rope holds fast." },
      motionStyle: "still",
    }),
    reviews: { reviewer: "agent", retries: 0, stages: { images: { mode: "flag" } } },
  });
  try {
    const app = createApp({
      ...h.deps,
      hub: createHub(h.deps),
      runner,
      version: "test",
      webDist: "/missing",
      probe: async () => ({ ran: false, stdout: "" }),
      flushSoon: () => undefined,
    });
    const page = async () =>
      (await (await app.request(`/api/projects/${h.projectId}`)).json()) as {
        readonly resumable: boolean;
        readonly project: { readonly status: string };
      };
    const listed = async () =>
      (
        (await (await app.request("/api/projects")).json()) as {
          readonly projects: readonly { readonly id: string }[];
        }
      ).projects.find((one) => one.id === h.projectId);
    markUploaded(deps.db, h.projectId, true, new Date().toISOString());
    // What boot does before anything runs (`main.ts`).
    recoverCheckpointWork(deps.db);
    expect(await page()).toMatchObject({ resumable: true, project: { status: "pending" } });
    expect(await listed()).toMatchObject({ status: "pending", stopped: true });
    expect(
      needsAttention({ ...deps, log: { write: () => undefined } }, new Date()).map(
        (entry) => entry.kind,
      ),
    ).toContain("stopped-run");
    expect(
      await recoverProject(deps, h.projectId, {
        baseRevisionId: current(deps, h.projectId).revision.id,
        idempotencyKey: randomUUID(),
        action: { kind: "resume" },
      }),
    ).toMatchObject({ ok: true });
    await settle();
    for (const review of waitingExternalReviews(deps.db, h.projectId))
      answerExternalReview(deps.db, {
        projectId: h.projectId,
        id: review.id,
        verdict: { passed: true, reasons: [] },
        by: "agent",
        at: new Date().toISOString(),
      });
    runner.tick(h.projectId);
    await settle();
    expect(
      current(deps, h.projectId).outputs.filter(
        (row) =>
          row.workKey === "export:video" &&
          row.output.role === "video" &&
          row.selected &&
          row.state === "ready",
      ),
    ).toHaveLength(1);
    expect(await listed()).toMatchObject({ status: "done" });
  } finally {
    h.close();
  }
});

// A restart while an agent reviews the images and the narration is half recorded: the voice's
// step ends held for Continue the run, while the video's stays allowed, as boot keeps it behind
// a Before Video checkpoint (`recoverCheckpointWork`). Nothing moves the run on by itself, so it
// reads Stopped with Continue offered, an agent continues it through MCP like a paused run, and
// the video renders once the agent has answered.
it("stops a run a restart cut off while an agent reviews, and an agent continues it to its video", {
  timeout: 60_000,
}, async () => {
  const voice = fakeTts({ bytesFor: () => [quiet(1)] });
  let release: () => void = () => undefined;
  const cutOff = new Promise<void>((resolve) => {
    release = resolve;
  });
  let first = true;
  const tts: TtsPort = {
    ...voice,
    synthesize: async (request) => {
      if (first) {
        first = false;
        await cutOff;
      }
      return voice.synthesize(request);
    },
  };
  const { h, deps, runner, settle } = await reviewedRun({
    fail: () => undefined,
    tts,
    unsettled: true,
    config: (base) => ({
      ...base,
      sources: { ...base.sources, audio: "generate", video: "generate" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "paragraph" },
      provided: { article: "Rope holds fast.\n\nKnots hold it." },
      motionStyle: "still",
    }),
    reviews: { reviewer: "agent", retries: 0, stages: { images: { mode: "flag" } } },
  });
  try {
    const app = createApp({
      ...h.deps,
      hub: createHub(h.deps),
      runner,
      rebuild: deps,
      version: "test",
      webDist: "/missing",
      probe: async () => ({ ran: false, stdout: "" }),
      flushSoon: () => undefined,
    });
    const page = async () =>
      (await (await app.request(`/api/projects/${h.projectId}`)).json()) as {
        readonly revisionId: string;
        readonly resumable: boolean;
        readonly project: { readonly stopped?: boolean; readonly waitingForAgent?: boolean };
      };
    const agent = await connectAgent(app);
    const call = async (name: string, args: Record<string, unknown>): Promise<void> => {
      const result = await agent.callTool({ name, arguments: { id: h.projectId, ...args } });
      expect(result.isError, JSON.stringify(result.content)).toBeUndefined();
    };
    await vi.waitFor(() => expect(waitingExternalReviews(deps.db, h.projectId)).not.toEqual([]), {
      timeout: 20_000,
      interval: 20,
    });
    // The process stops with the first chunk in flight: boot holds what was unfinished and
    // keeps the video's step allowed.
    recoverCheckpointWork(deps.db);
    deps.db
      .prepare(
        "UPDATE revision_work SET dispatch_state='allowed' WHERE project_id=? AND kind='video' AND state='pending'",
      )
      .run(h.projectId);
    release();
    await runner.settled();
    expect(await page()).toMatchObject({ resumable: true, project: { stopped: true } });
    // The agent finds it among what needs attention and continues it with the entry's ids.
    const listed = await agent.callTool({ name: "needs_attention", arguments: {} });
    const entry = z
      .object({
        entries: z.array(
          z
            .object({
              kind: z.string(),
              tools: z.array(z.string()),
              ids: z.record(z.string(), z.string()),
            })
            .loose(),
        ),
      })
      .parse(
        JSON.parse(
          z.array(z.object({ text: z.string() }).loose()).parse(listed.content)[0]?.text ?? "null",
        ),
      )
      .entries.find((one) => one.kind === "stopped-run");
    expect(entry?.tools).toEqual(["get_project", "resume_project"]);
    await call("resume_project", {
      body: { baseRevisionId: entry?.ids.baseRevisionId, idempotencyKey: randomUUID() },
    });
    await settle();
    // The narration is made; only the agent's review holds the run now.
    expect(await page()).toMatchObject({ resumable: false, project: { waitingForAgent: true } });
    for (const review of waitingExternalReviews(deps.db, h.projectId))
      await call("submit_review_verdict", {
        reviewId: review.id,
        body: { verdict: "pass", reasons: [] },
      });
    await settle();
    expect(
      current(deps, h.projectId).outputs.filter(
        (row) =>
          row.workKey === "export:video" &&
          row.output.role === "video" &&
          row.selected &&
          row.state === "ready",
      ),
    ).toHaveLength(1);
  } finally {
    h.close();
  }
});
