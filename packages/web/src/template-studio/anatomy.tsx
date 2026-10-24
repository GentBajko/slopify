import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { AnatomyViewData, StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Select } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
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

// Who is sent each section's prompt, for the fold's name: "What the writer is sent".
const sentTo: Partial<Readonly<Record<TemplateSection, string>>> = {
  script: "What the writer is sent",
  voice: "What the voice is sent",
  pictures: "What the image service is sent",
  thumbnail: "What the image service is sent for the thumbnail",
  shorts: "What the writer is sent for the shorts",
  upload: "What the writer is sent for the description and posts",
  reviews: "What the AI checks are sent",
};

// What a section's prompt says, part by part, and who wrote each part. Worked out only when
// opened, since it builds the prompt.
export function PromptAnatomy({
  view,
  section,
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
}): ReactElement | null {
  const summary = sentTo[section];
  if (!promptSections.includes(section) || summary === undefined) return null;
  return (
    <Fold summary={summary}>
      <WhenOpen>
        <AnatomyBody view={view} section={section} />
      </WhenOpen>
    </Fold>
  );
}

// A fold draws its content while closed too; this shows its children only while the fold
// around it is open, so the prompt is built only for a person who asked to see it.
function WhenOpen({ children }: { readonly children: ReactNode }): ReactElement {
  const marker = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const details = marker.current?.closest("details");
    if (details === null || details === undefined) return;
    const read = () => setOpen(details.open);
    read();
    details.addEventListener("toggle", read);
    return () => details.removeEventListener("toggle", read);
  }, []);
  return (
    <>
      <span ref={marker} hidden />
      {open ? children : null}
    </>
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
