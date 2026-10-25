import type { StageKind } from "@app/kernel/pipeline.js";
import { type ProjectSummary, type Stage, thumbnailCountOf } from "@app/slices/admission/model.js";
import { etaLabel } from "@app/slices/eta/model.js";
import type { CheckpointHold } from "@app/slices/reviews/holds.js";
import type { Output } from "@app/slices/storage/model.js";
import type { Tone } from "@/components/kit/status";
import type { Step } from "@/components/kit/steps";
import { measuredEta, runStep } from "./measured-eta.js";
import type { SectionId } from "./next-action.js";
import { runSteps } from "./run-aside.js";
import { stageName, summaryOf } from "./summary.js";

// The project's status column: one row per thing the project makes (Article, Narration,
// Images, Video, Shorts, YouTube text, PDF), each "● Name  State · one detail", then All files.
// A row that moves, waits or failed gets a second line saying what it is doing and the time
// left; a finished row stays one line. While the run goes, Progress leads the list. Pure, so
// every row is tested without a render.

export interface StatusRow {
  readonly id: SectionId;
  readonly name: string;
  // Absent for a row that is a place rather than an output (All files): no lamp, no state.
  readonly tone?: Tone;
  readonly state?: string;
  // One short detail after the state: "4 images", "03:05 · 16:9", "2 outdated".
  readonly detail?: string;
  // The second line of a row that moves, waits or failed: "chunk 3 of 8 · about 4 min left".
  readonly more?: string;
}

export interface StatusInput {
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
  readonly project: ProjectSummary;
  readonly resumable: boolean;
  readonly holding: readonly CheckpointHold[];
  readonly now: number;
  // The project makes Shorts, or a YouTube description.
  readonly shorts: boolean;
  readonly youtube: boolean;
  // Outdated outputs per section, from the saved version.
  readonly outdated?: (section: SectionId) => number;
  // How many files All files lists.
  readonly files: number;
}

// The step that speaks for a row of two stages (Article with its research, Images with the
// thumbnail): the one that needs the reader most.
const loudness: Readonly<Record<Tone, number>> = {
  failed: 0,
  waiting: 1,
  running: 2,
  info: 3,
  off: 4,
  done: 5,
};

// "4 images" after "Done ·", but "PDF" and "16:9" keep their capitals.
const lowered = (text: string): string =>
  /^[A-Z]{2}|^[A-Z][a-z]*:/.test(text) ? text : text.charAt(0).toLowerCase() + text.slice(1);

const plural = (count: number, noun: string): string =>
  count === 1 ? `1 ${noun}` : `${String(count)} ${noun}s`;

