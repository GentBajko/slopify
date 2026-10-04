import type { Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import type { Tone } from "@/components/kit/status";
import { outdatedWords } from "./output-status.js";
import type { OutputSection, OutputState, OutputsInput } from "./project-outputs-model.js";

// One output's state, version line and next step in words, for `projectOutputs`.

const sectionNames: Readonly<Record<OutputSection, string>> = {
  article: "Article",
  narration: "Narration",
  images: "Images",
  video: "Video",
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
    return { state: "working", tone: "running", stateWords: "In progress" };
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
  return { state: "current", tone: "done", stateWords: "Current" };
}

// When this file was made, and from which version of its source, so a person can tell which
// text a narration reads or which narration a video plays.
export function versionLine(
  main: Output | undefined,
  state: OutputState,
  source: { readonly name: string; readonly output: Output | undefined } | undefined,
): string | undefined {
  if (main === undefined) return undefined;
  const made = `Made ${when(main.createdAt)}`;
  if (source?.output === undefined) return made;
  return state === "older"
    ? `${made}, before the current ${source.name}`
    : `${made} from the ${source.name} of ${when(source.output.createdAt)}`;
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

// "4 Oct, 14:05" in the reader's own time zone.
export function when(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
