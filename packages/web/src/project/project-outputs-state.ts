import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import type { Tone } from "@/components/kit/status";
import { startedAt } from "@/lib/utils";
import { outdatedWords } from "./output-status.js";
import type { OutputSection, OutputState, OutputsInput } from "./project-outputs-model.js";

// One output's state, version line and next step in words, for `projectOutputs`.

const sectionNames: Readonly<Record<OutputSection, string>> = {
  article: "Article",
  narration: "Narration",
  images: "Images",
  video: "Video",
  shorts: "Shorts",
  document: "PDF",
};

export function stateOf(
  stages: readonly Stage[],
  main: Output | undefined,
  members: readonly Output[],
  states: OutputsInput["states"],
): { readonly state: OutputState; readonly tone: Tone; readonly stateWords: string } {
  const failed = stages.find((one) => one.state === "failed");
  if (failed !== undefined)
    return {
      state: "failed",
      tone: "failed",
      stateWords:
        main === undefined
          ? "Failed before it was made"
          : "The last attempt failed; the file shown is the one before it",
    };
  if (stages.some((one) => one.state === "running"))
    return { state: "working", tone: "running", stateWords: "Running" };
  if (main === undefined) return { state: "waiting", tone: "waiting", stateWords: "Not made yet" };
  const word = (output: Output) => states?.get(output.id);
  if (members.some((one) => word(one) === "missing"))
    return {
      state: "missing",
      tone: "failed",
      stateWords: "File missing from the project folder",
    };
  const older = members.find((one) => word(one) === "outdated");
  if (older !== undefined)
    return { state: "older", tone: "waiting", stateWords: outdatedWords(older.role) };
  // The lamp and "Done" say it is the current file; nothing more is needed.
  return { state: "current", tone: "done", stateWords: "Done" };
}

// When this file was made, and, once its source has changed since, that it reads the earlier
// one: a narration of the text before the edit, a video of the narration before the remake.
export function versionLine(
  main: Output | undefined,
  state: OutputState,
  source: { readonly name: string; readonly output: Output | undefined } | undefined,
): string | undefined {
  if (main === undefined) return undefined;
  const made = `made ${when(main.createdAt)}`;
  return state === "older" && source?.output !== undefined
    ? `${made}, before the current ${source.name}`
    : made;
}

export function nextWords(state: OutputState, section: OutputSection): string {
  const name = sectionNames[section];
  switch (state) {
    case "failed":
      return `See why in ${name}, then try again`;
    case "working":
      return `Follow it in ${name}`;
    case "waiting":
      return `Made when the run reaches it; see ${name}`;
    case "missing":
      return `Make it again from ${name}`;
    case "older":
      return `Update it from ${name}, or keep this version`;
    case "current":
      // The download is the button beside it; the link goes to where the output is reviewed.
      return `Review it in ${name}`;
  }
}

// "Oct 4 14:05", or "14:05" today, in the reader's own time zone: the one date style the
// project page uses for when anything happened (`startedAt`).
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return startedAt(iso);
}
