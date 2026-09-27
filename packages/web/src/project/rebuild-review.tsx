import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import { type ReactNode, useId, useState } from "react";
import { Callout } from "@/components/kit/callout";
import { Button } from "@/components/ui/button";
import { outputSlotLabel } from "./output-label.js";
export interface RebuildConsent {
  readonly acknowledgeUnknownCosts: boolean;
  readonly confirmedProvidedWorkKeys: readonly string[];
}
export function RebuildReview({
  preview,
  pending,
  feedback,
  onStart,
  onCancel,
}: {
  readonly preview: RebuildPreview;
  readonly pending: boolean;
  readonly feedback?: ReactNode;
  readonly onStart: (consent: RebuildConsent) => void;
  readonly onCancel: () => void;
}): import("react").ReactElement {
  const label = workLabels(preview);
  const [confirmed, setConfirmed] = useState<readonly string[]>([]);
  const [unknown, setUnknown] = useState(false);
  const holdId = useId();
  const money = (value: number | null) =>
    value === null
      ? "Unknown"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 4,
        }).format(value);
  const blocked = preview.work.filter((work) => work.disposition === "blocked");
  const unconfirmed = preview.providedReuseRequired.filter((key) => !confirmed.includes(key));
  // Each thing still holding Start back, said next to the button so it is never a mystery.
  const holds = [
    ...(blocked.length === 0
      ? []
      : [
          `${blocked.length === 1 ? "1 item is" : `${blocked.length} items are`} unavailable (reasons above)`,
        ]),
    ...unconfirmed.map((key) => `tick “Keep the provided content for ${label(key)}”`),
    ...(preview.costs.unknown === 0 || unknown
      ? []
      : [`tick “I understand that ${preview.costs.unknown} cost estimates are unknown”`]),
  ];
  const allowed = holds.length === 0;
  const counts = dispositionOrder
    .map((disposition) => ({
      disposition,
      count: preview.work.filter((work) => work.disposition === disposition).length,
    }))
    .filter((row) => row.count > 0);
  return (
    <section aria-label="Review affected rebuild" className="space-y-3">
      {preview.review?.inputChanges.length ? (
        <details open>
          <summary>Changed inputs since the previous revision</summary>
          <dl className="space-y-3">
            {preview.review.inputChanges.map((change) => (
              <div key={change.label}>
                <dt className="font-semibold">{change.label}</dt>
                <dd className="grid gap-2 sm:grid-cols-2">
                  <div className="min-w-0">
                    <span className="text-small text-ink2">Before</span>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-small">
                      {change.before ?? "Not set"}
                    </pre>
                  </div>
                  <div className="min-w-0">
                    <span className="text-small text-ink2">After</span>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-small">
                      {change.after ?? "Not set"}
                    </pre>
                  </div>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
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
      <details>
        <summary>
          Work items ({preview.work.length}):{" "}
          {counts.map((row) => `${row.count} ${dispositions[row.disposition]}`).join(", ") ||
            "none"}
        </summary>
        <ul>
          {preview.work.map((work) => (
            <li key={work.key}>
              {label(work.key)}: {dispositions[work.disposition]}. {work.reason}
              {work.inflight ? " An already submitted request may still be billed." : ""}
              {preview.review?.requests
                .filter((request) => request.key === work.key)
                .map((request) => (
                  <div key={request.key}>
                    {request.settings === null ? null : (
                      <p className="text-small text-ink2">{request.settings}</p>
                    )}
                    {request.text === null ? null : (
                      <details>
                        <summary>View request text</summary>
                        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-small">
                          {request.text}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
            </li>
          ))}
        </ul>
      </details>
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
      {blocked.length === 0 ? null : (
        <Callout
          tone="danger"
          title={`${blocked.length === 1 ? "1 item can’t" : `${blocked.length} items can’t`} run, so this rebuild can’t start`}
        >
          <ul className="space-y-1">
            {blockedReasons(blocked, label).map((row) => (
              <li key={row.reason}>
                <span className="font-semibold">{row.what}:</span> {row.reason}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {feedback}
      <div className="sticky bottom-[-16px] -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-panel px-4 py-3">
        <Button
          variant="primary"
          type="button"
          disabled={pending || !allowed}
          aria-describedby={allowed ? undefined : holdId}
          onClick={() =>
            onStart({
              acknowledgeUnknownCosts: unknown,
              confirmedProvidedWorkKeys: confirmed,
            })
          }
        >
          {pending ? "Starting rebuild…" : "Start rebuild"}
        </Button>
        <Button type="button" disabled={pending} onClick={onCancel}>
          Cancel rebuild
        </Button>
        {allowed || pending ? null : (
          <p id={holdId} className="min-w-0 text-small text-ink2">
            Start rebuild is off until: {holds.join("; ")}.
          </p>
        )}
      </div>
    </section>
  );
}

const dispositionOrder = ["generate", "local", "review", "reuse", "blocked"] as const;
// Blocked work grouped by its reason: 24 narration requests refused for one cause read as one
// line, not 24.
function blockedReasons(
  blocked: readonly RebuildPreview["work"][number][],
  label: (key: string) => string,
): readonly { readonly what: string; readonly reason: string }[] {
  const groups = new Map<string, string[]>();
  for (const work of blocked) {
    const reason = work.reason.trim() || "No reason was given.";
    groups.set(reason, [...(groups.get(reason) ?? []), work.key]);
  }
  return [...groups].map(([reason, keys]) => ({
    reason,
    what:
      keys.length === 1
        ? label(keys[0] ?? "")
        : `${keys.length} ${new Set(keys.map(workName)).size === 1 ? plural(workName(keys[0] ?? "")) : "items"}`,
  }));
}
function plural(name: string): string {
  return /s$/u.test(name) ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}s`;
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
  for (const request of preview.review?.requests ?? []) labels.set(request.key, request.label);
  return (key) => labels.get(key) ?? workName(key);
}
