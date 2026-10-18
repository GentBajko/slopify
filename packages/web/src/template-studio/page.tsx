import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useCallback, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Chip } from "@/components/kit/status";
import { Tabs } from "@/components/kit/tabs";
import { cn } from "@/lib/utils";
import { UnsavedLeaveGuard } from "@/routes/unsaved-leave-guard";
import { templatesKey, updateProjectTemplate } from "@/templates/api";
import { templateStudioKey, templateStudioQuery } from "./api";
import { ChecksList } from "./checks-list";
import { FineTune } from "./fine-tune";
import { MadeWith } from "./made-with";
import { SamplePanel } from "./sample-panel";
import { SectionRail } from "./section-rail";
import { TemplateSession } from "./session";
import { VisibleControls } from "./visible";

type Pane = "sections" | "settings" | "sample";

// Library → Templates → Open studio: a template set up section by section, in pipeline order,
// each section's sample beside its settings.
export function TemplateStudioPage({
  templateId,
  section,
}: {
  readonly templateId: string;
  readonly section: TemplateSection;
}): ReactElement {
  const { api } = useApp();
  const studio = useQuery(templateStudioQuery(api, templateId));
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
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const saved = view.template.document;
  const [document, setDocument] = useState<PlayDraftDocument>(saved);
  const [pane, setPane] = useState<Pane>("settings");
  const [fineTune, setFineTune] = useState(0);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | undefined>();
  const [saving, setSaving] = useState(false);
  const mutation = useRef(crypto.randomUUID());
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
  async function save(): Promise<void> {
    setSaving(true);
    setStatus({ tone: "info", text: "Saving…" });
    try {
      const reply = await updateProjectTemplate(api, view.template.id, {
        baseVersion: view.template.version,
        mutationId: mutation.current,
        name: view.template.name,
        document,
      });
      if (!reply.ok) {
        setStatus({ tone: "error", text: `The template wasn't saved: ${reply.message}` });
        return;
      }
      mutation.current = crypto.randomUUID();
      await client.invalidateQueries({ queryKey: templatesKey });
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
    } catch (error) {
      setStatus({
        tone: "error",
        text: `The template wasn't saved: ${error instanceof Error ? error.message : String(error)} Press Save again.`,
      });
    } finally {
      setSaving(false);
    }
  }
  if (current === undefined) return <StudioSkeleton />;
  const hidden = (which: Pane) => (pane === which ? undefined : "max-md:hidden");
  return (
    <TemplateSession document={document} onEdit={edit} onFiles={onFiles}>
      <UnsavedLeaveGuard dirty={dirty} what="your template changes" saveLabel="Save" />
      <PageHeader
        row
        crumb={<TextLink to="/templates">Templates</TextLink>}
        title={view.template.name}
        meta={`Version ${String(view.template.version)} · ${gateWords(view)}`}
        actions={<Chip>{`Sample topic: ${view.sample.topic}`}</Chip>}
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
            <SamplePanel view={view} section={current} />
            <ChecksList checks={view.checks} />
          </div>
        }
      >
        <section
          aria-label={`${current.label} settings`}
          className={cn("flex flex-col gap-4", hidden("settings"))}
        >
          <SectionHead title={current.label} as="h2" meta={current.sentence} />
          <VisibleControls section={current.id} document={document} onEdit={edit} />
          <MadeWith
            section={current.id}
            document={document}
            onChange={() => setFineTune((n) => n + 1)}
          />
          <Fold
            key={`${current.id}:${String(fineTune)}`}
            defaultOpen={fineTune > 0}
            summary={`Fine-tune ${current.label}`}
          >
            <FineTune section={current.id} onFiles={onFiles} />
          </Fold>
        </section>
      </Workspace>
      <ActionBar
        status={
          <StatusSlot tone={status?.tone ?? "info"}>
            {status?.text ?? (dirty ? "Unsaved changes." : undefined)}
          </StatusSlot>
        }
      >
        <Button
          variant="primary"
          disabled={!dirty || saving}
          disabledReason={saving ? "Saving" : "Nothing changed since the last save"}
          onClick={() => void save()}
        >
          Save
        </Button>
      </ActionBar>
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
