import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { usd } from "@/lib/format";
import { outputSlotLabel } from "./output-label.js";
import { RebuildScope } from "./rebuild-scope.js";
import { workLabels, workName } from "./rebuild-work-names.js";
export interface RebuildConsent {
  readonly acknowledgeUnknownCosts: boolean;
  readonly confirmedProvidedWorkKeys: readonly string[];
}

// Choose what to remake: what the rebuild will make, keep and skip, what it costs, and what
// it needs from the person, compactly. The counts and the cost are always in view; the
// changed inputs, each work item and each cost row are folded away. Everything Start still
// needs (a provided file to confirm, unknown costs to accept) sits beside Start itself.
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
  const blocked = preview.work.filter((work) => work.disposition === "blocked");
  const unconfirmed = preview.providedReuseRequired.filter((key) => !confirmed.includes(key));
  const making = preview.work.filter(
    (work) =>
      work.disposition === "generate" ||
      work.disposition === "local" ||
      work.disposition === "review",
  ).length;
  const verb = making === 1 ? "Remake 1 output" : `Remake ${String(making)} outputs`;
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
  const onPlan = preview.costs.rows.some((row) => row.onPlan === true);
  const apiLow = preview.costs.apiLow;
  const apiHigh = preview.costs.apiHigh;
  return (
    <section aria-label="Review affected rebuild" className="flex flex-col gap-5">
      <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {counts.map((row) => (
          <div key={row.disposition} className="flex flex-col">
            <dt className="order-2 text-small text-ink-2">{dispositions[row.disposition]}</dt>
            <dd className="order-1 m-0 font-condensed text-title-2 tabular-nums">{row.count}</dd>
          </div>
        ))}
        <div className="flex flex-col">
          <dt className="order-2 text-small text-ink-2">
            {preview.costs.unknown > 0 ? "known cost" : "cost"}
          </dt>
          <dd className="order-1 m-0 font-condensed text-title-2 tabular-nums">
            {range(preview.costs.low, preview.costs.high)}
          </dd>
        </div>
      </dl>
      <RebuildScope preview={preview} label={label} />
      {onPlan ? (
        <p className="m-0 text-small text-ink-2">
          {`CLI work: $0 on your plan${
            apiLow === undefined || apiHigh === undefined
              ? ""
              : ` · ~${range(apiLow, apiHigh)} via API`
          }.`}
        </p>
      ) : null}
      {blocked.length === 0 ? null : (
        <Callout
          tone="danger"
          title={`${blocked.length === 1 ? "1 item can’t" : `${blocked.length} items can’t`} run, so this rebuild can’t start`}
        >
          <ul className="m-0 flex flex-col gap-1 pl-5">
            {blockedReasons(blocked, label).map((row) => (
              <li key={row.reason}>
                <span className="font-semibold">{row.what}:</span> {row.reason}
              </li>
            ))}
          </ul>
        </Callout>
      )}
      {preview.wholeRequestNotice === null ? null : (
        <p className="m-0 text-small text-ink-2">{preview.wholeRequestNotice}</p>
      )}
      {preview.warnings.map((warning) => (
        <p key={warning} className="m-0 text-small text-waiting">
          {warning}
        </p>
      ))}

      <div className="flex flex-col divide-y divide-line border-y border-line">
        {preview.review?.inputChanges.length ? (
          <Fold summary={`Changed inputs (${String(preview.review.inputChanges.length)})`}>
            <dl className="m-0 flex flex-col gap-3">
              {preview.review.inputChanges.map((change) => (
                <div key={change.label}>
                  <dt className="font-semibold">{change.label}</dt>
                  <dd className="m-0 grid gap-2 sm:grid-cols-2">
                    <Before label="Before" text={change.before} />
                    <Before label="After" text={change.after} />
                  </dd>
                </div>
              ))}
            </dl>
          </Fold>
        ) : null}
        <Fold
          summary={`Work items (${preview.work.length}): ${
            counts.map((row) => `${row.count} ${dispositions[row.disposition]}`).join(", ") ||
            "none"
          }`}
        >
          {preview.changedInputs.length === 0 ? null : (
            <ul className="m-0 mb-3 flex flex-col gap-1 pl-5">
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
          )}
          <ul className="m-0 flex flex-col gap-2 pl-5">
            {preview.work.map((work) => (
              <li key={work.key}>
                {label(work.key)}: {dispositions[work.disposition]}. {work.reason}
                {work.inflight ? " An already submitted request may still be billed." : ""}
                {preview.review?.requests
                  .filter((request) => request.key === work.key)
                  .map((request) => (
                    <div key={request.key}>
                      {request.settings === null ? null : (
                        <p className="m-0 text-small text-ink-2">{request.settings}</p>
                      )}
                      {request.text === null ? null : (
                        <details>
                          <summary className="cursor-pointer text-small">View request text</summary>
                          <pre className="m-0 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-small">
                            {request.text}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-3 text-small text-ink-2">
            Retained outputs:{" "}
            {preview.retained.map((output) => outputSlotLabel(output.slot)).join(", ") || "None"}
          </p>
        </Fold>
        {preview.costs.rows.length === 0 ? null : (
          <Fold summary="Cost by step">
            <ul className="m-0 flex flex-col gap-1 pl-5">
              {preview.costs.rows.map((row) => (
                <li key={`${row.stage}-${row.detail}`}>
                  {label(row.stage)}: {rowCost(row)}. {row.detail}
                </li>
              ))}
            </ul>
          </Fold>
        )}
      </div>

      {feedback}
      <div className="sticky bottom-[-16px] -mx-4 flex flex-col gap-3 border-t border-line bg-raised px-4 py-3">
        {preview.providedReuseRequired.length === 0 && preview.costs.unknown === 0 ? null : (
          <div className="flex flex-col gap-2 text-small">
            {preview.providedReuseRequired.map((key) => (
              <div key={key} className="flex items-start gap-1" {...helpScope}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={pending}
                    checked={confirmed.includes(key)}
                    onChange={(event) =>
                      setConfirmed(
                        event.target.checked
                          ? [...confirmed, key]
                          : confirmed.filter((one) => one !== key),
                      )
                    }
                  />
                  <span>Keep the provided content for {label(key)}</span>
                </label>
                <InfoTip id="project.rebuild.keep-provided" className="-my-1" />
              </div>
            ))}
            {preview.costs.unknown === 0 ? null : (
              <div className="flex items-start gap-1" {...helpScope}>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    disabled={pending}
                    checked={unknown}
                    onChange={(event) => setUnknown(event.target.checked)}
                  />
                  <span>I understand that {preview.costs.unknown} cost estimates are unknown.</span>
                </label>
                <InfoTip id="project.rebuild.unknown-costs" className="-my-1" />
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="primary"
            disabled={pending || !allowed}
            aria-describedby={allowed ? undefined : holdId}
            onClick={() =>
              onStart({
                acknowledgeUnknownCosts: unknown,
                confirmedProvidedWorkKeys: confirmed,
              })
            }
          >
            {pending ? "Starting the remake…" : verb}
          </Button>
          <Button disabled={pending} onClick={onCancel}>
            Keep things as they are
          </Button>
          {allowed || pending ? null : (
            <p id={holdId} className="m-0 min-w-0 text-small text-ink-2">
              {`${verb} is off until: ${holds.join("; ")}.`}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function Fold({ summary, children }: { readonly summary: string; readonly children: ReactNode }) {
  return (
    <details className="py-3 text-small">
      <summary className="cursor-pointer font-semibold text-ink">{summary}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

function Before({ label, text }: { readonly label: string; readonly text: string | null }) {
  return (
    <div className="min-w-0">
      <span className="text-small text-ink-2">{label}</span>
      <pre className="m-0 max-h-40 overflow-auto whitespace-pre-wrap break-words text-small">
        {text ?? "Not set"}
      </pre>
    </div>
  );
}

const money = (value: number | null) => (value === null ? "Unknown" : usd(value));

function range(low: number | null, high: number | null): string {
  if (low === high) return money(low);
  return `${money(low)}–${money(high)}`;
}

// One cost row: a CLI's work is "$0 on plan", with what the same work would cost through the
// API when the catalogue knows.
function rowCost(row: RebuildPreview["costs"]["rows"][number]): string {
  if (row.onPlan === true) {
    const api =
      row.apiLow === undefined || row.apiLow === null || row.apiHigh === undefined
        ? ""
        : ` · ~${range(row.apiLow, row.apiHigh ?? null)} via API`;
    return `$0 on plan${api}`;
  }
  return range(row.low, row.high);
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
  reuse: "kept as they are",
  generate: "to make",
  local: "built on this computer",
  review: "to confirm",
  blocked: "can't run",
};
