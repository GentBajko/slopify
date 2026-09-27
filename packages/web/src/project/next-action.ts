import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Fix } from "@app/slices/fixes/rules.js";
import type { OutputRole } from "@app/slices/storage/model.js";
import type { Tone } from "@/components/kit/status";
import { limitNames, limitWaitLine } from "./limit-wait.js";
import { finalOutput } from "./summary.js";

// The next action rule (docs/design-system.md, "Controls that say what they do"): a project
// shows exactly one action for its situation, named for its result, and only when it applies.
// This is the one place that decides it, from the project's state alone, so the right rail,
// the section it concerns and the command palette can never disagree. The mapping table is
// written out in docs/design-system.md; next-action.test.ts covers every row.

// The project page's places: the stage sections, the run's cost and live view, and the
// settings views that replace the main column.
export type SectionId =
  | "article"
  | "narration"
  | "images"
  | "video"
  | "shorts"
  | "youtube"
  | "document"
  | "cost"
  | "live"
  | "settings"
  | "history"
  | "checkpoints";

export function sectionForStage(stage: StageKind): SectionId {
  switch (stage) {
    case "research":
    case "article":
      return "article";
    case "audio":
      return "narration";
    case "images":
    case "thumbnail":
      return "images";
    case "video":
      return "video";
    case "document":
      return "document";
  }
}

// A checkpoint holding work for the person: approving it lets its dependents run.
export interface HeldGate {
  readonly checkpointId: string;
  readonly stage: StageKind;
  readonly dependents: readonly StageKind[];
}

// A saved output the last edit made outdated, and the rebuild work that makes it again.
export interface OutdatedOutput {
  readonly workKey: string;
  readonly role: OutputRole;
}

// A stage waiting for a CLI plan's limits to reset.
export interface LimitWaitLike {
  readonly name: string;
  readonly stage: StageKind;
  readonly resetsAt: string | null;
  readonly retryAt: string;
}

export interface NextActionInput {
  readonly project: Pick<ProjectSummary, "status" | "config">;
  readonly stages: readonly Stage[];
  // Unfinished work on the saved revision that nothing will start by itself.
  readonly resumable: boolean;
  readonly sample: boolean;
  readonly held: readonly HeldGate[];
  readonly outdated: readonly OutdatedOutput[];
  readonly waits: readonly LimitWaitLike[];
  // A finished video is there to upload.
  readonly uploadReady: boolean;
  // The fix-it a failed step offers (`slices/fixes/rules.ts`), looked up by the caller.
  readonly fixOf: (stage: Stage) => Fix | undefined;
  // "14:05": how a time reads in a sentence. Injected so tests do not depend on the clock.
  readonly clock: (iso: string) => string;
}

export type NextIntent =
  | { readonly kind: "copy-sample" }
  | { readonly kind: "resume" }
  | { readonly kind: "pause" }
  | { readonly kind: "approve"; readonly gate: HeldGate }
  | { readonly kind: "remake"; readonly workKeys: readonly string[] }
  | { readonly kind: "retry"; readonly stage: StageKind }
  // A signed-out CLI: copy its sign-in command, then Check again retries the step.
  | {
      readonly kind: "sign-in";
      readonly stage: StageKind;
      readonly fix: Extract<Fix, { readonly kind: "sign-in" }>;
    }
  | { readonly kind: "soften"; readonly stage: StageKind }
  | { readonly kind: "edit" }
  | { readonly kind: "open-settings"; readonly section: "providers" | "storage" }
  | { readonly kind: "prepare-upload" };

export type Situation =
  | "sample"
  | "paused"
  | "failed"
  | "held"
  | "waiting"
  | "running"
  | "queued"
  | "stopped"
  | "outdated"
  | "done";

export interface NextAction {
  readonly situation: Situation;
  readonly tone: Tone;
  // The state in words, beside the lamp: "Waiting for you".
  readonly status: string;
  // What is ready or what happened, one sentence.
  readonly title: string;
  // What the action will do, or why there is none.
  readonly why?: string;
  // Left out when the situation needs no action (waiting for limits, queued).
  readonly action?: { readonly label: string; readonly intent: NextIntent };
  // The section the situation concerns, where the action is repeated beside the item.
  readonly section?: SectionId;
  // The failed step's own words, shown behind Error details beside the item.
  readonly detail?: string;
}

