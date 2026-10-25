import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useState } from "react";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { Button } from "@/components/kit/button";
import { FileLink, TextLink } from "@/components/kit/link";
import { Player } from "@/components/kit/player";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { Steps } from "@/components/kit/steps";
import { cn } from "@/lib/utils";
import { templateChecksQuery } from "./api";
import {
  EarlierSamples,
  FullScriptSwitch,
  MakeSampleButton,
  PaidBody,
  paidSections,
} from "./paid-sample";
import { SayItAs } from "./say-it-as";
import { sectionWord, stateTone } from "./section-rail";
import { SampleTopic } from "./topic";

type Section = StudioView["sections"][number];

// The free samples a section shows, made on this computer.
const freeOf = (
  view: StudioView,
  section: TemplateSection,
): StudioView["free"]["video"] | undefined =>
  section === "video"
    ? view.free.video
    : section === "voice"
      ? view.free.loudness
      : section === "document"
        ? view.free.document
        : undefined;

// The checks a sample can't be made past: a keyword left empty, a service missing, no voice.
const blocking = new Set(["keywords", "providers", "voice"]);

// Beside a section's settings: the topic every sample is about, then this section's sample, its
// state in words, and the one button that makes it, priced ("Make sample · about $0.08", or
// "· free" for the ones made on this computer). While a check says a run can't start, the
// check's fix stands where the button would.
export function SamplePanel({
  view,
  section,
  making,
  onMake,
  aliasesOn,
  onAliasesOn,
}: {
  readonly view: StudioView;
  readonly section: Section;
  // Make sample (free) was pressed and its request hasn't answered.
  readonly making: boolean;
  readonly onMake: () => void;
  // Whether the template being edited says names the way your pronunciations list them.
  readonly aliasesOn: boolean;
  readonly onAliasesOn: () => void;
}): ReactElement {
  const { api } = useApp();
  const [problem, setProblem] = useState<string | null>(null);
  const checks = useQuery(templateChecksQuery(api, view.template.id));
  const free = freeOf(view, section.id);
  const paid = paidSections.includes(section.id);
  const makeable = free !== undefined && (free.state === "stale" || free.state === "needs-fix");
  const remakeable =
    paid &&
    ["stale", "needs-fix", "waiting"].includes(section.state) &&
    view.paid.state !== "queued" &&
    view.paid.state !== "making";
  const failing =
    checks.data?.version === view.template.version
      ? checks.data.checks.find((check) => !check.ok && blocking.has(check.id))
      : undefined;
  const fix = failing?.fix;
  // A fix in the section already open is in the settings beside the sample, not a link away.
  const here =
    fix !== undefined &&
    fix.href === `/templates/${encodeURIComponent(view.template.id)}?section=${section.id}`;
  const action = remakeable ? (
    fix === undefined ? (
      <MakeSampleButton view={view} onDone={setProblem} />
    ) : here ? (
      <p className="m-0 text-small text-ink-2">{`${failing?.sentence ?? ""} Choose it in this section's settings, then Save.`}</p>
    ) : (
      <TextLink to={fix.href} className="text-small">{`${fix.label} first`}</TextLink>
    )
  ) : free !== undefined && !paid && makeable ? (
    <Button size="small" disabled={making} disabledReason="Asking for the sample" onClick={onMake}>
      Make sample · free
    </Button>
  ) : null;
  return (
    <section aria-label={`${section.label} sample`} className="flex flex-col gap-3">
      <SampleTopic view={view} />
      <SectionHead
        title="Sample"
        as="h3"
        className="pb-0"
        status={<Status tone={stateTone[section.state]}>{sectionWord(section)}</Status>}
      />
      <p
        className={cn(
          "m-0 text-small",
          section.state === "needs-fix" ? "text-danger" : "text-ink-2",
        )}
      >
        {section.sentence}
      </p>
      {action === null ? null : <div className="flex flex-wrap items-center gap-2">{action}</div>}
      {problem === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {problem}
        </p>
      )}
      {section.id === "script" && view.template.document.form.sources.article === "generate" ? (
        <FullScriptSwitch view={view} onDone={setProblem} />
      ) : null}
      <PaidBody view={view} section={section.id} />
      {section.id === "voice" && section.state !== "off" && section.state !== "provided" ? (
        <SayItAs
          templateId={view.template.id}
          revisionId={view.paid.revisionId}
          aliasesOn={aliasesOn}
          onAliasesOn={onAliasesOn}
        />
      ) : null}
      <SampleBody view={view} section={section.id} />
      {paid ? <EarlierSamples view={view} /> : null}
    </section>
  );
}

