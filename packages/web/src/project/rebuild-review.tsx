import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import { useState } from "react";
import { Button } from "@/components/ui/button";
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
            {change.path}: {change.before ?? "None"} → {change.after ?? "None"}
          </li>
        ))}
      </ul>
      <ul>
        {preview.work.map((work) => (
          <li key={work.key}>
            {work.key}: {work.disposition}. {work.reason}
            {work.inflight ? " An already submitted request may still be billed." : ""}
          </li>
        ))}
      </ul>
      <p>Retained outputs: {preview.retained.map((output) => output.slot).join(", ") || "None"}</p>
      {preview.wholeRequestNotice === null ? null : <p>{preview.wholeRequestNotice}</p>}
      <ul>
        {preview.costs.rows.map((row) => (
          <li key={`${row.stage}-${row.detail}`}>
            {row.stage}: {money(row.low)}–{money(row.high)}. {row.detail}
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
          Keep the provided content for {key}
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