// A stage as a person names it on this page: the Audio stage is the narration.
export const stageWords: Readonly<Record<StageKind, string>> = {
  research: "Research",
  article: "Article",
  audio: "Narration",
  images: "Images",
  thumbnail: "Thumbnail",
  video: "Video",
  document: "PDF",
};

const lower = (text: string): string =>
  /^[A-Z]{2}/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);

export function nextActionFor(input: NextActionInput): NextAction | undefined {
  const { project, stages } = input;
  const config = project.config;
  const name = (kind: StageKind): string =>
    kind === "video" && finalOutput(config) === "audio" ? "Audio export" : stageWords[kind];

  if (input.sample)
    return {
      situation: "sample",
      tone: "info",
      status: "Sample project",
      title: "This is the sample project, finished and free to explore.",
      why: "It is read-only. Your own copy can be edited and made again.",
      action: { label: "Make my own copy", intent: { kind: "copy-sample" } },
    };

  if (project.status === "paused")
    return {
      situation: "paused",
      tone: "waiting",
      status: "Paused",
      title: "The run is paused.",
      why: "Everything made so far is kept. Continuing picks up where it stopped.",
      action: { label: "Continue the run", intent: { kind: "resume" } },
    };

  // A step that stopped and will not try again by itself.
  const failed = stages.find((stage) => stage.state === "failed" && stage.retryAt === undefined);
  if (failed !== undefined) {
    const stageLabel = name(failed.kind);
    const fix = input.fixOf(failed);
    const retry = {
      label: `Try ${lower(plural(stageLabel))} again`,
      intent: { kind: "retry", stage: failed.kind } as const,
    };
    const base = {
      situation: "failed" as const,
      tone: "failed" as const,
      status: "Failed",
      section: sectionForStage(failed.kind),
      ...(failed.failureReason === null ? {} : { detail: failed.failureReason }),
    };
    switch (fix?.kind) {
      case "sign-in":
        return {
          ...base,
          title: `${fix.label.replace(/^Sign in to /, "")} is signed out, so ${lower(plural(stageLabel))} stopped.`,
          why: `Copy the sign-in command (${fix.command}), run it in a terminal on the computer running Slopify and sign in, then press Check again. Once ${fix.label.replace(/^Sign in to /, "")} is signed in, Slopify tries ${lower(plural(stageLabel))} again.`,
          action: {
            label: "Copy sign-in command",
            intent: { kind: "sign-in", stage: failed.kind, fix },
          },
        };
      case "refused":
        return {
          ...base,
          title: `A content filter refused a prompt, so ${lower(plural(stageLabel))} stopped.`,
          why: fix.soften
            ? "Softening rewrites each refused prompt without what the filter flagged, then draws it again."
            : "Change the prompt in the project settings, then try again.",
          action: fix.soften
            ? { label: fix.label, intent: { kind: "soften", stage: failed.kind } }
            : { label: "Edit the prompt", intent: { kind: "edit" } },
        };
      case "switch-model":
        return {
          ...base,
          title: `The model for ${lower(plural(stageLabel))} is no longer offered.`,
          why: "Pick another model in the project settings, then try again.",
          action: { label: "Switch model", intent: { kind: "edit" } },
        };
      case "provider-settings":
        return {
          ...base,
          title: `The provider did not accept its key, so ${lower(plural(stageLabel))} stopped.`,
          why: "Check the key in Settings, then try again.",
          action: { label: fix.label, intent: { kind: "open-settings", section: "providers" } },
        };
      case "free-space":
        return {
          ...base,
          title: `The disk is full, so ${lower(plural(stageLabel))} stopped.`,
          why: "Storage in Settings shows what can go. Then try again.",
          action: { label: fix.label, intent: { kind: "open-settings", section: "storage" } },
        };
      case undefined:
        return {
          ...base,
          title: `${stageLabel} stopped with an error.`,
          why: "Trying again keeps everything already made.",
          action: retry,
        };
    }
  }

  const held = input.held[0];
  if (held !== undefined) {
    const heldName = name(held.stage);
    return {
      situation: "held",
      tone: "waiting",
      status: "Waiting for you",
      title: `The ${lower(heldName)} ${isAre(heldName)} ready for your review.`,
      why:
        held.dependents.length === 0
          ? "Approving marks it reviewed."
          : `Approving lets ${list(held.dependents.map((kind) => lower(plural(name(kind)))))} run. Nothing after it runs until you do.`,
      action: { label: approveLabel(held, name), intent: { kind: "approve", gate: held } },
      section: sectionForStage(held.stage),
    };
  }

  const retrying = stages.find((stage) => stage.state === "failed" && stage.retryAt !== undefined);
  const wait = input.waits[0];
  if (wait !== undefined || retrying !== undefined) {
    if (wait !== undefined) {
      const names = limitNames(input.waits);
      return {
        situation: "waiting",
        tone: "waiting",
        status: "Waiting for limits",
        // "Waiting for Codex limits (resets at 14:00)." - the words every list uses too.
        title: `${limitWaitLine(input.waits, input.clock) ?? ""}.`,
        why: `Nothing to do: the run carries on by itself when they reset, and work that does not need ${names} keeps going.`,
        section: sectionForStage(wait.stage),
      };
    }
    if (retrying !== undefined)
      return {
        situation: "waiting",
        tone: "waiting",
        status: "Waiting to try again",
        title: `${name(retrying.kind)} will try again by itself at ${input.clock(retrying.retryAt ?? "")}.`,
        why: "Nothing to do: the run carries on when it does.",
        section: sectionForStage(retrying.kind),
        ...(retrying.failureReason === null ? {} : { detail: retrying.failureReason }),
      };
  }

  const running = stages.find((stage) => stage.state === "running");
  if (project.status === "running" || running !== undefined)
    return {
      situation: "running",
      tone: "running",
      status: "Running",
      title:
        running === undefined
          ? "The run is starting."
          : `Making the ${lower(name(running.kind))}${progressOf(running)}.`,
      why: "Pausing lets the current call finish and keeps everything made so far.",
      action: { label: "Pause", intent: { kind: "pause" } },
      ...(running === undefined ? {} : { section: sectionForStage(running.kind) }),
    };

  if (
    input.resumable ||
    project.status === "canceled" ||
    (project.status === "failed" && failed === undefined)
  )
    return {
      situation: "stopped",
      tone: "off",
      status: project.status === "canceled" ? "Canceled" : "Stopped",
      title: "The run stopped before it finished.",
      why: "Continuing makes only what is missing; everything made so far is kept.",
      action: { label: "Continue the run", intent: { kind: "resume" } },
    };

  if (project.status === "pending")
    return {
      situation: "queued",
      tone: "off",
      status: "Queued",
      title: "Waiting for its turn.",
      why: "It starts by itself when the videos ahead of it are done.",
    };

  const group = firstOutdated(input.outdated);
  if (group !== undefined)
    return {
      situation: "outdated",
      tone: "info",
      status: "Outdated",
      title:
        group.count === 1 || group.singular
          ? `The ${group.noun} ${group.noun.endsWith("s") ? "are" : "is"} outdated after your edit.`
          : `${String(group.count)} ${group.plural} are outdated after your edit.`,
      why: "They keep their current version until you remake them. Nothing else is made again.",
      action: {
        label:
          group.count === 1 || group.singular
            ? `Remake the outdated ${group.noun}`
            : `Remake ${String(group.count)} outdated ${group.plural}`,
        intent: { kind: "remake", workKeys: group.workKeys },
      },
      section: group.section,
    };

  if ((project.status === "done" || project.status === "partial") && input.uploadReady)
    return {
      situation: "done",
      tone: "done",
      status: "Done",
      title: "The video is ready.",
      why: "Prepare upload lays out the file, title, description, thumbnails and tags in the order YouTube Studio asks for them.",
      action: { label: "Prepare upload", intent: { kind: "prepare-upload" } },
      section: "youtube",
    };

  return undefined;
}

