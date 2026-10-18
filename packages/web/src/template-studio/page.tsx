import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { sectionLabel, type TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { useAssistantContext } from "@/assistant/screen";
import type { StatusTone } from "@/components/kit/action-bar";
import { Fold } from "@/components/kit/fold";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Tabs } from "@/components/kit/tabs";
import { designTemplateQuery } from "@/designs/api";
import { cn } from "@/lib/utils";
import { UnsavedLeaveGuard } from "@/routes/unsaved-leave-guard";
import { PromptAnatomy } from "./anatomy";
import type { BakeoffPick } from "./api";
import { requestFreeSamples, templateStudioKey, templateStudioQuery } from "./api";
import { BakeoffResults, bakeoffSectionOf, CompareModels, usingModel } from "./bakeoff";
import { ChecksList } from "./checks-list";
import { FineTune } from "./fine-tune";
import { MadeWith } from "./made-with";
import { ExportPack, PackSamples } from "./pack";
import { MarkReady } from "./ready-gate";
import { SamplePanel } from "./sample-panel";
import { SaveBar } from "./save-bar";
import { SectionRail } from "./section-rail";
import { TemplateSession } from "./session";
import { SampleTopic } from "./topic";
import { VisibleControls } from "./visible";

type Pane = "sections" | "settings" | "sample";

// Library → Templates → Open studio: a template set up section by section, in pipeline order,
// each section's sample beside its settings.
export function TemplateStudioPage({
  templateId,
  section,
  compare,
}: {
  readonly templateId: string;
  readonly section: TemplateSection;
  // A model to compare on the sample (Settings → Models → Compare on a sample).
  readonly compare?: BakeoffPick | undefined;
}): ReactElement {
  const { api } = useApp();
  // The assistant knows which template and section the person has open.
  useAssistantContext({ templateId, section: sectionLabel[section] });
  const studio = useQuery(templateStudioQuery(api, templateId));
  // One studio address for every kind of template: a design template's id opens its studio.
  const design = useQuery({
    ...designTemplateQuery(api, templateId),
    enabled: studio.error !== null,
    retry: false,
  });
  if (studio.error && design.data !== undefined)
    return (
      <Navigate to="/design-templates/$templateId" params={{ templateId }} search={{}} replace />
    );
  if (studio.error && design.isFetching) return <StudioSkeleton />;
  if (studio.error)
    return (
      <div>
        <PageHeader
          title="Template studio"
          crumb={<TextLink to="/templates">Templates</TextLink>}
        />
        <p role="alert" className="m-0 text-body text-danger">
          {`The studio didn't open: ${studio.error.message}`}
        </p>
      </div>
    );
  if (studio.data === undefined) return <StudioSkeleton />;
  return (
    <Studio
      key={`${studio.data.template.id}:${String(studio.data.template.version)}`}
      view={studio.data}
      section={section}
      compare={compare}
    />
  );
}

function gateWords(view: StudioView): string {
  const runs =
    view.runnableVersion === null || view.runnableVersion === view.template.version
      ? ""
      : ` · schedules run version ${String(view.runnableVersion)}`;
  switch (view.gate) {
    case "ready":
      return "Ready";
    case "carried":
      return "Ready, carried from an earlier version";
    case "legacy":
      return "Saved before the studio: schedules run it";
    case "unchecked":
      return `Not checked in the studio${runs}`;
  }
}

