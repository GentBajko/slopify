import type { StageKind, StageState } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { fixFor } from "@app/slices/fixes/rules.js";
import { describe, expect, it } from "vitest";
import {
  firstOutdated,
  type NextActionInput,
  nextActionFor,
  outdatedGroups,
} from "./next-action.js";

function stage(kind: StageKind, state: StageState, over: Partial<Stage> = {}): Stage {
  return {
    id: `s-${kind}`,
    projectId: "p1",
    kind,
    source: "generate",
    state,
    failureReason: null,
    attemptCount: 1,
    progressCurrent: null,
    progressTotal: null,
    startedAt: null,
    finishedAt: null,
    ...over,
  };
}

const config = {
  sources: { research: "generate", article: "generate", audio: "generate", images: "generate" },
} as unknown as ProjectSummary["config"];

const finished = [
  stage("article", "done"),
  stage("audio", "done"),
  stage("images", "done"),
  stage("video", "done"),
];

function input(over: Partial<NextActionInput> = {}): NextActionInput {
  return {
    project: { status: "done", config },
    stages: finished,
    resumable: false,
    sample: false,
    held: [],
    outdated: [],
    waits: [],
    uploadReady: true,
    fixOf: (one) =>
      fixFor({
        stage: one.kind,
        kind: one.failureKind,
        reason: one.failureReason,
        provider: "codex-image",
      }),
    clock: (iso) => iso.slice(11, 16),
    ...over,
  };
}

