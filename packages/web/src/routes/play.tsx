import { render } from "@app/slices/admission/substitute.js";
import { topicKeywords } from "@app/slices/project-templates/one-off.js";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery, defaultChannelId } from "@/channels/api";
import { useCurrentChannel } from "@/channels/current";
import { channelOfTemplate } from "@/channels/members-tabs";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { useCommand } from "@/components/kit/command-palette";
import { Drawer } from "@/components/kit/drawer";
import { Field, Input } from "@/components/kit/field";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { StartFromPicture } from "@/designs/start";
import { PlayLanguage } from "@/language/play-language";
import { usePlayDraft } from "@/lib/form-drafts";
import { modelsKey, modelsQuery, type ProviderModels } from "@/lib/models";
import { shortcuts } from "@/lib/shortcuts";
import { exactTime, startedAt } from "@/lib/utils";
import { admission, fixOf, keywordOrigins } from "@/play/admission";
import { BrandKitControls, ChannelFor, useDraftCast } from "@/play/channel-picker";
import { checkpointTarget } from "@/play/checkpoints";
import { ContentSection } from "@/play/content-section";
import { usePlaySession } from "@/play/draft-context";
import { DraftList } from "@/play/draft-list";
import { focusPlayField, playFieldTarget } from "@/play/field-targets";
import { KeywordBlock } from "@/play/keywords";
import { outputKindOf, publishes, rowShown } from "@/play/output-kind";
import { OutputPicker } from "@/play/output-picker";
import {
  ExtrasSection,
  ImagesSection,
  NarrationSection,
  VideoSection,
} from "@/play/outputs-section";
import { PausesAndChecks } from "@/play/pauses-and-checks";
import { previewImageOf } from "@/play/preview-image";
import { readiness, readinessProblems, type SetupProblem, setupProblems } from "@/play/problems";
import { ReviewSection } from "@/play/review-section";
import { pendingReviewUpload, startLabel } from "@/play/review-state";
import { rowOrigin, useTemplateOrigin } from "@/play/row-origin";
import { SaveTemplateDialog } from "@/play/save-template-dialog";
import type { PlaySection } from "@/play/sections";
import { SeenBefore } from "@/play/seen-before";
import { SetupList, type SetupListRow } from "@/play/setup-list";
import {
  rowLabel,
  rowOf,
  rowSummary,
  rowsOfSection,
  type SetupRowId,
  setupRows,
} from "@/play/setup-rows";
import { MakeButton, StartRail, useNarrow } from "@/play/start-rail";
import { llmUsesOf, type PlayFormState, type Upload, type UploadSlot } from "@/play/state";
import { TemplateField, useStarterPick } from "@/play/template-field";
import { templateLibrary } from "@/play/template-library";
import { MoreVideos, TopicFields } from "@/play/topic-fields";
import { useFirstRunDefaults } from "@/play/use-draft-session";
import { entriesQuery, promptsQuery, providersQuery, settingsQuery, voicesQuery } from "@/queries";
import { fontsKey, listFonts } from "@/subtitles/api";
import { subtitlesFor } from "@/subtitles/config";
import { templatesQuery } from "@/templates/api";
import { useTutorial, useTutorialEvent, useTutorialProgress } from "@/tutorial/context";
import { StylePreview } from "@/video/style-preview";

export function PlayRoute() {
  const navigate = useNavigate();
  return (
    <PlayForm
      onCreated={(projectId) => {
        void navigate({ to: "/projects/$projectId", params: { projectId } });
      }}
    />
  );
}