function approveLabel(gate: HeldGate, name: (kind: StageKind) => string): string {
  if (gate.dependents.includes("video")) return "Approve and render the video";
  if (gate.dependents.includes("images")) return "Approve and make the images";
  if (gate.dependents.includes("audio")) return "Approve and record the narration";
  const first = gate.dependents[0];
  if (first !== undefined) return `Approve and make the ${lower(name(first))}`;
  return `Approve the ${lower(name(gate.stage))}`;
}

function progressOf(stage: Stage): string {
  if (stage.progressTotal === null || stage.progressTotal <= 0) return "";
  return ` · ${String(stage.progressCurrent ?? 0)} of ${String(stage.progressTotal)}`;
}

// Names a stage in a "Try … again" label: "Try images again", "Try the article again".
function plural(stageLabel: string): string {
  return /s$/i.test(stageLabel) ? stageLabel : `the ${lower(stageLabel)}`;
}

function isAre(stageLabel: string): string {
  return /s$/i.test(stageLabel) ? "are" : "is";
}

function list(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1) ?? ""}`;
}

// Outdated outputs, grouped the way a person names them, in the order the run makes them.
// Only the first group is offered: remaking it may make the next group outdated in turn,
// and the next action then names that one.
interface OutdatedGroup {
  readonly id: string;
  readonly noun: string;
  readonly plural: string;
  // A group that is one thing however many files it has: the video with its subtitles.
  readonly singular: boolean;
  readonly section: SectionId;
  readonly roles: readonly OutputRole[];
  // The role counted: the images, not their prompts' instructions.
  readonly counted: readonly OutputRole[];
}

const groups: readonly OutdatedGroup[] = [
  {
    id: "article",
    noun: "article",
    plural: "article files",
    singular: true,
    section: "article",
    roles: ["notes", "sources", "article_md", "article_txt", "script_md"],
    counted: ["article_md"],
  },
  {
    id: "narration",
    noun: "narration",
    plural: "narration parts",
    singular: true,
    section: "narration",
    roles: ["narration_txt", "tts_script", "glossary", "audio_body", "audio_intro", "audio_outro"],
    counted: ["audio_body"],
  },
  {
    id: "reference",
    noun: "establishing image",
    plural: "establishing images",
    singular: true,
    section: "images",
    roles: ["reference"],
    counted: ["reference"],
  },
  {
    id: "images",
    noun: "image",
    plural: "images",
    singular: false,
    section: "images",
    roles: ["image"],
    counted: ["image"],
  },
  {
    id: "animated",
    noun: "animated image",
    plural: "animated images",
    singular: false,
    section: "images",
    roles: ["animated_image"],
    counted: ["animated_image"],
  },
  {
    id: "thumbnails",
    noun: "thumbnail",
    plural: "thumbnails",
    singular: false,
    section: "images",
    roles: ["thumbnail"],
    counted: ["thumbnail"],
  },
  {
    id: "video",
    noun: "video",
    plural: "video files",
    singular: true,
    section: "video",
    roles: [
      "video",
      "audio_export",
      "audio_mp3",
      "audio_m4b",
      "render_params",
      "subtitles_srt",
      "subtitles_vtt",
      "subtitle_words",
      "subtitle_ass",
      "subtitle_font",
    ],
    counted: ["video", "audio_export"],
  },
  {
    id: "shorts",
    noun: "short",
    plural: "shorts",
    singular: false,
    section: "shorts",
    roles: ["shorts", "short_image", "short_video"],
    counted: ["short_video"],
  },
  {
    id: "youtube",
    noun: "YouTube description",
    plural: "YouTube descriptions",
    singular: true,
    section: "youtube",
    roles: ["youtube_description", "youtube_tags"],
    counted: ["youtube_description"],
  },
  {
    id: "document",
    noun: "PDF",
    plural: "PDFs",
    singular: true,
    section: "document",
    roles: ["document_pdf"],
    counted: ["document_pdf"],
  },
];

export function firstOutdated(outdated: readonly OutdatedOutput[]):
  | {
      readonly noun: string;
      readonly plural: string;
      readonly singular: boolean;
      readonly count: number;
      readonly workKeys: readonly string[];
      readonly section: SectionId;
    }
  | undefined {
  for (const group of groups) {
    const members = outdated.filter((output) => group.roles.includes(output.role));
    if (members.length === 0) continue;
    const counted = members.filter((output) => group.counted.includes(output.role)).length;
    return {
      noun: group.noun,
      plural: group.plural,
      singular: group.singular,
      count: Math.max(1, counted),
      workKeys: [...new Set(members.map((output) => output.workKey))],
      section: group.section,
    };
  }
  return undefined;
}

// Every outdated group, for the palette: "Remake 3 outdated images", "Remake the video".
export function outdatedGroups(outdated: readonly OutdatedOutput[]): readonly {
  readonly label: string;
  readonly workKeys: readonly string[];
  readonly section: SectionId;
  readonly count: number;
}[] {
  return groups.flatMap((group) => {
    const members = outdated.filter((output) => group.roles.includes(output.role));
    if (members.length === 0) return [];
    const count = Math.max(
      1,
      members.filter((output) => group.counted.includes(output.role)).length,
    );
    return [
      {
        label:
          count === 1 || group.singular
            ? `Remake the outdated ${group.noun}`
            : `Remake ${String(count)} outdated ${group.plural}`,
        workKeys: [...new Set(members.map((output) => output.workKey))],
        section: group.section,
        count,
      },
    ];
  });
}
