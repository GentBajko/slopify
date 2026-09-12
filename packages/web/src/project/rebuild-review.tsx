import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { outputSlotLabel } from "./output-label.js";
export interface RebuildConsent {
  readonly acknowledgeUnknownCosts: boolean;
  readonly confirmedProvidedWorkKeys: readonly string[];
}
export function RebuildReview({
  preview,
  pending,
  onStart,
  onCancel,
}: {
  readonly preview: RebuildPreview;
  readonly pending: boolean;
  readonly onStart: (consent: RebuildConsent) => void;
  readonly onCancel: () => void;
}): import("react").ReactElement {
  const label = workLabels(preview);
  const [confirmed, setConfirmed] = useState<readonly string[]>([]);
  const [unknown, setUnknown] = useState(false);
  const money = (value: number | null) =>
    value === null
      ? "Unknown"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 4,
        }).format(value);
  const allowed =
    !preview.work.some((work) => work.disposition === "blocked") &&
    preview.providedReuseRequired.every((key) => confirmed.includes(key)) &&
    (preview.costs.unknown === 0 || unknown);
  return (
    <section
      aria-label="Review affected rebuild"
      className="space-y-3 rounded-panel border border-line p-4"
    >
      <h2>Review affected rebuild</h2>
      <ul>
        {preview.changedInputs.map((change) => (
          <li key={change.path}>
            {label(change.path)}:{" "}
            {change.after === null
              ? "Removed"
              : change.before === null
                ? "New output"
                : "Inputs changed"}
          </li>
        ))}
      </ul>
      <ul>
        {preview.work.map((work) => (
          <li key={work.key}>
            {label(work.key)}: {dispositions[work.disposition]}. {work.reason}
            {work.inflight ? " An already submitted request may still be billed." : ""}
          </li>
        ))}
      </ul>
      <p>
        Retained outputs:{" "}
        {preview.retained.map((output) => outputSlotLabel(output.slot)).join(", ") || "None"}
      </p>
      {preview.wholeRequestNotice === null ? null : <p>{preview.wholeRequestNotice}</p>}
      <ul>
        {preview.costs.rows.map((row) => (
          <li key={`${row.stage}-${row.detail}`}>
            {label(row.stage)}: {money(row.low)}–{money(row.high)}. {row.detail}
          </li>
        ))}
      </ul>
      <p>
        Known estimate: {money(preview.costs.low)}–{money(preview.costs.high)}
      </p>
      {preview.warnings.map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
      {preview.providedReuseRequired.map((key) => (
        <label key={key} className="block">
          <input
            type="checkbox"
            disabled={pending}
            checked={confirmed.includes(key)}
            onChange={(event) =>
              setConfirmed(
                event.target.checked ? [...confirmed, key] : confirmed.filter((one) => one !== key),
              )
            }
          />
          Keep the provided content for {label(key)}
        </label>
      ))}
      {preview.costs.unknown === 0 ? null : (
        <label className="block">
          <input
            type="checkbox"
            disabled={pending}
            checked={unknown}
            onChange={(event) => setUnknown(event.target.checked)}
          />
          I understand that {preview.costs.unknown} cost estimates are unknown.
        </label>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="primary"
          type="button"
          disabled={pending || !allowed}
          onClick={() =>
            onStart({
              acknowledgeUnknownCosts: unknown,
              confirmedProvidedWorkKeys: confirmed,
            })
          }
        >
          Start rebuild
        </Button>
        <Button type="button" disabled={pending} onClick={onCancel}>
          Cancel rebuild
        </Button>
      </div>
    </section>
  );
}

const dispositions = {
  reuse: "Reuse",
  generate: "Generate",
  local: "Build locally",
  review: "Review required",
  blocked: "Unavailable",
};
const workNames: Readonly<Record<string, string>> = {
  "export:wav": "Audio export (WAV)",
  "export:video": "Video export",
  "subtitles:timing": "Subtitle timing",
  "subtitles:cues": "Caption text and timing",
  "subtitles:files": "Subtitle files",
  "article:body": "Article",
  "audio:provided": "Provided narration",
  "audio:body:concat": "Combined narration",
  "audio:intro": "Combined intro narration",
  "audio:outro": "Combined outro narration",
  "research:planner": "Research plan",
  "research:notes": "Research notes",
  "entry:intro:text": "Intro text",
  "entry:outro:text": "Outro text",
};
function workName(key: string): string {
  const exact = workNames[key];
  if (exact !== undefined) return exact;
  const prefix = key.split(":")[0];
  const families: Readonly<Record<string, string>> = {
    image: "Image request",
    images: "Images",
    audio: "Narration request",
    article: "Article",
    research: "Research",
    thumbnail: "Thumbnail",
    subtitles: "Subtitles",
    video: "Video export",
    export: "Export",
    entry: "Intro or outro",
  };
  return families[prefix ?? ""] ?? "Output";
}
function workLabels(preview: RebuildPreview): (key: string) => string {
  const labels = new Map<string, string>();
  const counts = new Map<string, number>();
  for (const work of preview.work) {
    const name = workName(work.key);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const positions = new Map<string, number>();
  for (const work of preview.work) {
    const name = workName(work.key);
    const position = (positions.get(name) ?? 0) + 1;
    positions.set(name, position);
    labels.set(work.key, (counts.get(name) ?? 0) > 1 ? `${name} ${position}` : name);
  }
  return (key) => labels.get(key) ?? workName(key);
}
