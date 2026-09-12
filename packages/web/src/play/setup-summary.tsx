import type { ReactElement } from "react";
import { Button } from "@/components/ui/button";
import type { Blocker } from "./admission";
import type { PlayFormState } from "./state";
export function SetupSummary({
  form,
  blocker,
  onReveal,
}: {
  readonly form: PlayFormState;
  readonly blocker: Blocker | undefined;
  readonly onReveal: (field: string) => void;
}): ReactElement {
  const rows = [
    [
      "Article",
      form.sources.article,
      form.sources.article === "provide" ? "provided.article" : "articlePrompt",
    ],
    ["Audio", form.sources.audio, "sources.audio"],
    [
      "Images",
      form.sources.images === "generate"
        ? `${form.imagePrompts.reduce((n, p) => n + p.number, 0)} images`
        : form.sources.images,
      "sources.images",
    ],
    [
      "Export",
      form.sources.video === "generate"
        ? form.sources.audio === "off"
          ? "Silent MP4"
          : "MP4"
        : form.sources.audio === "off"
          ? "Individual outputs"
          : "Combined WAV",
      "sources.video",
    ],
  ] as const;
  return (
    <aside aria-label="Setup summary" className="min-w-0 min-[1100px]:sticky min-[1100px]:top-6">
      <h2 className="mb-3 font-semibold">This run</h2>
      <dl className="divide-y divide-line">
        {rows.map(([label, value, field]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2 text-small">
            <dt className="text-ink3">{label}</dt>
            <dd>
              <Button variant="ghost" onClick={() => onReveal(field)} aria-label={`Edit ${label}`}>
                {value}
              </Button>
            </dd>
          </div>
        ))}
      </dl>
      {blocker ? (
        <div className="mt-4 text-small text-ink2">
          <p>{blocker.hint}</p>
          <Button variant="ghost" onClick={() => onReveal(blocker.field)}>
            Fix setup
          </Button>
        </div>
      ) : null}
      <p className="mt-4 text-small text-ink3">
        Nothing starts until you review the costs and choose Start run.
      </p>
    </aside>
  );
}
