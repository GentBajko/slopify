import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { AnatomyViewData, StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Select } from "@/components/kit/field";
import { cn } from "@/lib/utils";
import { anatomyQuery } from "./api";

// The sections whose settings send a prompt.
export const promptSections: readonly TemplateSection[] = [
  "script",
  "voice",
  "pictures",
  "thumbnail",
  "shorts",
  "upload",
  "reviews",
];

type Origin = AnatomyViewData["segments"][number]["origin"];

const originWord: Readonly<Record<Origin, string>> = {
  yours: "Your words",
  keyword: "Your keywords",
  slopify: "Filled by Slopify",
  setting: "Added by a setting",
};

const originClass: Readonly<Record<Origin, string>> = {
  yours: "",
  keyword: "rounded-sm bg-accent-tint px-0.5",
  slopify: "rounded-sm bg-waiting-tint px-0.5",
  setting: "rounded-sm bg-info-tint px-0.5 italic",
};

// Prompt anatomy: what each part of a section's prompt is and who wrote it. Read only when
// opened, since it works the prompt out.
export function PromptAnatomy({
  view,
  section,
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  if (!promptSections.includes(section)) return null;
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="rounded-control border border-line px-3"
    >
      <summary className="flex min-h-9 cursor-pointer items-center text-small text-ink-2">
        Prompt anatomy
      </summary>
      {open ? <AnatomyBody view={view} section={section} /> : null}
    </details>
  );
}

function AnatomyBody({
  view,
  section,
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
}): ReactElement {
  const { api } = useApp();
  const [item, setItem] = useState<string | undefined>();
  const anatomy = useQuery(
    anatomyQuery(api, view.template.id, section, item, view.template.version),
  );
  if (anatomy.error)
    return (
      <p role="alert" className="m-0 pb-3 text-small text-danger">
        {`The prompt anatomy didn't load: ${anatomy.error.message}`}
      </p>
    );
  const data = anatomy.data;
  if (data === undefined)
    return (
      <div role="status" aria-busy="true" aria-label="Working out the prompt" className="pb-3">
        <div className="h-16 rounded-control bg-raised" />
      </div>
    );
  if (data.problem !== null)
    return <p className="m-0 pb-3 text-small text-danger">{data.problem}</p>;
  if (data.item === null)
    return <p className="m-0 pb-3 text-small text-ink-2">This section sends no prompt.</p>;
  const shown = new Set(data.segments.map((segment) => segment.origin));
  return (
    <div className="flex flex-col gap-3 pb-3">
      {data.items.length > 1 ? (
        <Select
          aria-label="Prompt"
          value={data.item}
          onChange={(event) => setItem(event.target.value)}
          options={data.items.map((one) => ({ value: one.key, label: one.label }))}
        />
      ) : (
        <p className="m-0 text-small font-semibold">{data.items[0]?.label}</p>
      )}
      <p className="m-0 whitespace-pre-wrap text-small leading-relaxed">
        {data.segments.map((segment, index) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: the segments are the prompt in order and never move.
            key={index}
            className={cn(originClass[segment.origin], segment.unfilled === true && "opacity-70")}
            title={
              segment.name === undefined
                ? originWord[segment.origin]
                : `${originWord[segment.origin]}: ${segment.name}${segment.unfilled === true ? " (filled when the step runs)" : ""}`
            }
          >
            {segment.text}
          </span>
        ))}
      </p>
      <ul
        aria-label="What the marks mean"
        className="m-0 flex list-none flex-wrap gap-3 p-0 text-small"
      >
        {(["yours", "keyword", "slopify", "setting"] as const)
          .filter((origin) => shown.has(origin))
          .map((origin) => (
            <li key={origin} className={cn("text-ink-2", originClass[origin])}>
              {originWord[origin]}
            </li>
          ))}
      </ul>
      <p className="m-0 text-small text-ink-2">
        {data.fromSample
          ? "As the sample sent it."
          : "As the sample would send it: no sample was made from this setup yet."}
      </p>
    </div>
  );
}
