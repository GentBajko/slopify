import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { type ReactElement, type ReactNode, useState } from "react";
import { useApp } from "@/app-context";
import { AudioPlayer } from "@/components/kit/audio-player";
import { Button } from "@/components/kit/button";
import { FileLink, TextLink } from "@/components/kit/link";
import { Player } from "@/components/kit/player";
import { SectionHead } from "@/components/kit/section-head";
import { DataTable } from "@/components/kit/stats";
import { Status } from "@/components/kit/status";
import { Steps } from "@/components/kit/steps";
import { usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  EarlierSamples,
  FullScriptSwitch,
  MakeSampleButton,
  PaidBody,
  paidSections,
} from "./paid-sample";
import { SayItAs } from "./say-it-as";
import { stateTone, stateWord } from "./section-rail";

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

// Beside a section's settings: its sample, Make samples for the free ones and Make sample for
// a paid one that is outdated, waiting or failed. A failed one shows the step's own sentence.
export function SamplePanel({
  view,
  section,
  making,
  onMake,
}: {
  readonly view: StudioView;
  readonly section: Section;
  // Make samples was pressed and its request hasn't answered.
  readonly making: boolean;
  readonly onMake: () => void;
}): ReactElement {
  const [problem, setProblem] = useState<string | null>(null);
  const free = freeOf(view, section.id);
  const makeable = free !== undefined && (free.state === "stale" || free.state === "needs-fix");
  const paid = paidSections.includes(section.id);
  const remakeable =
    paid &&
    ["stale", "needs-fix", "waiting"].includes(section.state) &&
    view.paid.state !== "queued" &&
    view.paid.state !== "making";
  return (
    <section aria-label={`${section.label} sample`} className="flex flex-col gap-3">
      <SectionHead
        title="Sample"
        as="h3"
        className="pb-0"
        status={<Status tone={stateTone[section.state]}>{stateWord[section.state]}</Status>}
      >
        {remakeable ? <MakeSampleButton view={view} onDone={setProblem} /> : null}
        {free === undefined || paid ? null : (
          <Button
            size="small"
            disabled={!makeable || making}
            disabledReason={
              making
                ? "Asking for the samples"
                : free.state === "current"
                  ? "This sample is current"
                  : free.state === "off"
                    ? "This section is off"
                    : "The sample is being made"
            }
            onClick={onMake}
          >
            Make samples
          </Button>
        )}
      </SectionHead>
      <p
        className={cn(
          "m-0 text-small",
          section.state === "needs-fix" ? "text-danger" : "text-ink-2",
        )}
      >
        {section.sentence}
      </p>
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
        <SayItAs templateId={view.template.id} revisionId={view.paid.revisionId} />
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
      const level = (lufs: number | null) => (lufs === null ? "" : ` · ${lufs.toFixed(1)} LUFS`);
      return (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-small font-semibold">{`Before${level(loudness.beforeLufs)}`}</p>
          <AudioPlayer src={at(loudness.beforeUrl)} label="Sample narration before levelling" />
          <p className="m-0 text-small font-semibold">{`After${level(loudness.afterLufs)}${heldBack(loudness)}`}</p>
          <AudioPlayer src={at(loudness.url)} label="Sample narration after levelling" />
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
    case "schedule":
      return <ScheduleSample view={view} />;
    case "reviews":
      return (
        <Steps
          label="Where a run stops"
          steps={view.reviews.map((step) => ({
            id: step.id,
            name: step.name,
            tone: step.kind === "checkpoint" ? "waiting" : "info",
            state: step.kind === "checkpoint" ? "Waits for you" : "Checked automatically",
            time: step.by === "you" ? "You" : step.by === "agent" ? "Agent" : "Model",
            detail: step.detail,
          }))}
        />
      );
    default:
      return null;
  }
}

function ScheduleSample({ view }: { readonly view: StudioView }): ReactElement {
  const { runs, cost } = view.schedule;
  const when = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex flex-col gap-3">
      <DataTable
        caption="The next runs"
        rowKey={(run) => `${run.scheduleId}:${run.at}`}
        rows={runs}
        empty="No run is coming up."
        columns={[
          { id: "when", header: "When", cell: (run) => when.format(new Date(run.at)) },
          {
            id: "title",
            header: "Title",
            cell: (run) => (run.topic ? run.title : `${run.title} (no topic queued yet)`),
          },
          { id: "schedule", header: "Schedule", cell: (run) => run.scheduleName },
        ]}
      />
      {cost === null || cost.problem !== null ? null : (
        <p className="m-0 text-small text-ink-2">
          {`About ${usd(cost.high)} a month at most, for about ${String(cost.runs)} runs.`}
        </p>
      )}
      <TextLink to="/calendar" search={{ tab: "schedules" }} className="text-small">
        Schedules in the calendar
      </TextLink>
    </div>
  );
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

// A level that lands more than half a LU off its target says why: the limiter held the peaks
// under the ceiling (Slopify's levelling stops adding gain past 6 dB more than the plain one).
function heldBack(loudness: StudioView["free"]["loudness"]): string {
  const { afterLufs, targetLufs, ceiling } = loudness;
  if (afterLufs === null || targetLufs === null || ceiling === null) return "";
  const short = targetLufs - afterLufs;
  if (Math.abs(short) <= 0.5) return "";
  if (short < 0) return ` (target ${targetLufs.toFixed(1)} LUFS)`;
  return `: held back ${short.toFixed(1)} LU from ${targetLufs.toFixed(1)} so peaks stay under ${ceiling.toFixed(1)} dBTP`;
}
