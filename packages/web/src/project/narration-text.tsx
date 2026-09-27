import type { Output } from "@app/slices/storage/model.js";
import { type ReactElement, useCallback, useId, useState } from "react";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { ReadingView } from "@/components/kit/reading-view";
import { useOutputText } from "./parts.js";

// The Audio section's narration text - the clean text that was spoken, intro, body and outro -
// in the reading view, so it can be read, searched and copied rather than only downloaded.
export function NarrationText({
  outputs,
}: {
  readonly outputs: readonly Output[];
}): ReactElement | null {
  const id = useId();
  const of = (segment: string) =>
    outputs.find((output) => output.role === "narration_txt" && output.meta.segment === segment);
  const intro = useOutputText(of("intro")).data;
  const body = useOutputText(of("body")).data;
  const outro = useOutputText(of("outro")).data;
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const copy = useCallback((text: string, what: string) => {
    if (!navigator.clipboard) {
      setStatus({ text: `Couldn't copy the ${what}. Select the text and copy it.`, tone: "error" });
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => setStatus({ text: `Copied the ${what} as Markdown.`, tone: "success" }),
      () =>
        setStatus({
          text: `Couldn't copy the ${what}. Select the text and copy it.`,
          tone: "error",
        }),
    );
  }, []);
  const parts = [
    ["Intro", intro],
    ["Body", body],
    ["Outro", outro],
  ] as const;
  const present = parts.filter(([, text]) => text !== undefined && text.trim() !== "");
  if (!outputs.some((output) => output.role === "narration_txt")) return null;
  // One segment reads as itself; more get a heading each, which the contents list picks up.
  const markdown =
    present.length === 1
      ? (present[0]?.[1] ?? "").trim()
      : present.map(([name, text]) => `## ${name}\n\n${(text ?? "").trim()}`).join("\n\n");
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2">
      <h3 id={`${id}-title`} className="engraved text-ink3">
        Narration text
      </h3>
      <ReadingView
        markdown={markdown}
        label="Narration text"
        regionLabel="Narration text"
        anchorPrefix="narration-"
        what="narration text"
        onCopy={copy}
      >
        <span className="block h-4 w-[40ch] max-w-full rounded-control bg-panel2" />
      </ReadingView>
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
    </section>
  );
}
