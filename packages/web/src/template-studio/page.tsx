import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { withProviderDefaults } from "@app/slices/project-templates/provider-defaults.js";
import { sectionLabel, type TemplateSection } from "@app/slices/template-studio/model.js";
import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import {
  type ReactElement,
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useApp } from "@/app-context";
import { useAssistantContext } from "@/assistant/screen";
import { useDocumentTitle } from "@/components/document-title";
import type { StatusTone } from "@/components/kit/action-bar";
import { Fold } from "@/components/kit/fold";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Tabs } from "@/components/kit/tabs";
import { designTemplateQuery } from "@/designs/api";
import { cn } from "@/lib/utils";
import { providersQuery } from "@/queries";
import { UnsavedLeaveGuard } from "@/routes/unsaved-leave-guard";
import type { PlayHandoff } from "@/templates/play-handoff";
import { PromptAnatomy } from "./anatomy";
import type { BakeoffPick } from "./api";
import { requestFreeSamples, templateStudioKey, templateStudioQuery } from "./api";
import { BakeoffResults, bakeoffSectionOf, CompareModels, usingModel } from "./bakeoff";
import { ChecksList } from "./checks-list";
import { FineTune } from "./fine-tune";
import { MadeWith, useProviderDefaults } from "./made-with";
import { PackSamples } from "./pack";
import { gateLine, StudioActions, useApproval } from "./ready-gate";
import { SamplePanel } from "./sample-panel";
import { SaveBar } from "./save-bar";
import { ScheduleSection } from "./schedule-section";
import { SectionRail } from "./section-rail";
import { TemplateSession } from "./session";
import { VisibleControls } from "./visible";

type Pane = "sections" | "settings" | "sample";

// The sections whose whole editor is shown at once, with nothing folded: they hold few enough
// settings, and every one of them matters (the shorts, each pause and AI check, the
// description and each site's post).
const unfolded: readonly TemplateSection[] = ["shorts", "reviews", "upload"];
// Title and keywords' other settings (the language, a keyword the title doesn't fill) and
// Thumbnail's (who draws it and its prompt, past the source and count it leads with) follow
// their lead ones with no fold: a fold of one or two settings hides more than it tidies. PDF has
// no others: whether to make it and its look are both lead settings.
const followed: readonly TemplateSection[] = ["subject", "thumbnail"];
const leadOnly: readonly TemplateSection[] = ["document", "schedule"];
// The sections whose fold leaves out what they lead with (the images' source and Scenes from
// the article): it holds the rest of their settings, not all of them (fine-tune.tsx).
const rest: readonly TemplateSection[] = ["pictures"];

// Templates → Edit template: a template set up section by section, in run order, each
// section's sample beside its settings.
export function TemplateStudioPage({
  templateId,
  section,
  compare,
  play,
}: {
  readonly templateId: string;
  readonly section: TemplateSection;
  // A model to compare on the sample (Settings → Models → Compare on a sample).
  readonly compare?: BakeoffPick | undefined;
  // How Make a video opens Create; without it the page has no Make a video.
  readonly play?: PlayHandoff | undefined;
}): ReactElement {
  const { api } = useApp();
  // The assistant knows which template and section the person has open.
  useAssistantContext({ templateId, section: sectionLabel[section] });
  const studio = useQuery(templateStudioQuery(api, templateId));
  // One address for every kind of template: a design template's id opens its editor.
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
        <PageHeader title="Edit template" crumb={<TextLink to="/templates">Templates</TextLink>} />
        <p role="alert" className="m-0 text-body text-danger">
          {`This template didn't open: ${studio.error.message}`}
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
      play={play}
    />
  );
}