export function statusRows(input: StatusInput): readonly StatusRow[] {
  const { stages, outputs, project } = input;
  const config = project.config;
  const shown = stages.filter((stage) => stage.state !== "skipped");
  const steps = runSteps(input);
  const stepOf = new Map<StageKind, Step>();
  shown.forEach((stage, at) => {
    const step = steps[at];
    if (step !== undefined) stepOf.set(stage.kind, step);
  });
  const stageOf = (kind: StageKind): Stage | undefined =>
    shown.find((stage) => stage.kind === kind);
  const outdated = (id: SectionId): string | undefined => {
    const count = input.outdated?.(id) ?? 0;
    return count === 0 ? undefined : `${String(count)} outdated`;
  };

  // How a row of these stages stands: Done with its detail, or the loudest step's state with
  // its own line under it.
  const standing = (
    id: SectionId,
    kinds: readonly StageKind[],
    done: string | undefined,
  ): Omit<StatusRow, "id" | "name"> | undefined => {
    const present = kinds.flatMap((kind) => stepOf.get(kind) ?? []);
    const loudest = present.toSorted((a, b) => loudness[a.tone] - loudness[b.tone])[0];
    if (loudest === undefined) return undefined;
    if (loudest.tone === "done") {
      const detail = outdated(id) ?? (done === undefined || done === "" ? undefined : done);
      return { tone: "done", state: "Done", ...(detail === undefined ? {} : { detail }) };
    }
    // An edit sends a made step back to waiting: its files are there, only outdated, so the row
    // says so rather than "Not started" (All files says why, the section offers to make them).
    if (loudest.tone === "off" && outdated(id) !== undefined)
      return { tone: "info", state: "Outdated" };
    const more =
      loudest.tone === "off" ||
      typeof loudest.detail !== "string" ||
      loudest.detail === "" ||
      loudest.detail === loudest.state
        ? undefined
        : loudest.detail;
    return { tone: loudest.tone, state: loudest.state, ...(more === undefined ? {} : { more }) };
  };
  const row = (
    id: SectionId,
    name: string,
    kinds: readonly StageKind[],
    done: string | undefined,
  ): readonly StatusRow[] => {
    const look = standing(id, kinds, done);
    return look === undefined ? [] : [{ id, name, ...look }];
  };
  // A theme's or a file's name keeps its own capitals; a sentence starts lower after "Done ·".
  const doneOf = (kind: StageKind): string | undefined => {
    const stage = stageOf(kind);
    if (stage === undefined) return undefined;
    const summary = summaryOf(stage, outputs, project);
    return kind === "document" || stage.state === "provided" ? summary : lowered(summary);
  };

  const rows: StatusRow[] = [];
  const running =
    project.status === "running" ||
    project.status === "paused" ||
    shown.some((stage) => stage.state === "running");
  if (running) {
    const step = runStep(stages);
    const left = timeLeft(shown, input.now);
    rows.push({
      id: "live",
      name: "Progress",
      tone: project.status === "paused" ? "waiting" : "running",
      state: project.status === "paused" ? "Paused" : "Running",
      ...(step === undefined ? {} : { detail: step }),
      ...(left === undefined || project.status === "paused" ? {} : { more: left }),
    });
  }

  rows.push(...row("article", "Article", ["article", "research"], doneOf("article")));
  rows.push(...row("narration", "Narration", ["audio"], doneOf("audio")));

  const images = outputs.filter((output) => output.role === "image").length;
  const thumbnails = Math.min(
    thumbnailCountOf(config),
    outputs.filter((output) => output.role === "thumbnail").length,
  );
  const pictures = [
    ...(images === 0 ? [] : [plural(images, "image")]),
    ...(thumbnails === 0 ? [] : [plural(thumbnails, "thumbnail")]),
  ].join(" + ");
  const imageRow = row("images", "Images", ["images", "thumbnail"], pictures);
  // Images switched off with an establishing image still has its section, to see that image.
  rows.push(
    ...(imageRow.length === 0 && config.reference !== undefined
      ? [{ id: "images" as const, name: "Images" }]
      : imageRow),
  );

  rows.push(...row("video", stageName("video", config), ["video"], doneOf("video")));

  // Shorts and the YouTube text are made with the video: they stand as it does, until it is
  // done, and then say what they hold. Made before, they keep saying so while the video is made
  // again without them (the video stage names the part at work), or waits after an edit.
  const videoLook = standing("video", ["video"], undefined);
  const videoStage = stageOf("video");
  const atWork = (id: SectionId): boolean => {
    if (videoStage?.state !== "running") return false;
    const label = videoStage.activity?.label;
    // Nothing named yet: any part of the stage may be at work.
    if (label === undefined) return true;
    return id === "shorts" ? /\bshorts\b/i.test(label) : /\bYouTube\b/.test(label);
  };
  const made = (id: SectionId, name: string, count: number, detail: string): StatusRow => {
    const stale = outdated(id);
    if (videoLook?.tone === "done")
      return count === 0
        ? { id, name, tone: "off", state: "Not made" }
        : { id, name, tone: "done", state: "Done", detail: stale ?? detail };
    if (count > 0 && videoLook?.tone === "running" && !atWork(id))
      return { id, name, tone: "done", state: "Done", detail: stale ?? detail };
    // Waiting after an edit: what it made is there, outdated or as it was.
    if (count > 0 && (videoLook?.tone === "off" || videoLook?.tone === "info"))
      return stale === undefined
        ? { id, name, tone: "done", state: "Done", detail }
        : { id, name, tone: "info", state: "Outdated" };
    return { id, name, tone: videoLook?.tone ?? "off", state: videoLook?.state ?? "Not started" };
  };
  if (input.shorts) {
    const shorts = outputs.filter((output) => output.role === "short_video").length;
    rows.push(made("shorts", "Shorts", shorts, plural(shorts, "short")));
  }
  if (input.youtube) {
    const written = outputs.filter((output) => output.role === "youtube_description").length;
    rows.push(made("youtube", "YouTube", written, "description and tags"));
  }

  rows.push(...row("document", "PDF", ["document"], doneOf("document")));
  rows.push({ id: "outputs", name: "All files", detail: plural(input.files, "file") });
  return rows;
}

// "about 6 min left": the running steps' time left and, when finished runs say how long each
// step still to come takes, theirs too. Undefined when nothing runs, or when nothing gives the
// running step a time.
export function timeLeft(stages: readonly Stage[], now: number): string | undefined {
  const running = stages.filter((stage) => stage.state === "running");
  if (running.length === 0) return undefined;
  const etas = running.map((stage) => measuredEta(stage, now));
  const known = etas.every((eta) => eta?.seconds !== undefined);
  const waiting = stages.filter((stage) => stage.state === "pending");
  const later = waiting.every((stage) => stage.typicalSeconds !== undefined);
  if (known && later) {
    const seconds =
      Math.max(...etas.map((eta) => eta?.seconds ?? 0)) +
      waiting.reduce((sum, stage) => sum + (stage.typicalSeconds ?? 0), 0);
    return etaLabel({ basis: "progress", seconds });
  }
  // A step with no estimate says so on its own row; the headline then leaves the time out.
  const first = etas[0];
  return first === undefined || first.basis === "unknown"
    ? undefined
    : `this step: ${etaLabel(first)}`;
}
