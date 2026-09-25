import type { StageState } from "@app/kernel/pipeline.js";
import type { FieldError } from "@app/slices/admission/rules.js";
import type { ReactElement } from "react";
import { Lamp } from "@/components/lamp";
import { cn } from "@/lib/utils";
import type { PlayFormState } from "./state";

type Readiness = "ready" | "needs" | "off" | "provided";

interface Row {
  readonly label: string;
  readonly readiness: Readiness;
  // What pressing the row reveals: the first control holding it back, or its own switch.
  readonly field: string;
  readonly detail: string;
  // The first refusal holding this part back; announced, not repeated on screen beside the
  // field that already shows it.
  readonly problem?: string;
}

const lampOf: Readonly<Record<Readiness, StageState>> = {
  ready: "done",
  needs: "failed",
  off: "skipped",
  provided: "provided",
};

const wordOf: Readonly<Record<Readiness, string>> = {
  ready: "Ready",
  needs: "Needs setup",
  off: "Off",
  provided: "Provided",
};

const tone: Readonly<Record<Readiness, string>> = {
  ready: "text-done",
  needs: "text-red",
  off: "text-ink3",
  provided: "text-ink2",
};

function owns(prefixes: readonly string[], field: string): boolean {
  return prefixes.some((prefix) => field === prefix || field.startsWith(`${prefix}.`));
}

export function readinessRows(form: PlayFormState, errors: readonly FieldError[]): readonly Row[] {
  const row = (
    label: string,
    source: string | undefined,
    prefixes: readonly string[],
    fallback: string,
    detail: string,
  ): Row => {
    const problem = errors.find((error) => owns(prefixes, error.field));
    const readiness: Readiness = problem
      ? "needs"
      : source === "off"
        ? "off"
        : source === "provide"
          ? "provided"
          : "ready";
    return {
      label,
      readiness,
      field: problem?.field ?? fallback,
      detail,
      ...(problem ? { problem: problem.message } : {}),
    };
  };
  const images = form.imagePrompts.reduce((sum, prompt) => sum + prompt.number, 0);
  return [
    row(
      "Article",
      form.sources.article,
      ["sources.article", "articlePrompt", "provided.article", "values", "llm"],
      form.sources.article === "provide" ? "provided.article" : "articlePrompt",
      form.sources.article === "provide" ? "Supplied article" : form.articlePrompt || "No prompt",
    ),
    row(
      "Narration",
      form.sources.audio,
      ["sources.audio", "audio", "provided.audio", "narrationPrompt", "intro", "outro", "chunking"],
      "sources.audio",
      form.audio.voice ? "Voice chosen" : "No voice",
    ),
    row(
      "Images",
      form.sources.images,
      ["sources.images", "images", "imagePrompts", "provided.images"],
      "sources.images",
      form.sources.images === "generate" ? `${String(images)} images` : "Supplied images",
    ),
    row(
      "Thumbnail",
      form.sources.thumbnail,
      ["sources.thumbnail", "thumbnail", "provided.thumbnail"],
      "sources.thumbnail",
      "Cover image",
    ),
    row(
      "Export",
      form.sources.video,
      ["sources.video"],
      "sources.video",
      form.sources.video === "generate"
        ? form.sources.audio === "off"
          ? "Silent MP4"
          : "MP4"
        : form.sources.audio === "off"
          ? "Individual outputs"
          : "Combined WAV",
    ),
    row("Style", undefined, ["format", "subtitles"], "format", form.format),
  ];
}

// The run at a glance: one lamp per part of the output, its state word, and a press that goes
// to whatever is holding it back. It replaces a summary that repeated Review line for line.
export function ReadinessRail({
  form,
  errors,
  onReveal,
  compact = false,
}: {
  readonly form: PlayFormState;
  readonly errors: readonly FieldError[];
  readonly onReveal: (field: string) => void;
  readonly compact?: boolean;
}): ReactElement {
  const rows = readinessRows(form, errors);
  if (compact) {
    return (
      <ul aria-label="Run readiness" className="mb-4 flex flex-wrap gap-x-4 gap-y-2">
        {rows.map((row) => (
          <li key={row.label}>
            <button
              type="button"
              onClick={() => onReveal(row.field)}
              aria-label={`${row.label}: ${wordOf[row.readiness]}`}
              className="inline-flex min-h-8 items-center gap-2 text-small text-ink2 hover:text-ink"
            >
              <Lamp state={lampOf[row.readiness]} />
              {row.label}
              <span aria-hidden="true" className={cn("engraved", tone[row.readiness])}>
                {wordOf[row.readiness]}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <section aria-label="Run readiness" className="min-w-0">
      <h2 className="engraved mb-2 text-ink3">This run</h2>
      <ul className="overflow-hidden rounded-panel border border-line bg-panel">
        {rows.map((row) => (
          <li key={row.label} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onReveal(row.field)}
              aria-label={`${row.label}: ${wordOf[row.readiness]}. ${row.problem ?? row.detail}`}
              className="grid w-full grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 text-left hover:bg-panel2"
            >
              <Lamp state={lampOf[row.readiness]} />
              <span className="min-w-0">
                <span className="block font-semibold">{row.label}</span>
                <span className="block truncate text-label text-ink3">{row.detail}</span>
              </span>
              <span className={cn("engraved", tone[row.readiness])}>{wordOf[row.readiness]}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-small text-ink3">
        Nothing starts until you review the costs and choose Start run.
      </p>
    </section>
  );
}