function SampleBody({
  view,
  section,
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
}): ReactElement | null {
  const { api } = useApp();
  const at = (url: string): string => `${api.origin}${url}`;
  const format = view.template.document.form.format;
  switch (section) {
    case "video":
      return view.free.video.url === null ? null : (
        <Frame>
          <Player
            src={at(view.free.video.url)}
            label={`${view.template.name}: 30-second video sample`}
            portrait={format === "9:16"}
            square={format === "1:1"}
          />
        </Frame>
      );
    case "voice": {
      const { loudness } = view.free;
      if (loudness.beforeUrl === null || loudness.url === null) return null;
      return (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-small font-semibold" title={lufs(loudness.beforeLufs)}>
            Before levelling
          </p>
          <AudioPlayer src={at(loudness.beforeUrl)} label="Sample narration before levelling" />
          <p className="m-0 text-small font-semibold" title={lufs(loudness.afterLufs)}>
            After levelling (YouTube loudness)
          </p>
          <AudioPlayer src={at(loudness.url)} label="Sample narration after levelling" />
          {heldBack(loudness) === "" ? null : (
            <p className="m-0 text-small text-ink-2">{heldBack(loudness)}</p>
          )}
        </div>
      );
    }
    case "document":
      // A phone's browser shows no PDF inline, so the file opens on its own too.
      return view.free.document.url === null ? null : (
        <div className="flex flex-col gap-2">
          <Frame className="max-md:hidden">
            <iframe
              title={`${view.template.name}: PDF sample`}
              src={`${at(view.free.document.url)}#page=1&view=FitH`}
              className="block h-[520px] w-full border-0 bg-surface"
            />
          </Frame>
          <FileLink
            href={at(view.free.document.url)}
            target="_blank"
            rel="noreferrer"
            size="small"
            className="self-start"
          >
            Open the PDF sample
          </FileLink>
        </div>
      );
    case "reviews":
      return view.reviews.length === 0 ? null : (
        <Steps
          label="Where a run pauses"
          steps={view.reviews.map((step) => ({
            id: step.id,
            name: step.name,
            tone: step.kind === "checkpoint" ? "waiting" : "info",
            state: step.kind === "checkpoint" ? "Waits for you" : "Checked by AI",
            time: step.by === "you" ? "You" : step.by === "agent" ? "Agent" : "Model",
            detail: step.detail,
          }))}
        />
      );
    default:
      return null;
  }
}

function Frame({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn("overflow-hidden rounded-media border border-line", className)}>
      {children}
    </div>
  );
}

const lufs = (value: number | null): string | undefined =>
  value === null ? undefined : `${value.toFixed(1)} LUFS`;

// A level that lands more than half a LU off its target says why: the limiter held the peaks
// under the ceiling (Slopify's levelling stops adding gain past 6 dB more than the plain one).
function heldBack(loudness: StudioView["free"]["loudness"]): string {
  const { afterLufs, targetLufs, ceiling } = loudness;
  if (afterLufs === null || targetLufs === null || ceiling === null) return "";
  const short = targetLufs - afterLufs;
  if (Math.abs(short) <= 0.5) return "";
  if (short < 0)
    return `It comes out ${Math.abs(short).toFixed(1)} LU louder than YouTube's ${targetLufs.toFixed(1)} LUFS.`;
  return `Held back ${short.toFixed(1)} LU from YouTube's ${targetLufs.toFixed(1)} LUFS so its peaks stay under ${ceiling.toFixed(1)} dBTP.`;
}