// Create is one screen, top to bottom: what is being made, what it starts from, what it is
// about (and more topics for more videos), then one row per part of the run, each a plain
// sentence with Change opening its editor in place, one at a time. The Make button, the length
// and the estimate sit in the right rail, with the one next thing to do under the button.
export function PlayForm({ onCreated }: { readonly onCreated: (projectId: string) => void }) {
  const { api } = useApp();
  const tutorial = useTutorial();
  const tutorialEvent = useTutorialEvent();
  const cache = useQueryClient();

  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const voices = useQuery(voicesQuery(api));
  const settings = useQuery(settingsQuery(api));
  const channels = useQuery(channelsQuery(api));
  const templates = useQuery(templatesQuery(api));
  const fonts = useQuery({ queryKey: fontsKey, queryFn: () => listFonts(api), staleTime: 60_000 });

  const [form, setForm] = usePlayDraft();
  // The picked services' model lists, so a row names a model as its service does ("Sonnet 5.5",
  // not "sonnet"). Read once here; the pickers keep them fresh while a row is open. Each service
  // once, and none before one is picked.
  const pickedServices = [
    ...new Set([form.llm.provider, form.audio.provider, form.images.provider]),
  ].filter((provider) => provider !== "");
  useQueries({
    queries: pickedServices.map((provider) => ({
      ...modelsQuery(api, provider),
      refetchInterval: false as const,
    })),
  });
  const cast = useDraftCast();
  const session = usePlaySession();
  const { document } = session;
  const defaultsSettled = useFirstRunDefaults(session);
  const kind = outputKindOf(form);
  const sidebarChannel = useCurrentChannel().channelId;
  const { adoptChannel } = session;
  // A fresh draft starts in the channel the sidebar shows, not always the default one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: asked again for each new draft.
  useEffect(() => {
    if (sidebarChannel !== null) adoptChannel?.(sidebarChannel);
  }, [sidebarChannel, adoptChannel, session.activeId, document.channelId]);
  const origin = useTemplateOrigin(document.templateSource);
  const choices = templateLibrary(
    document.librarySnapshot,
    prompts.data?.prompts ?? [],
    entries.data?.entries ?? [],
  );
  const batchItems = document.variants.map(({ id, ...item }) => ({ ...item, key: id }));
  const subtitleUploading = session.fontUploading || document.fontUpload !== null;
  // What the server marked when it refused the draft: a template deleted since it was
  // picked, or a rule the browser's copy could not see.
  const refused = session.review.fields;
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  // The typed fields (the topic, the keywords) the person typed in.
  const [typedIn, setTypedIn] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<ReadonlySet<SetupRowId>>(new Set());
  const [adding, setAdding] = useState(false);
  const [variantOpen, setVariantOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  // Set once a run started from this page: it is on its way to the project, so nothing is
  // picked for the next draft from here.
  const leaving = useRef(false);
  const narrow = useNarrow();
  // Whether the open summary drawer covers the rail's Make button: a window too narrow for
  // both side by side. Then the drawer carries the button in its foot, as on a phone.
  const summaryOpen = session.section === "review";
  const [coversKey, setCoversKey] = useState(false);
  useLayoutEffect(() => {
    if (!summaryOpen) return;
    const measure = (): void => {
      const drawer = reviewHeading.current?.closest('[data-slot="drawer"]');
      const key = root.current?.querySelector('[data-tour="play-start"]');
      const panel = drawer?.getBoundingClientRect();
      const button = key?.getBoundingClientRect();
      setCoversKey(
        panel !== undefined &&
          button !== undefined &&
          panel.left < button.right &&
          panel.right > button.left,
      );
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [summaryOpen]);
  // Whether the Make button was pressed for this draft: only then does what the server refused
  // about the topic turn the topic field red.
  const [pressed, setPressed] = useState(false);
  const start = (): void => {
    setPressed(true);
    void session.startRun();
  };
  const touchedDraft = useRef(session.activeId);
  useLayoutEffect(() => {
    if (touchedDraft.current !== session.activeId) {
      touchedDraft.current = session.activeId;
      setTouched(new Set());
      setTypedIn(new Set());
      setVariantOpen(null);
      setPressed(false);
    }
  }, [session.activeId]);

  const update = (patch: Partial<PlayFormState>): void => {
    setForm((current) => {
      const next = { ...current, ...patch };
      return { ...next, subtitles: subtitlesFor(next.subtitles, next.sources) };
    });
    // A refusal stands until the form changes; the next press asks the server again.
    session.invalidateReview(true);
  };

  // This run's own silence gap when one was typed, else the one Settings has; text that is not
  // a number reaches the rule as NaN, which it refuses in place.
  const settingsGap = settings.data?.silenceGapSeconds ?? 3;
  const typedGap = document.form.silenceGapSeconds?.trim() ?? "";
  const input = {
    form,
    prompts: choices.prompts,
    entries: choices.entries,
    silenceGapSeconds: typedGap === "" ? settingsGap : Number(typedGap),
  };
  const { fields, result, blocker: admissionBlocker } = admission(input);
  const origins = keywordOrigins(input);
  const topics = topicKeywords(form.title).filter((name) =>
    fields.some((field) => field.name === name),
  );

  const blocker = subtitleUploading
    ? { field: "subtitles.fontUpload", hint: "Wait for the caption font to finish uploading first" }
    : admissionBlocker;

  useEffect(() => {
    if (!session.review.created) return;
    const created = session.takeCreated();
    const id = created?.projectIds[0];
    if (!id) return;
    leaving.current = true;
    tutorialEvent({ type: "project-created", id });
    onCreated(id);
  }, [session.review.created, session.takeCreated, tutorialEvent, onCreated]);

  // Completion follows the same field rules as the Make button, with selected prompts checked
  // against the loaded library and pending uploads kept incomplete.
  const errors = result.ok ? refused : [...result.fields, ...refused];
  const clear = (...prefixes: readonly string[]): boolean =>
    !errors.some((error) =>
      prefixes.some((prefix) => error.field === prefix || error.field.startsWith(`${prefix}.`)),
    );
  const promptExists = (kind: "article" | "image", name: string): boolean =>
    choices.prompts.some((prompt) => prompt.kind === kind && prompt.name === name);
  const uploadReady = (upload: Upload | undefined): boolean =>
    upload?.file !== undefined && upload.error === undefined;
  useTutorialProgress({
    playArticleReady:
      clear("sources.article", "articlePrompt", "provided.article") &&
      (form.sources.article === "provide" || promptExists("article", form.articlePrompt)),
    playAudioReady:
      form.sources.audio === "off" ||
      (clear("sources.audio", "audio", "provided.audio") &&
        (form.sources.audio !== "provide" || uploadReady(form.provided.audio))),
    playImagesReady:
      form.sources.images === "off" ||
      (clear("sources.images", "images", "imagePrompts", "provided.images") &&
        (form.sources.images === "provide"
          ? form.provided.images.every(uploadReady)
          : form.imagePrompts.every((prompt) => promptExists("image", prompt.name)))),
    playVideoReady: clear("sources.video"),
    playSubtitlesReady: clear("subtitles") && !subtitleUploading,
    playOptionsReady: clear("title", "format", "llm", "intro", "outro"),
    playHasKeywords: fields.length > 0,
    playKeywordsReady: clear("values"),
    playReady: blocker === undefined && !session.review.starting,
  });

  // The row the text model sits in: the section of the first thing that needs it.
  const llmRow = llmUsesOf(form, choices.entries, choices.prompts)[0]?.section ?? "article";
  // Pauses and checks open in their row like every other part of the run, never the drawer.
  const target = (field: string): { readonly section: PlaySection; readonly field: string } => {
    const checkpoint = checkpointTarget(field, form);
    if (checkpoint !== undefined) return { section: "content", field: checkpoint.field };
    return playFieldTarget(field, form, batchItems, choices.entries, choices.prompts);
  };
  // A field says what is wrong with it once it has been touched, or once the server refused
  // it. What is typed (the topic, the keywords) turns red only once the person typed in it and
  // left it, or pressed the Make button: going in and out of an empty box is not a mistake.
  // The topic and the services say it in the words of their row and the hint ("Type what the
  // video is about"), not the rule's.
  const own = result.ok ? [] : result.fields;
  const problem = (field: string): string | undefined => {
    const canonical = target(field).field;
    const found = errors.find((error) => {
      if (target(error.field).field !== canonical) return false;
      const left = touched.has(field) || touched.has(canonical);
      if (error.field === "title" || error.field.startsWith("values."))
        return (
          (left && (typedIn.has(field) || typedIn.has(canonical))) ||
          (refused.includes(error) && pressed)
        );
      return left || refused.includes(error);
    });
    if (found === undefined) return undefined;
    const server = refused.includes(found) && !own.some((other) => other.field === found.field);
    const formWords =
      found.field === "title" ||
      found.field.startsWith("values.") ||
      ["llm", "audio", "images"].includes(found.field);
    return server || !formWords ? found.message : (fixOf(form, found) ?? found.message);
  };
  const revealField = (field: string): void => {
    const found = target(field);
    setTouched((current) => new Set([...current, field, found.field]));
    // Another video's keywords open in their own side panel, over the form rather than the
    // summary.
    void session.navigate(
      found.field.startsWith("items.") ? "content" : found.section,
      found.field,
    );
  };

  const loaded =
    defaultsSettled &&
    [providers, prompts, entries, voices, settings].every(
      (query) => query.isSuccess || query.isError,
    );
  const paused = tutorial?.active === true || leaving.current;
  const starter = useStarterPick(paused);
  const starterComing = starter.coming;
  // Until the lists and the found services are in, and while the starter template is on its
  // way, nothing is said to be missing: no row turns red over what is about to be filled in,
  // and the hint under the button says it is checking.
  const settling = !loaded || starterComing;

  // Everything that stops the Make button, once: the rows, the hint under the button and the
  // summary drawer all read this list.
  const providerList = providers.data?.providers ?? [];
  const missing = setupProblems({
    form,
    errors,
    refused,
    topics,
    llmRow,
    blocker,
    readinessFirst: readinessProblems(form, choices.entries, providerList, llmRow),
    providers: providerList,
  });
  const problems = settling ? [] : missing;
  const rowProblem = (row: SetupRowId): SetupProblem | undefined =>
    problems.find((one) => one.row === row);
  const topicField = topics[0] === undefined ? "title" : `values.${topics[0]}`;
  const onFix = (fix: SetupProblem): void => {
    revealField(fix.field);
  };
  const isTopic = (field: string): boolean =>
    (field === "title" && topics.length === 0) ||
    topics.some((topic) => field === `values.${topic}`);

  // A part of the run that has nothing to set for this video is not a row at all: the
  // keywords when no prompt asks for one, the channel with only one channel.
  const channelCount = channels.data?.length ?? 0;
  const keywordsToSet =
    fields.length > topics.length ||
    (topics.length > 0 && !/^\s*\{\{[^{}]+\}\}\s*$/.test(form.title));
  const visibleRows = setupRows.filter((row) => {
    const flagged = rowProblem(row.id) !== undefined;
    if (row.id === "title" && !keywordsToSet) return flagged;
    if (row.id === "channel" && channelCount < 2) return flagged;
    // With Article Off nothing is narrated, so the Narration row leaves Create.
    if (row.id === "narration" && form.sources.article === "off") return flagged;
    return rowShown(row.id, kind, { problem: flagged, open: open.has(row.id) });
  });

  // The first row that needs something opens when a draft is opened; the rest stay folded
  // until Change. Decided once per draft, after the lists the rules read and the first-run
  // defaults have arrived (and not for a fresh draft the starter template is about to
  // replace), so a row never folds away while it is being fixed.
  // Brings a row's line into view when it is off screen, and leaves the page alone when not.
  const showRow = (row: SetupRowId): void => {
    requestAnimationFrame(() => {
      root.current
        ?.querySelector(`[data-setup-row="${row}"] [data-row-head]`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };
  const firstProblemRow = useRef<() => SetupRowId | undefined>(() => undefined);
  firstProblemRow.current = () => visibleRows.find((row) => rowProblem(row.id) !== undefined)?.id;
  // A fresh draft saved for the first time gets its id without being another draft, so only a
  // new operation (open, new draft, discard) or a different id decides again.
  const openedFor = useRef<{ readonly generation: number; readonly id: string | null } | null>(
    null,
  );
  const generation = session.generation();
  // Which draft the person (or a reveal) already opened a row in: the arrival choice leaves
  // that alone, however late the lists it waits for arrive.
  const rowsChosen = useRef<{ readonly generation: number; readonly id: string | null } | null>(
    null,
  );
  const chooseRows = (): void => {
    rowsChosen.current = { generation: session.generation(), id: session.activeId };
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: decided once per opened draft.
  useEffect(() => {
    if (!loaded || starterComing) return;
    const before = openedFor.current;
    openedFor.current = { generation, id: session.activeId };
    if (
      before !== null &&
      before.generation === generation &&
      (before.id === session.activeId || before.id === null)
    )
      return;
    // The guided tour opens the rows it points into itself.
    if (tutorial?.active === true) return;
    // A frame later, so what this draft's opening filled in by itself (the first-run defaults)
    // is already counted.
    requestAnimationFrame(() => {
      const chosen = rowsChosen.current;
      if (
        chosen !== null &&
        chosen.generation === generation &&
        (chosen.id === session.activeId || chosen.id === null)
      )
        return;
      const first = firstProblemRow.current();
      setOpen(new Set(first === undefined ? [] : [first]));
      if (first !== undefined) showRow(first);
    });
  }, [loaded, starterComing, session.activeId, generation]);
  // A reveal (the hint under the button, the summary's links, Prompts → Make a video) opens
  // the one row that holds the field, closing the others, then focuses it. A section without a
  // field (the guided tour) opens that section's rows.
  const focusSequence = useRef<number | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs for each reveal, and again once what holds the field is open.
  useLayoutEffect(() => {
    const reveal = session.reveal;
    if (!reveal) focusSequence.current = null;
    if (!reveal || reveal.sequence === focusSequence.current || !root.current) return;
    const field = reveal.field;
    const variant = field ? /^items\.([^.]+)(\.|$)/.exec(field)?.[1] : undefined;
    if (reveal.section === "review") {
      focusSequence.current = reveal.sequence;
      if (field && focusPlayField(root.current, field)) return;
      reviewHeading.current?.focus();
      return;
    }
    if (variant !== undefined && document.variants.some((one) => one.id === variant)) {
      if (variantOpen !== variant) {
        setVariantOpen(variant);
        return;
      }
    } else if (!(field && isTopic(field))) {
      const owner = field ? rowOf(field, llmRow) : undefined;
      const rows = owner === undefined ? rowsOfSection(reveal.section) : [owner];
      if (rows.some((row) => !open.has(row))) {
        chooseRows();
        setOpen(owner === undefined ? new Set([...open, ...rows]) : new Set<SetupRowId>([owner]));
        return;
      }
    }
    focusSequence.current = reveal.sequence;
    if (field && focusPlayField(root.current, field)) return;
    heading.current?.focus();
  }, [session.reveal, open, variantOpen]);

  const openSummary = (): void => {
    void session.navigate("review");
  };

  const onPickFiles = (kind: UploadSlot, files: readonly File[]): void => {
    session.invalidateReview(true);
    void session.attach(kind, files);
  };
  const onRemoveFile = (kind: UploadSlot, key: string): void => {
    setForm((current) => ({
      ...current,
      provided:
        kind === "images"
          ? {
              ...current.provided,
              images: current.provided.images.filter((image) => image.key !== key),
            }
          : { ...current.provided, [kind]: undefined },
    }));
  };

  // Nothing on this screen can be picked from a list that failed to arrive, so the failure
  // is said once, in the rail beside a save failure's.
  const loadError = [providers, prompts, entries, voices, settings].find(
    (query) => query.error !== null,
  )?.error?.message;
  const saveProblem = session.error ? `Your draft wasn't saved. ${session.error}` : loadError;

  const controls = {
    form,
    providers: providerList,
    prompts: choices.prompts,
    voices: voices.data?.voices ?? [],
    silenceGapSeconds: settings.data?.silenceGapSeconds ?? 3,
    problem,
    update,
    onPickFiles,
    onRemoveFile,
    onReattachFile: (kind: UploadSlot, key: string, file: File) => {
      void session.attach(kind, [file], key);
    },
  };

  const template = templates.data?.find((one) => one.id === document.templateSource?.id);
  const channelId =
    document.channelId ?? (template === undefined ? defaultChannelId : channelOfTemplate(template));
  const reviews = Object.values(document.form.reviews?.stages ?? {}).filter(
    (stage) => stage.mode !== "off",
  ).length;
  const summaryContext = {
    providers: providerList,
    voices: voices.data?.voices ?? [],
    keywords: fields.map((field) => field.name),
    topics,
    channel: channels.data?.find((one) => one.id === channelId)?.name,
    brandKit: document.form.useBrandKit !== false,
    fontName: fonts.data?.fonts.find((font) => font.id === form.subtitles.fontId)?.name,
    reviews,
    kind,
    modelName: (provider: string, model: string) =>
      cache
        .getQueryData<ProviderModels>(modelsKey(provider))
        ?.models.find((one) => one.id === model)?.name,
  };
  const editors: Readonly<Record<SetupRowId, SetupListRow["editor"]>> = {
    title: (
      <div className="flex min-w-0 flex-col gap-4 py-2">
        {topics.length ? (
          <Field label="Title pattern" tip="play.title-pattern" error={problem("title")}>
            <Input
              data-play-field="title"
              value={form.title}
              maxLength={200}
              aria-invalid={problem("title") !== undefined}
              onChange={(event) => update({ title: event.target.value })}
            />
          </Field>
        ) : null}
        <KeywordBlock
          fields={fields}
          origins={origins}
          topics={topics}
          hide={topics}
          values={form.values}
          problem={problem}
          onChange={(name, value) => update({ values: { ...form.values, [name]: value } })}
        />
      </div>
    ),
    article: (
      <div className="flex min-w-0 flex-col gap-4">
        <ContentSection {...controls} entries={choices.entries} />
        {form.sources.article === "off" ? null : <PlayLanguage />}
      </div>
    ),
    narration: <NarrationSection {...controls} entries={choices.entries} onKeyword={revealField} />,
    images: <ImagesSection {...controls} />,
    video: <VideoSection {...controls} problemOf={problem} />,
    outputs: <ExtrasSection {...controls} publishing={publishes(kind)} entries={choices.entries} />,
    reviews: <PausesAndChecks problem={problem} />,
    channel: <BrandKitControls />,
  };
  // A template's own channel is where it is listed, not a field of its setup: a draft made from
  // it starts in that channel, which is the template's, not a change made here.
  const templateSetup =
    origin === undefined
      ? undefined
      : {
          ...origin,
          channelId:
            origin.channelId ?? (template === undefined ? undefined : channelOfTemplate(template)),
        };
  // A service the template picked that can't be used here, which Create may have replaced.
  const unusable = (service: string): boolean => {
    const found = providerList.find((one) => one.id === service);
    return found !== undefined && !readiness(found).ok;
  };
  const rows: readonly SetupListRow[] = visibleRows.map((row) => ({
    id: row.id,
    label: rowLabel(row.id, kind),
    summary: rowSummary(row.id, form, summaryContext),
    problem: rowProblem(row.id)?.text,
    origin:
      templateSetup === undefined
        ? undefined
        : rowOrigin(row.id, document, templateSetup, unusable) === "template"
          ? `From ${template?.name ?? "the template"}`
          : "Changed here",
    editor: editors[row.id],
  }));
  // One row open at a time: opening a row folds the others, and it comes into view.
  const setRow = (row: SetupRowId, next: boolean): void => {
    chooseRows();
    setOpen((current) => {
      if (next) return new Set<SetupRowId>([row]);
      const changed = new Set(current);
      changed.delete(row);
      return changed;
    });
    if (next) showRow(row);
  };

  // Every Create action in the command palette (Ctrl+K).
  const pageVideoCount = document.variants.length + 1;
  const pendingUpload = pendingReviewUpload(document, session.view);
  const canStart =
    !session.review.starting &&
    (session.review.uncertain ||
      (session.review.valid && !session.review.pending && problems.length === 0 && !pendingUpload));
  useCommand({
    id: "play.start",
    title: startLabel(session.review, document),
    group: "Create",
    context: titleShown(form.title, form.values),
    keywords: ["start", "queue", "run", "make", "go"],
    run: () => {
      if (canStart) start();
      else if (problems[0]) onFix(problems[0]);
    },
  });
  useCommand({
    id: "play.add-topic",
    title: "Add another topic",
    group: "Create",
    context: `${String(pageVideoCount)} video${pageVideoCount === 1 ? "" : "s"}`,
    keywords: ["more videos", "variation", "batch", "queue"],
    run: () => setAdding(true),
  });
  useCommand({
    id: "play.save-template",
    title: "Save as template",
    group: "Create",
    keywords: ["template", "setup", "reuse"],
    run: () => setSaving(true),
  });
  useCommand({
    id: "play.review",
    title: "See everything this run will do",
    group: "Create",
    keywords: ["summary", "review", "prompt", "check"],
    // Bound by the palette's provider, from a field too: the label and the key are one.
    shortcut: shortcuts.reviewSetup,
    run: openSummary,
  });
  useCommand({
    id: "play.template",
    title: "Pick what to start from",
    group: "Create",
    keywords: ["template", "setup", "starter"],
    run: () => {
      if (root.current) focusPlayField(root.current, "template");
    },
  });
  const previewOn = form.sources.video === "generate" && form.sources.images !== "off";
  const drawn = previewImageOf(form, cast);
  const captionMode = form.sources.audio === "off" ? "off" : form.subtitles.mode;
  const fontName = summaryContext.fontName ?? "Barlow";
  const preview = previewOn ? (
    <StylePreview
      // The dialog it opens in carries the title, "Preview with your captions and look".
      titled={false}
      drawnOn={drawn?.drawnOn}
      settings={{
        format: form.format,
        subtitles: {
          mode: captionMode,
          fontId: form.subtitles.fontId,
          fontSize: Number(document.form.subtitles.fontSize) || form.subtitles.fontSize,
          position: form.subtitles.position,
        },
        videoEdit: form.videoEdit,
        previewText: document.previewText,
        image: drawn?.image,
      }}
    />
  ) : undefined;
  const previewLine =
    captionMode === "burn-in"
      ? `Captions: ${fontName} ${String(form.subtitles.fontSize)}, ${form.subtitles.position.replace(/-/g, " ")}`
      : captionMode === "files"
        ? "Captions: caption files only"
        : "Captions: none";

  return (
    <div
      ref={root}
      onBlurCapture={(event) => {
        const field = (event.target as HTMLElement).dataset.playField;
        if (field) setTouched((current) => new Set([...current, field]));
      }}
      // Only the typed boxes: a select's input event comes before its change, and drawing the
      // page between them would put its old value back.
      onInputCapture={(event) => {
        const field = (event.target as HTMLElement).dataset.playField;
        if (
          field !== undefined &&
          (field === "title" || field.startsWith("values.")) &&
          !typedIn.has(field)
        )
          setTypedIn((current) => new Set([...current, field]));
      }}
      data-play-grid="true"
      className="min-w-0 max-[767px]:[&_button]:min-h-11 max-[767px]:[&_input:not([type=checkbox])]:min-h-11 max-[767px]:[&_select]:min-h-11 max-[767px]:[&_summary]:min-h-11"
    >
      <PageHeader
        title={
          <span ref={heading} tabIndex={-1}>
            Create
          </span>
        }
        meta={
          session.restored === undefined ? undefined : (
            // Create reopened the draft this browser had open last: said, with the way out.
            <span className="inline-flex flex-wrap items-center gap-x-2">
              <span>
                Your draft from{" "}
                <time
                  dateTime={session.restored.updatedAt}
                  title={exactTime(session.restored.updatedAt)}
                >
                  {startedAt(session.restored.updatedAt)}
                </time>
              </span>
              <span aria-hidden="true">·</span>
              <Button variant="quiet" size="small" onClick={() => void session.newDraft()}>
                New draft
              </Button>
            </span>
          )
        }
        actions={
          <>
            <Button variant="quiet" onClick={() => setSaving(true)}>
              Save as template
            </Button>
            <DraftList />
          </>
        }
      />
      <Workspace
        className="sl-workspace--play"
        aside={
          <StartRail
            problems={problems}
            saveProblem={saveProblem}
            onStart={start}
            onFix={onFix}
            onWholeSetup={openSummary}
            preview={preview}
            previewLine={previewLine}
          />
        }
        asideLabel="Length, cost and the Make button"
      >
        <OutputPicker
          form={form}
          update={update}
          // Choosing what to make folds away the open rows that work doesn't use; changing a
          // stage inside a row never folds the row being edited.
          onPicked={(picked) =>
            setOpen(
              (current) =>
                new Set(
                  [...current].filter((row) =>
                    rowShown(row, picked, { problem: false, open: false }),
                  ),
                ),
            )
          }
        />
        <div data-tour="play-options" className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
            <TemplateField
              fresh={starter.fresh}
              onTried={starter.onTried}
              onError={setTemplateError}
            />
            <ChannelFor />
          </div>
          <TopicFields topics={topics} problem={problem} />
          <MoreVideos
            topics={topics}
            keywordNames={fields.map((field) => field.name)}
            origins={origins}
            problem={problem}
            adding={adding}
            onAdding={setAdding}
            open={variantOpen}
            onOpen={setVariantOpen}
          />
        </div>
        <SeenBefore topics={topics} />
        {templateError ? <Callout tone="danger" title={templateError} /> : null}
        <SetupList rows={rows} open={open} onChange={setRow} busy={settling} />
        <StartFromPicture />
      </Workspace>
      <Drawer
        open={summaryOpen}
        title="Everything this run will do"
        headingRef={reviewHeading}
        // Beside the rail where there is room, so the Make button and the estimate stay in
        // view (styles/shell.css places it); where it covers the button (narrow windows), with
        // the button in its foot.
        className="min-[900px]:right-[var(--play-drawer-right)]"
        // Closing it goes back to the form as it was: no row opens.
        onClose={() => {
          void session.navigate("content" satisfies PlaySection, undefined, { reveal: false });
        }}
        {...(narrow || coversKey
          ? { footer: <MakeButton problems={problems} onStart={start} onFix={onFix} /> }
          : {})}
      >
        <ReviewSection
          fields={fields}
          topicField={topicField}
          problems={problems}
          onFix={onFix}
          onReveal={revealField}
        />
      </Drawer>
      <SaveTemplateDialog open={saving} onClose={() => setSaving(false)} />
      {visibleRows.map((row) => (
        <RowCommand key={row.id} id={row.id} label={rowLabel(row.id, kind)} onOpen={setRow} />
      ))}
    </div>
  );
}

// "Change narration" and the rest in the command palette, one per setup row.
function RowCommand({
  id,
  label,
  onOpen,
}: {
  readonly id: SetupRowId;
  readonly label: string;
  readonly onOpen: (row: SetupRowId, open: boolean) => void;
}): null {
  useCommand({
    id: `play.row.${id}`,
    title: `Change ${label.toLowerCase()}`,
    group: "Create",
    keywords: ["open", "edit", "section", label],
    run: () => onOpen(id, true),
  });
  return null;
}

// The title as the run will have it, for the command palette: the keywords filled in, or
// "Untitled" while one is still empty.
function titleShown(title: string, values: Readonly<Record<string, string>>): string {
  const filled = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()));
  const shown = render(title, filled).trim();
  return shown === "" || /\{\{[^{}]*\}\}/.test(shown) ? "Untitled" : shown;
}
