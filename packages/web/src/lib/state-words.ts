import type { ProjectState } from "@app/kernel/pipeline.js";
import {
  keptAsIsWord,
  projectStateWords,
  stageStateWords,
} from "@app/slices/admission/state-words.js";
import type { Tone } from "@/components/kit/status";

export { heldWord } from "@app/slices/admission/state-words.js";

// One word per state, everywhere a state is shown: Projects, the calendar, the project
// header, Home and the run's steps. A screen that knows more (a project waiting for your
// review, a limit wait, Ready to upload) says that instead, before falling back to these.
// The words are the app's (`slices/admission/state-words.ts`), so the MCP tools say the same.

export interface StateLook {
  readonly tone: Tone;
  readonly word: string;
}

export const projectStateLook: Readonly<Record<ProjectState, StateLook>> = {
  running: { tone: "running", word: projectStateWords.running },
  paused: { tone: "waiting", word: projectStateWords.paused },
  pending: { tone: "off", word: projectStateWords.pending },
  failed: { tone: "failed", word: projectStateWords.failed },
  partial: { tone: "waiting", word: projectStateWords.partial },
  done: { tone: "done", word: projectStateWords.done },
  canceled: { tone: "off", word: projectStateWords.canceled },
};

export const keptAsIs: StateLook = { tone: "done", word: keptAsIsWord };

export const stageStateWord = stageStateWords;

// A failed step that will try again by itself.
export const retryingWord = "Waiting to try again";

export type ScheduleStatus = "active" | "paused" | "completed" | "canceled";

export const scheduleStatusLook: Readonly<Record<ScheduleStatus, StateLook>> = {
  active: { tone: "running", word: "Active" },
  paused: { tone: "waiting", word: "Paused" },
  completed: { tone: "done", word: "Completed" },
  canceled: { tone: "off", word: "Canceled" },
};
