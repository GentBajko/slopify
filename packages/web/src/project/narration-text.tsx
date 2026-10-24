import type { Output } from "@app/slices/storage/model.js";
import { SearchIcon } from "lucide-react";
import { type ReactElement, useId, useState } from "react";
import { ReadingView } from "@/components/kit/reading-view";
import { useOutputText } from "./parts.js";
import type { NarrationTiming } from "./review-narration.js";
import { Transcript } from "./review-transcript.js";

// The narration's clean text (what was spoken: intro, body and outro) as one piece of Markdown,
// for Copy the text. One segment reads as itself; more get a heading each.
export function useNarrationMarkdown(outputs: readonly Output[]): string | undefined {
  const of = (segment: string) =>
    outputs.find((output) => output.role === "narration_txt" && output.meta.segment === segment);
  const intro = useOutputText(of("intro")).data;
  const body = useOutputText(of("body")).data;
  const outro = useOutputText(of("outro")).data;
  const present = (
    [
      ["Intro", intro],
      ["Body", body],
      ["Outro", outro],
    ] as const
  ).filter(([, text]) => text !== undefined && text.trim() !== "");
  if (present.length === 0) return undefined;
  return present.length === 1
    ? (present[0]?.[1] ?? "").trim()
    : present.map(([name, text]) => `## ${name}\n\n${(text ?? "").trim()}`).join("\n\n");
}

// The Narration section's words. With the caption timing current they read as a transcript in
// step with the players above, with a search box over it: press the words to play from there,
// the line being spoken is marked, and Fix this line opens the editor at it. Without timing
// the clean text shows in the reading view, which searches and copies it the same way.
export function NarrationText({
  outputs,
  timing,
  onCopy,
}: {
  readonly outputs: readonly Output[];
  readonly timing?: NarrationTiming | undefined;
  // What the reading view's own Copy does, with the section's status line.
  readonly onCopy: (text: string, what: string) => void;
}): ReactElement | null {
  const id = useId();
  const markdown = useNarrationMarkdown(outputs);
  const [query, setQuery] = useState("");
  const [seek, setSeek] = useState(0);
  if (!outputs.some((output) => output.role === "narration_txt")) return null;
  const lines = timing?.lines ?? [];
  const needle = query.trim().toLowerCase();
  const hits =
    needle === "" ? 0 : lines.filter((line) => line.text.toLowerCase().includes(needle)).length;
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2">
      <h3 id={`${id}-title`} className="sl-kicker m-0">
        Narration text
      </h3>
      {lines.length === 0 ? (
        <ReadingView
          markdown={markdown ?? ""}
          label="Narration text"
          regionLabel="Narration text"
          anchorPrefix="narration-"
          what="narration text"
          onCopy={onCopy}
        >
          <span className="block h-4 w-[40ch] max-w-full rounded-control bg-raised" />
        </ReadingView>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label htmlFor={`${id}-search`} className="sr-only">
              Search the narration
            </label>
            <div className="relative w-full max-w-[320px]">
              <SearchIcon
                aria-hidden="true"
                strokeWidth={1.75}
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              />
              <input
                id={`${id}-search`}
                type="search"
                value={query}
                placeholder="Search the narration"
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setSeek((count) => count + 1);
                  }
                }}
                className="sl-input pl-9"
              />
            </div>
            {needle === "" ? null : (
              <span className="text-small text-ink-2 tabular-nums" aria-live="polite">
                {hits === 0
                  ? "No line has it"
                  : `${String(hits)} ${hits === 1 ? "line has it" : "lines have it"} · Enter shows the next`}
              </span>
            )}
          </div>
          <Transcript
            lines={lines}
            label="Narration transcript"
            onFix={timing?.fix}
            query={query}
            seek={seek}
          />
        </>
      )}
    </section>
  );
}
