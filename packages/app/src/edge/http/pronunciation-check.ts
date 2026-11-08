import { readFileSync } from "node:fs";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import type { RunConfig } from "../../slices/admission/model.js";
import { usesPronunciationGlossary } from "../../slices/admission/rules.js";
import { splitEndMatter } from "../../slices/article/split.js";
import { pronunciationRulesOf, readsPossessives } from "../../slices/narration/pronunciation.js";
import {
  type HeardNames,
  heardNames,
  namesAhead,
  namesAheadNotice,
  namesNarrated,
  narratedNotice,
  type PronunciationSources,
  type UnguidedNames,
} from "../../slices/narration/pronunciation-check.js";
import { wordsSchema } from "../../slices/rebuild/runtime-subtitles.js";
import type { RevisionView } from "../../slices/revisions/model.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { getRevisionView, isReadyOutput, readyOutput } from "../../slices/revisions/view.js";
import { outputPath } from "../../slices/storage/layout.js";
import type { OutputRole } from "../../slices/storage/model.js";
import { projectTitle } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { projectIdParam } from "./ids.js";
import { onInvalid, problem } from "./problem.js";

// Does this video say the names right? Two answers from files that already exist, at the two
// moments where a wrong one costs money: before the narration is paid for, and before the
// upload. Neither blocks anything, changes anything or spends anything
// (`slices/narration/pronunciation-check.ts` does the counting).

// What the before-narration answer says. `ready` is false while the article is still unwritten,
// and `narrated` is true once the narration exists, which is when the other answer is the one
// to read.
export interface PronunciationGaps {
  readonly revisionId: string | null;
  readonly ready: boolean;
  readonly narrated: boolean;
  readonly ahead: UnguidedNames | null;
  readonly notice: string | null;
}

// What the after-the-render answer says: what the voice was actually sent, and how the finished
// narration was heard saying each name. Either half is null when its files are not there yet.
export interface PronunciationHeard {
  readonly revisionId: string | null;
  readonly narrated: UnguidedNames | null;
  readonly heard: HeardNames | null;
  readonly notice: string | null;
}

function sourcesOf(config: RunConfig, view: RevisionView): PronunciationSources {
  const glossary =
    usesPronunciationGlossary(config) && view.articleMarkdown !== null
      ? splitEndMatter(view.articleMarkdown).glossary
      : "";
  return {
    glossary,
    ...(config.libraryPronunciations === undefined ? {} : { list: config.libraryPronunciations }),
    ...(config.audio?.shareGlossary === true && config.sharedGlossary !== undefined
      ? { shared: config.sharedGlossary }
      : {}),
    ...(config.language === undefined ? {} : { language: config.language }),
    rules: pronunciationRulesOf(config),
  };
}

// Every segment of one kind of narration file, in spoken order, joined: the intro, the body and
// the outro are one piece of narration for counting.
function narrationText(
  deps: Pick<AppDeps, "paths">,
  projectId: string,
  view: RevisionView,
  role: OutputRole,
): string | null {
  const order = (segment: string | undefined): number =>
    segment === "intro" ? 0 : segment === "outro" ? 2 : 1;
  const parts = view.outputs
    .filter((row) => isReadyOutput(row, { role }))
    .toSorted((left, right) => order(left.output.meta.segment) - order(right.output.meta.segment))
    .flatMap((row) => {
      try {
        return [readFileSync(outputPath(deps.paths, projectId, row.output.path), "utf8")];
      } catch {
        // A narration file removed by hand has nothing to count.
        return [];
      }
    });
  return parts.length === 0 ? null : parts.join("\n\n");
}

function timingWords(
  deps: Pick<AppDeps, "paths">,
  projectId: string,
  view: RevisionView,
): readonly { readonly text: string; readonly confidence?: number | undefined }[] | null {
  const timing = readyOutput(view, { workKey: "subtitles:timing", role: "subtitle_words" });
  if (timing === undefined) return null;
  try {
    return wordsSchema.parse(
      JSON.parse(readFileSync(outputPath(deps.paths, projectId, timing.output.path), "utf8")),
    ).words;
  } catch {
    // Timing that is missing or unreadable means there is nothing to say about how it was heard.
    return null;
  }
}

export function pronunciationCheckRoutes(
  deps: Pick<AppDeps, "db" | "paths" | "ids" | "clock" | "log">,
) {
  const viewOf = (projectId: string): RevisionView | undefined => {
    const revisionId = currentRevisionId(deps.db, projectId);
    return revisionId === undefined ? undefined : getRevisionView(deps, projectId, revisionId);
  };
  const missing = "This project no longer exists. Go back to Projects to pick another.";
  return (
    new Hono()
      // Before the narration is paid for: the names this article says that nothing pronounces,
      // so the voice will invent them. Read from the narration text where the run has prepared
      // it, else from the article itself.
      .get(
        "/:projectId/pronunciations/gaps",
        zValidator("param", projectIdParam, onInvalid),
        (c) => {
          const { projectId } = c.req.valid("param");
          if (projectTitle(deps.db, projectId) === undefined)
            return problem(c, { status: 404, detail: missing });
          c.header("Cache-Control", "no-store");
          const view = viewOf(projectId);
          if (view === undefined)
            return c.json({
              revisionId: null,
              ready: false,
              narrated: false,
              ahead: null,
              notice: null,
            } satisfies PronunciationGaps);
          const config = view.revision.config;
          const written = narrationText(deps, projectId, view, "narration_txt");
          const text =
            written ??
            (view.articleMarkdown === null ? null : splitEndMatter(view.articleMarkdown).body);
          if (text === null || text.trim() === "")
            return c.json({
              revisionId: view.revision.id,
              ready: false,
              narrated: false,
              ahead: null,
              notice: null,
            } satisfies PronunciationGaps);
          const ahead = namesAhead(text, sourcesOf(config, view), readsPossessives(config));
          return c.json({
            revisionId: view.revision.id,
            ready: true,
            narrated: narrationText(deps, projectId, view, "tts_script") !== null,
            ahead,
            notice: namesAheadNotice(ahead),
          } satisfies PronunciationGaps);
        },
      )
      // After the render, before the upload: what reached the voice as written, counted from the
      // voice script itself, and how the finished narration was heard saying each name, from the
      // confidence the subtitle timing already carries.
      .get(
        "/:projectId/pronunciations/heard",
        zValidator("param", projectIdParam, onInvalid),
        (c) => {
          const { projectId } = c.req.valid("param");
          if (projectTitle(deps.db, projectId) === undefined)
            return problem(c, { status: 404, detail: missing });
          c.header("Cache-Control", "no-store");
          const view = viewOf(projectId);
          if (view === undefined)
            return c.json({
              revisionId: null,
              narrated: null,
              heard: null,
              notice: null,
            } satisfies PronunciationHeard);
          const sources = sourcesOf(view.revision.config, view);
          const script = narrationText(deps, projectId, view, "tts_script");
          const written = narrationText(deps, projectId, view, "narration_txt");
          const words = timingWords(deps, projectId, view);
          const narrated = script === null ? null : namesNarrated(script, sources);
          const heard =
            words === null ? null : heardNames(words, sources, written ?? script ?? undefined);
          return c.json({
            revisionId: view.revision.id,
            narrated,
            heard,
            notice: narratedNotice(narrated, heard),
          } satisfies PronunciationHeard);
        },
      )
  );
}