describe("the next action", () => {
  it("offers the sample's own copy before anything else", () => {
    const next = nextActionFor(input({ sample: true, project: { status: "paused", config } }));
    expect(next?.situation).toBe("sample");
    expect(next?.action).toEqual({ label: "Make my own copy", intent: { kind: "copy-sample" } });
  });

  it("continues a paused run", () => {
    const next = nextActionFor(
      input({
        project: { status: "paused", config },
        stages: [stage("article", "done"), stage("images", "pending")],
      }),
    );
    expect(next).toMatchObject({
      situation: "paused",
      tone: "waiting",
      action: { label: "Continue the run", intent: { kind: "resume" } },
    });
    expect(next?.section).toBeUndefined();
  });

  it("names a failed step's retry for the step and puts it beside the images", () => {
    const next = nextActionFor(
      input({
        project: { status: "failed", config },
        stages: [
          stage("article", "done"),
          stage("images", "failed", { failureReason: "The request timed out." }),
        ],
      }),
    );
    expect(next).toMatchObject({
      situation: "failed",
      tone: "failed",
      section: "images",
      detail: "The request timed out.",
      action: { label: "Try images again", intent: { kind: "retry", stage: "images" } },
    });
  });

  it("says the article in a retry label", () => {
    const next = nextActionFor(
      input({ project: { status: "failed", config }, stages: [stage("article", "failed")] }),
    );
    expect(next?.action?.label).toBe("Try the article again");
    expect(next?.section).toBe("article");
  });

  it("gives a signed-out CLI's command and still retries", () => {
    const next = nextActionFor(
      input({
        project: { status: "failed", config },
        stages: [stage("images", "failed", { failureReason: "Codex CLI is not signed in." })],
      }),
    );
    expect(next?.title).toBe("Codex is signed out, so images stopped.");
    expect(next?.why).toContain("codex login");
    expect(next?.action?.intent).toEqual({ kind: "retry", stage: "images" });
  });

  it("softens a refused image prompt", () => {
    const next = nextActionFor(
      input({
        project: { status: "failed", config },
        stages: [stage("images", "failed", { failureKind: "refusal", failureReason: "no" })],
      }),
    );
    expect(next?.action).toEqual({
      label: "Soften and retry",
      intent: { kind: "soften", stage: "images" },
    });
  });

  it("sends a refused article prompt to the settings", () => {
    const next = nextActionFor(
      input({
        project: { status: "failed", config },
        stages: [stage("article", "failed", { failureKind: "refusal", failureReason: "no" })],
        fixOf: (one) => fixFor({ stage: one.kind, kind: one.failureKind, reason: "no" }),
      }),
    );
    expect(next?.action).toEqual({ label: "Edit the prompt", intent: { kind: "edit" } });
  });

  it("switches a retired model in the settings", () => {
    const next = nextActionFor(
      input({
        project: { status: "failed", config },
        stages: [stage("article", "failed", { failureReason: "Unknown model gpt-3" })],
        fixOf: (one) => fixFor({ stage: one.kind, reason: one.failureReason }),
      }),
    );
    expect(next?.action).toEqual({ label: "Switch model", intent: { kind: "edit" } });
  });

  it("opens the provider settings for a rejected key and Storage for a full disk", () => {
    const key = nextActionFor(
      input({
        project: { status: "failed", config },
        stages: [stage("audio", "failed", { failureKind: "missing_key", failureReason: "x" })],
        fixOf: (one) =>
          fixFor({ stage: one.kind, kind: one.failureKind, reason: "x", provider: "elevenlabs" }),
      }),
    );
    expect(key?.action?.intent).toEqual({ kind: "open-settings", section: "providers" });
    expect(key?.section).toBe("narration");
    const disk = nextActionFor(
      input({
        project: { status: "failed", config },
        stages: [stage("video", "failed", { failureReason: "ENOSPC: no space left on device" })],
      }),
    );
    expect(disk?.action).toEqual({
      label: "Free space",
      intent: { kind: "open-settings", section: "storage" },
    });
  });

  it("approves a held checkpoint, named for what runs next", () => {
    const gate = { checkpointId: "c1", stage: "images" as const, dependents: ["video" as const] };
    const next = nextActionFor(
      input({
        project: { status: "running", config },
        stages: [stage("images", "done"), stage("video", "pending")],
        held: [gate],
      }),
    );
    expect(next).toMatchObject({
      situation: "held",
      status: "Waiting for you",
      title: "The images are ready for your review.",
      section: "images",
      action: { label: "Approve and render the video", intent: { kind: "approve", gate } },
    });
    const narration = nextActionFor(
      input({
        held: [{ checkpointId: "c2", stage: "audio", dependents: ["images"] }],
      }),
    );
    expect(narration?.title).toBe("The narration is ready for your review.");
    expect(narration?.action?.label).toBe("Approve and make the images");
  });

  it("shows no button while waiting for plan limits, only the reason", () => {
    const next = nextActionFor(
      input({
        project: { status: "running", config },
        stages: [stage("images", "running")],
        waits: [
          {
            name: "Codex",
            stage: "images",
            resetsAt: "2026-09-27T14:05:00.000Z",
            retryAt: "2026-09-27T14:06:00.000Z",
          },
        ],
      }),
    );
    expect(next).toMatchObject({ situation: "waiting", title: "Waiting for your Codex limits." });
    expect(next?.why).toContain("14:05");
    expect(next?.action).toBeUndefined();
  });

  it("shows no button while a step waits to try again by itself", () => {
    const next = nextActionFor(
      input({
        project: { status: "running", config },
        stages: [
          stage("audio", "failed", {
            retryAt: "2026-09-27T09:30:00.000Z",
            failureReason: "Rate limited",
          }),
        ],
      }),
    );
    expect(next).toMatchObject({
      situation: "waiting",
      title: "Narration will try again by itself at 09:30.",
      section: "narration",
    });
    expect(next?.action).toBeUndefined();
  });

  it("pauses a running run", () => {
    const next = nextActionFor(
      input({
        project: { status: "running", config },
        stages: [
          stage("article", "done"),
          stage("images", "running", { progressCurrent: 8, progressTotal: 9 }),
        ],
      }),
    );
    expect(next).toMatchObject({
      situation: "running",
      title: "Making the images · 8 of 9.",
      action: { label: "Pause", intent: { kind: "pause" } },
    });
  });

  it("continues a stopped or resumable run", () => {
    expect(nextActionFor(input({ project: { status: "canceled", config } }))?.action?.label).toBe(
      "Continue the run",
    );
    expect(
      nextActionFor(
        input({ project: { status: "pending", config }, resumable: true, uploadReady: false }),
      )?.situation,
    ).toBe("stopped");
  });

  it("says a queued run waits for its turn, without a button", () => {
    const next = nextActionFor(
      input({
        project: { status: "pending", config },
        stages: [stage("article", "pending")],
        uploadReady: false,
      }),
    );
    expect(next?.situation).toBe("queued");
    expect(next?.action).toBeUndefined();
  });

  it("remakes exactly the outdated images after an edit", () => {
    const next = nextActionFor(
      input({
        outdated: [
          { workKey: "image:a", role: "image" },
          { workKey: "image:b", role: "image" },
          { workKey: "image:c", role: "image" },
          { workKey: "export:video", role: "video" },
          { workKey: "subtitles:files", role: "subtitles_srt" },
        ],
      }),
    );
    expect(next).toMatchObject({
      situation: "outdated",
      tone: "info",
      title: "3 images are outdated after your edit.",
      section: "images",
      action: {
        label: "Remake 3 outdated images",
        intent: { kind: "remake", workKeys: ["image:a", "image:b", "image:c"] },
      },
    });
  });

  it("names a single outdated thing without a count", () => {
    expect(firstOutdated([{ workKey: "image:a", role: "image" }])?.count).toBe(1);
    const next = nextActionFor(
      input({
        outdated: [
          { workKey: "export:video", role: "video" },
          { workKey: "subtitles:files", role: "subtitles_vtt" },
        ],
      }),
    );
    expect(next?.action).toEqual({
      label: "Remake the outdated video",
      intent: { kind: "remake", workKeys: ["export:video", "subtitles:files"] },
    });
    expect(next?.title).toBe("The video is outdated after your edit.");
  });

  it("lists every outdated group for the palette", () => {
    expect(
      outdatedGroups([
        { workKey: "shorts:1:render", role: "short_video" },
        { workKey: "shorts:2:render", role: "short_video" },
        { workKey: "image:a", role: "image" },
      ]).map((group) => group.label),
    ).toEqual(["Remake the outdated image", "Remake 2 outdated shorts"]);
  });

  it("prepares the upload once the video is done", () => {
    const next = nextActionFor(input());
    expect(next).toMatchObject({
      situation: "done",
      section: "youtube",
      action: { label: "Prepare upload", intent: { kind: "prepare-upload" } },
    });
    expect(nextActionFor(input({ project: { status: "partial", config } }))?.situation).toBe(
      "done",
    );
  });

  it("shows nothing when a finished run has nothing to upload", () => {
    expect(nextActionFor(input({ uploadReady: false }))).toBeUndefined();
  });

  it("orders the situations: paused, failed, held, waiting, running, outdated, done", () => {
    const everything = input({
      project: { status: "running", config },
      stages: [stage("images", "failed"), stage("video", "running")],
      held: [{ checkpointId: "c", stage: "images", dependents: ["video"] }],
      outdated: [{ workKey: "image:a", role: "image" }],
      waits: [{ name: "Codex", stage: "images", resetsAt: null, retryAt: "2026-09-27T10:00:00Z" }],
    });
    expect(nextActionFor({ ...everything, project: { status: "paused", config } })?.situation).toBe(
      "paused",
    );
    expect(nextActionFor(everything)?.situation).toBe("failed");
    const noFailure = { ...everything, stages: [stage("video", "running")] };
    expect(nextActionFor(noFailure)?.situation).toBe("held");
    expect(nextActionFor({ ...noFailure, held: [] })?.situation).toBe("waiting");
    expect(nextActionFor({ ...noFailure, held: [], waits: [] })?.situation).toBe("running");
    expect(
      nextActionFor({
        ...noFailure,
        held: [],
        waits: [],
        stages: finished,
        project: { status: "done", config },
      })?.situation,
    ).toBe("outdated");
  });

  it("leads a finished short to the full video on its topic, ahead of Prepare upload", () => {
    const short = { ...config, mode: "short" } as ProjectSummary["config"];
    expect(nextActionFor(input({ project: { status: "done", config: short } }))).toMatchObject({
      situation: "done",
      title: "The short is ready.",
      action: { label: "Make the full video on this topic", intent: { kind: "full-video" } },
    });
    // Not before it is done, and never for a long video.
    expect(
      nextActionFor(input({ project: { status: "partial", config: short }, uploadReady: false })),
    ).toBeUndefined();
    expect(nextActionFor(input())?.action?.intent.kind).toBe("prepare-upload");
  });
});