function Studio({
  view,
  section,
  compare,
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
  readonly compare?: BakeoffPick | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const saved = view.template.document;
  const [document, setDocument] = useState<PlayDraftDocument>(saved);
  const [pane, setPane] = useState<Pane>("settings");
  const [fineTune, setFineTune] = useState(0);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | undefined>();
  const [making, setMaking] = useState(false);
  const asked = useRef(false);
  async function make(): Promise<void> {
    setMaking(true);
    try {
      await requestFreeSamples(api, view.template.id);
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
    } catch (error) {
      setStatus({
        tone: "error",
        text: `The samples weren't asked for: ${error instanceof Error ? error.message : String(error)} Press Make samples again.`,
      });
    } finally {
      setMaking(false);
    }
  }
  // Each version's free samples are asked for once, by themselves: they cost nothing.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per version, which keys this component.
  useEffect(() => {
    const free = [view.free.video, view.free.loudness, view.free.document];
    // The schedule's cost a month is worked out by the same free job.
    const unpriced = view.schedule.cost !== null && view.schedule.cost.problem !== null;
    if (asked.current || !(unpriced || free.some((sample) => sample.state === "stale"))) return;
    asked.current = true;
    void make();
  }, [view]);
  const dirty = JSON.stringify(document) !== JSON.stringify(saved);
  const current = view.sections.find((one) => one.id === section) ?? view.sections[0];
  const onFiles = useCallback(
    () =>
      setStatus({
        tone: "info",
        text: "Files are added to each video in Play: the template keeps only that the video provides them.",
      }),
    [],
  );
  const edit = useCallback((next: PlayDraftDocument) => {
    setDocument(next);
    setStatus(undefined);
  }, []);
  if (current === undefined) return <StudioSkeleton />;
  const comparable = bakeoffSectionOf(current.id);
  const hidden = (which: Pane) => (pane === which ? undefined : "max-md:hidden");
  return (
    <TemplateSession document={document} onEdit={edit} onFiles={onFiles}>
      <UnsavedLeaveGuard dirty={dirty} what="your template changes" saveLabel="Save" />
      <PageHeader
        row
        crumb={<TextLink to="/templates">Templates</TextLink>}
        title={view.template.name}
        meta={`Version ${String(view.template.version)} · ${gateWords(view)}`}
        actions={
          <>
            <SampleTopic view={view} />
            <ExportPack
              view={view}
              onProblem={(message) =>
                setStatus(message === undefined ? undefined : { tone: "error", text: message })
              }
            />
            <MarkReady
              view={view}
              dirty={dirty}
              onProblem={(message) =>
                setStatus(message === undefined ? undefined : { tone: "error", text: message })
              }
            />
          </>
        }
      />
      <Tabs
        className="mb-4 md:hidden"
        label="Studio panes"
        idPrefix="studio"
        value={pane}
        onChange={setPane}
        items={[
          { id: "sections", label: "Sections" },
          { id: "settings", label: "Settings" },
          { id: "sample", label: "Sample" },
        ]}
      />
      <Workspace
        className="sl-workspace--studio"
        asideLabel="Sample and checks"
        sections={
          <div className={hidden("sections")}>
            <SectionRail
              templateId={view.template.id}
              sections={view.sections}
              current={current.id}
            />
          </div>
        }
        aside={
          <div className={cn("flex flex-col gap-6", hidden("sample"))}>
            <SamplePanel view={view} section={current} making={making} onMake={() => void make()} />
            <PackSamples templateId={view.template.id} />
            <ChecksList templateId={view.template.id} />
          </div>
        }
      >
        <section
          aria-label={`${current.label} settings`}
          className={cn("flex flex-col gap-4", hidden("settings"))}
        >
          <SectionHead title={current.label} as="h2" />
          <VisibleControls section={current.id} document={document} onEdit={edit} />
          <MadeWith
            section={current.id}
            document={document}
            onChange={() => setFineTune((n) => n + 1)}
          />
          {comparable === undefined ? null : (
            <>
              <CompareModels
                templateId={view.template.id}
                section={comparable}
                document={document}
                dirty={dirty}
                preset={compare}
              />
              <BakeoffResults
                templateId={view.template.id}
                section={comparable}
                onUse={(pick, sentence) => {
                  edit(usingModel(document, comparable, pick));
                  setStatus({ tone: "success", text: sentence });
                }}
              />
            </>
          )}
          <Fold
            key={`${current.id}:${String(fineTune)}`}
            defaultOpen={fineTune > 0}
            summary={`Fine-tune ${current.label}`}
          >
            <FineTune section={current.id} onFiles={onFiles} />
          </Fold>
          <PromptAnatomy view={view} section={current.id} />
        </section>
      </Workspace>
      <SaveBar view={view} document={document} dirty={dirty} note={status} />
    </TemplateSession>
  );
}

// The page's shape while it loads: the header row, the three columns and the action bar.
function StudioSkeleton(): ReactElement {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the template studio">
      <div className="mb-4 h-8 w-72 rounded-control bg-raised" />
      <div className="sl-workspace sl-workspace--studio">
        <div className="h-96 rounded-control bg-raised" />
        <div className="h-96 rounded-control bg-raised" />
        <div className="h-96 rounded-control bg-raised" />
      </div>
    </div>
  );
}
