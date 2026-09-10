import type { LlmPreviewEvent } from "@app/kernel/events.js";
import type { StageKind } from "@app/kernel/pipeline.js";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Picker } from "@/components/ui/picker";

export const writingKey = (projectId: string) => ["live-writing", projectId] as const;
export type WritingPreview = Pick<LlmPreviewEvent, "stage" | "callId" | "label" | "text">;

export function appendWriting(
  previous: readonly WritingPreview[],
  event: LlmPreviewEvent,
): readonly WritingPreview[] {
  const existing = previous.find((one) => one.callId === event.callId);
  const text = (event.reset ? event.text : `${existing?.text ?? ""}${event.text}`).slice(
    -64 * 1024,
  );
  const next = {
    stage: event.stage,
    callId: event.callId,
    ...(event.label === undefined ? {} : { label: event.label }),
    text,
  };
  return (
    existing
      ? previous.map((one) => (one.callId === event.callId ? next : one))
      : [...previous, next]
  ).slice(-24);
}

export function LiveWriting({
  projectId,
  stage,
}: {
  readonly projectId: string;
  readonly stage: StageKind;
}) {
  const previews = useQuery({
    queryKey: writingKey(projectId),
    queryFn: (): readonly WritingPreview[] => [],
    enabled: false,
  });
  const calls = (previews.data ?? []).filter((one) => one.stage === stage);
  const [picked, setPicked] = useState<string>();
  const selected = calls.find((one) => one.callId === picked) ?? calls.at(-1);
  const [follow, setFollow] = useState(true);
  const area = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected?.text && follow && area.current)
      area.current.scrollTop = area.current.scrollHeight;
  }, [follow, selected?.text]);
  if (calls.length === 0 && stage !== "research" && stage !== "article") return null;
  return (
    <div className="mx-5 mt-5 rounded-control border border-line2 bg-panel2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <span className="text-small font-semibold text-run-text">Live writing</span>
        {calls.length > 1 ? (
          <Picker
            aria-label="Live writing task"
            value={selected?.callId ?? ""}
            onChange={(event) => setPicked(event.target.value)}
            className="max-w-[280px]"
          >
            {calls.map((call, index) => (
              <option key={call.callId} value={call.callId}>
                {call.label ?? "Writing"} · {index + 1}
              </option>
            ))}
          </Picker>
        ) : null}
        <label className="flex cursor-pointer items-center gap-2 text-label text-ink2">
          <input
            type="checkbox"
            checked={follow}
            onChange={(event) => setFollow(event.target.checked)}
          />
          Follow output
        </label>
      </div>
      <section
        ref={area}
        aria-label="Live writing preview"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users need to scroll this reading region.
        tabIndex={0}
        className="max-h-[360px] min-h-32 overflow-auto whitespace-pre-wrap break-words p-4 font-sans text-small leading-relaxed text-ink2"
      >
        {selected?.text || "Waiting for the provider's first text…"}
      </section>
      <p className="border-t border-line px-4 py-2 text-label text-ink3">
        Live preview. The complete output is saved when this stage finishes.
      </p>
    </div>
  );
}
