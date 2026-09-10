import type { RunDraft } from "@app/slices/admission/model.js";
import type { Field } from "@app/slices/admission/substitute.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { read } from "@/http";

export interface BatchItem {
  readonly key: string;
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
}
export function BatchEditor({
  items,
  fields,
  title,
  values,
  onChange,
}: {
  readonly items: readonly BatchItem[];
  readonly fields: readonly Field[];
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
  readonly onChange: (items: readonly BatchItem[]) => void;
}) {
  const prefix = useId();
  return (
    <details className="rounded-control border border-line p-3">
      <summary className="cursor-pointer text-body font-medium">
        Queue keyword variations {items.length ? `(${items.length + 1} videos)` : ""}
      </summary>
      <p className="my-3 text-small text-ink2">
        The setup above is video 1. Add videos with different titles and keywords. They run one at a
        time; a failed video releases the next, and a pause holds the queue.
      </p>
      {items.map((item, i) => (
        <fieldset
          key={item.key}
          className="mb-3 flex min-w-0 flex-col gap-2 border-t border-line pt-3"
        >
          <legend className="text-small text-ink2">Video {i + 2}</legend>
          <label htmlFor={`${prefix}-${item.key}-title`} className="text-small">
            Title
            <Input
              id={`${prefix}-${item.key}-title`}
              value={item.title}
              maxLength={200}
              onChange={(e) =>
                onChange(
                  items.map((x) => (x.key === item.key ? { ...x, title: e.target.value } : x)),
                )
              }
            />
          </label>
          {fields.map((field) => (
            <label
              key={field.name}
              htmlFor={`${prefix}-${item.key}-${encodeURIComponent(field.name)}`}
              className="text-small"
            >
              {field.name}
              <Input
                id={`${prefix}-${item.key}-${encodeURIComponent(field.name)}`}
                value={item.values[field.name] ?? values[field.name] ?? ""}
                onChange={(e) =>
                  onChange(
                    items.map((x) =>
                      x.key === item.key
                        ? { ...x, values: { ...x.values, [field.name]: e.target.value } }
                        : x,
                    ),
                  )
                }
              />
            </label>
          ))}
          <Button onClick={() => onChange(items.filter((x) => x.key !== item.key))}>
            Remove video {i + 2}
          </Button>
        </fieldset>
      ))}
      <Button
        disabled={items.length >= 49}
        onClick={() =>
          onChange([
            ...items,
            {
              key: crypto.randomUUID(),
              title: `${title || "Video"} ${items.length + 2}`,
              values: { ...values },
            },
          ])
        }
      >
        Add keyword variation
      </Button>
    </details>
  );
}
export function RunReview({
  draft,
  items,
  pending,
  failure,
  onStart,
  onClose,
}: {
  readonly draft: RunDraft;
  readonly items: readonly BatchItem[];
  readonly pending: boolean;
  readonly failure?: string | undefined;
  readonly onStart: () => void;
  readonly onClose: () => void;
}) {
  const { api } = useApp();
  const wordsId = useId();
  const [words, setWords] = useState(1500);
  const input = {
    draft,
    expectedWords: words,
    ...(items.length
      ? {
          items: [
            { title: draft.title, values: draft.values },
            ...items.map(({ title, values }) => ({ title, values })),
          ],
        }
      : {}),
  };
  const costs = useQuery({
    queryKey: ["run-estimate", input],
    retry: false,
    queryFn: async () =>
      read<{ estimates: readonly CostEstimate[] }>(
        await api.fetch(`${api.origin}/api/projects/estimate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
  });
  const estimates = costs.data?.estimates ?? [];
  const low = estimates.reduce((n, e) => n + e.low, 0);
  const high = estimates.reduce((n, e) => n + e.high, 0);
  const unknown = estimates.reduce((n, e) => n + e.unknown, 0);
  const rows =
    estimates[0]?.rows.map((r, i) => ({
      ...r,
      low: estimates.some((e) => e.rows[i]?.low === null)
        ? null
        : estimates.reduce((n, e) => n + (e.rows[i]?.low ?? 0), 0),
      high: estimates.some((e) => e.rows[i]?.high === null)
        ? null
        : estimates.reduce((n, e) => n + (e.rows[i]?.high ?? 0), 0),
    })) ?? [];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>
          Review {items.length ? `${items.length + 1} queued videos` : "run cost"}
        </DialogTitle>
        <DialogDescription>
          Estimated provider charges in USD. Starting authorizes the selected jobs; this estimate
          does not cap spending.
        </DialogDescription>
        {draft.sources.article === "generate" ? (
          <label htmlFor={wordsId} className="text-body">
            Expected article words per video
            <Input
              id={wordsId}
              type="number"
              min={1}
              max={100000}
              value={words}
              disabled={pending}
              onChange={(e) => setWords(Math.min(100000, Math.max(1, Number(e.target.value) || 1)))}
            />
          </label>
        ) : null}
        {costs.isFetching ? (
          <p role="status" className="text-body text-ink2">
            Calculating estimate…
          </p>
        ) : null}
        {costs.error ? (
          <p role="alert" className="text-body text-red">
            {costs.error.message}
          </p>
        ) : null}
        {costs.data ? (
          <>
            <p className="text-title font-bold">
              {unknown ? "Known subtotal: " : "Estimated total: "}
              {money(low, high)}
            </p>
            {unknown ? (
              <p className="text-body text-ink2">
                Plus {unknown} stage charge{unknown === 1 ? "" : "s"} with unavailable pricing.
              </p>
            ) : null}
            <div className="divide-y divide-line">
              {rows.map((r) => (
                <div key={r.stage} className="py-2">
                  <div className="flex justify-between gap-4 text-body">
                    <span>{r.stage}</span>
                    <span>
                      {r.low === null || r.high === null ? "Unknown" : money(r.low, r.high)}
                    </span>
                  </div>
                  <p className="mt-1 text-small text-ink2">{r.detail}</p>
                </div>
              ))}
            </div>
            {estimates[0]?.assumptions.map((note) => (
              <p key={note} className="text-small text-ink2">
                {note}
              </p>
            ))}
            <p className="text-small text-ink3">
              Catalogue verified {estimates[0]?.catalogueDate ?? "date unavailable"}. Batch rows
              show combined costs.
            </p>
          </>
        ) : null}
        {failure ? (
          <p role="alert" className="text-body text-red">
            {failure}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button disabled={pending} onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={pending || costs.isFetching || !costs.data || costs.isError}
            onClick={onStart}
          >
            {pending
              ? "Starting…"
              : items.length
                ? `Queue ${items.length + 1} videos`
                : "Start run"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
function money(low: number, high: number): string {
  const format = (n: number): string => (n === 0 ? "$0" : n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);
  return low === high ? format(low) : `${format(low)} – ${format(high)}`;
}