function Studio({
  view,
  section,
  compare,
  play,
}: {
  readonly view: StudioView;
  readonly section: TemplateSection;
  readonly compare?: BakeoffPick | undefined;
  readonly play?: PlayHandoff | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  useDocumentTitle(`${view.template.name} · Edit template`);
  const saved = view.template.document;
  const [document, setDocument] = useState<PlayDraftDocument>(saved);
  const [name, setName] = useState(view.template.name);
  const [pane, setPane] = useState<Pane>("settings");
  const [fineTune, setFineTune] = useState(0);
  const [status, setStatus] = useState<{ tone: StatusTone; text: string } | undefined>();
  const [making, setMaking] = useState(false);
  const asked = useRef(false);
  const providers = useQuery(providersQuery(api));
  const defaults = useProviderDefaults();
  async function make(): Promise<void> {
    setMaking(true);
    try {
      await requestFreeSamples(api, view.template.id);
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
    } catch (error) {
      setStatus({
        tone: "error",
        text: `The samples weren't asked for: ${error instanceof Error ? error.message : String(error)} Press Make sample again.`,
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
  const trimmed = name.trim();
  const dirty =
    JSON.stringify(document) !== JSON.stringify(saved) ||
    (trimmed !== "" && trimmed !== view.template.name);
  const current = view.sections.find((one) => one.id === section) ?? view.sections[0];
  const blocker = useApproval(view, dirty);
  const onFiles = useCallback(
    () =>
      setStatus({
        tone: "info",
        text: "Files are added to each video on Create: the template keeps only that the video provides them.",
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
  // Who makes the article and the images once this computer's defaults stand in for a choice
  // nobody made; a section still without one shows its pickers where the check's link lands.
  const filled = withProviderDefaults(document, defaults).form;
  const unchosen = { llm: filled.llm.provider === "", images: filled.images.provider === "" };
  const pickerShown =
    (current.id === "script" && unchosen.llm) || (current.id === "pictures" && unchosen.images);
  const scheduled = view.gated || view.schedule.cost !== null;
  const gate = scheduled ? gateLine(view) : undefined;
  const line =
    gate?.line === undefined
      ? undefined
      : blocker === undefined
        ? gate.line
        : `${gate.line} First ${blocker}.`;
  return (
    <TemplateSession document={document} onEdit={edit} onFiles={onFiles}>
      <UnsavedLeaveGuard dirty={dirty} what="your template changes" saveLabel="Save" />
      <PageHeader
        crumb={<TextLink to="/templates">Templates</TextLink>}
        title="Edit template"
        meta={`${view.template.name} · version ${String(view.template.version)}${gate === undefined ? "" : ` · ${gate.word}`}`}
        actions={
          <StudioActions
            view={view}
            dirty={dirty}
            scheduled={scheduled}
            play={play}
            onProblem={(message) =>
              setStatus(message === undefined ? undefined : { tone: "error", text: message })
            }
          />
        }
      />
      {line === undefined ? null : <p className="m-0 -mt-2 mb-3 text-small text-ink-2">{line}</p>}
      <Tabs
        className="mb-4 md:hidden"
        label="Edit template panes"
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
          <div className={cn("flex flex-col gap-5", hidden("sample"))}>
            {current.id === "schedule" ? null : (
              <SamplePanel
                view={view}
                section={current}
                making={making}
                onMake={() => void make()}
                aliasesOn={document.form.audio.useNarrationAliases === true}
                onAliasesOn={() =>
                  edit({
                    ...document,
                    form: {
                      ...document.form,
                      audio: { ...document.form.audio, useNarrationAliases: true },
                    },
                  })
                }
              />
            )}
            <PackSamples templateId={view.template.id} />
            <ChecksList templateId={view.template.id} />
          </div>
        }
      >
        <section
          aria-label={`${current.label} settings`}
          className={cn("flex min-w-0 flex-col gap-4", hidden("settings"))}
        >
          <SectionHead title={current.label} as="h2" className="pb-0" />
          {current.id === "schedule" ? (
            <ScheduleSection view={view} />
          ) : unfolded.includes(current.id) ? (
            <FineTune section={current.id} onFiles={onFiles} />
          ) : (
            <>
              <VisibleControls
                section={current.id}
                document={document}
                name={name}
                providers={providers.data?.providers ?? []}
                unchosen={unchosen}
                onEdit={edit}
                onName={setName}
              />
              {pickerShown ? null : (
                <MadeWith
                  templateId={view.template.id}
                  section={current.id}
                  document={document}
                  onChange={() => setFineTune((n) => n + 1)}
                />
              )}
            </>
          )}
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
          {leadOnly.includes(current.id) ||
          unfolded.includes(current.id) ? null : followed.includes(current.id) ? (
            <FineTune section={current.id} onFiles={onFiles} />
          ) : (
            <AllSettings
              key={`${current.id}:${String(fineTune)}`}
              label={current.label}
              more={rest.includes(current.id)}
              open={fineTune > 0}
            >
              <FineTune section={current.id} onFiles={onFiles} />
            </AllSettings>
          )}
          <PromptAnatomy view={view} section={current.id} />
        </section>
      </Workspace>
      <SaveBar view={view} document={document} name={name} dirty={dirty} note={status} />
    </TemplateSession>
  );
}

// What a person meets as a setting of its own: the help walk's controls (help/coverage.ts),
// without a player's buttons, a file input or a group that is only layout.
const settingSelector = [
  "input:not([type=hidden]):not([type=file])",
  "select",
  "textarea",
  "[role=switch]",
  "[role=checkbox]",
  "[role=combobox]",
  "[role=radiogroup]",
  "[role=group]",
].join(",");

// A row of choices is one setting: the kit's Segmented (pressed buttons in a group) or a toggle
// group (radios in a radiogroup), never each of its buttons.
function isSetting(control: Element): boolean {
  if (control.closest("[data-slot=player], [data-slot=audio-player]") !== null) return false;
  return (
    control.getAttribute("role") !== "group" ||
    [...control.children].some((child) => child.hasAttribute("aria-pressed"))
  );
}

// How many settings a person meets under `root`, a row of choices counted once.
export function settingCount(root: Element): number {
  return [...root.querySelectorAll(settingSelector)].filter(isSetting).length;
}

function useSettingCount(within: RefObject<HTMLElement | null>): number | undefined {
  const [count, setCount] = useState<number>();
  useLayoutEffect(() => {
    const root = within.current;
    if (root === null) return;
    const next = settingCount(root);
    if (next !== count) setCount(next);
  });
  return count;
}

// "All Video and style settings (99)": a section's whole editor, folded under its few lead
// settings, with how many it holds; "More Images settings (6)" where the editor leaves out
// what the section leads with. A fold with nothing in it (images that are off) isn't drawn.
function AllSettings({
  label,
  more,
  open,
  children,
}: {
  readonly label: string;
  readonly more: boolean;
  readonly open: boolean;
  readonly children: ReactElement;
}): ReactElement {
  const body = useRef<HTMLDivElement>(null);
  const count = useSettingCount(body);
  return (
    <Fold
      defaultOpen={open}
      {...(count === 0 ? { className: "hidden" } : {})}
      summary={`${more ? "More" : "All"} ${label} settings${count === undefined || count === 0 ? "" : ` (${String(count)})`}`}
    >
      <div ref={body} className="flex min-w-0 flex-col gap-4 pt-2 pb-2">
        {children}
      </div>
    </Fold>
  );
}

// The page's shape while it loads: the header row and the three columns.
function StudioSkeleton(): ReactElement {
  return (
    <div role="status" aria-busy="true" aria-label="Loading the template">
      <div className="mb-4 h-8 w-72 rounded-control bg-raised" />
      <div className="sl-workspace sl-workspace--studio">
        <div className="h-96 rounded-control bg-raised" />
        <div className="h-96 rounded-control bg-raised" />
        <div className="h-96 rounded-control bg-raised" />
      </div>
    </div>
  );
}
