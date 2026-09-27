import { topicKeywords } from "@app/slices/project-templates/one-off.js";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery, defaultChannelId } from "@/channels/api";
import { channelOfTemplate } from "@/channels/members-tabs";
import { Callout } from "@/components/kit/callout";
import { useCommand } from "@/components/kit/command-palette";
import { Drawer } from "@/components/kit/drawer";
import { Field, Input } from "@/components/kit/field";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { Welcome } from "@/components/welcome";
import { PlayLanguage } from "@/language/play-language";
import { usePlayDraft } from "@/lib/form-drafts";
import { admission, keywordOrigins } from "@/play/admission";
import { ChannelPicker, useDraftCast } from "@/play/channel-picker";
import { checkpointTarget } from "@/play/checkpoints";
import { ContentSection } from "@/play/content-section";
import { usePlaySession } from "@/play/draft-context";
import { DraftList } from "@/play/draft-list";
import { focusPlayField, playFieldTarget } from "@/play/field-targets";
import { KeywordBlock } from "@/play/keywords";
import {
  ExtrasSection,
  ImagesSection,
  NarrationSection,
  VideoSection,
} from "@/play/outputs-section";
import { previewImageOf } from "@/play/preview-image";
import { ReviewSection } from "@/play/review-section";
import { pendingReviewUpload, startLabel } from "@/play/review-state";
import { lookSummary } from "@/play/review-summary";
import { SaveTemplateDialog } from "@/play/save-template-dialog";
import type { PlaySection } from "@/play/sections";
import { SetupList, type SetupListRow } from "@/play/setup-list";
import {
  rowOf,
  rowProblem,
  rowSummary,
  rowsOfSection,
  type SetupRowId,
  setupRows,
} from "@/play/setup-rows";
import { StartRail } from "@/play/start-rail";
import type { PlayFormState, Upload, UploadSlot } from "@/play/state";
import { templateLibrary } from "@/play/template-library";
import { MoreVideos, TemplateField, TopicFields } from "@/play/topic-fields";
import { entriesQuery, promptsQuery, providersQuery, settingsQuery, voicesQuery } from "@/queries";
import { fontsKey, listFonts } from "@/subtitles/api";
import { subtitlesFor } from "@/subtitles/config";
import { templatesQuery } from "@/templates/api";
import { useTutorialEvent, useTutorialProgress } from "@/tutorial/context";
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

// Play is one path from topic to queue: pick a template, type the topic (and more topics for
// more videos), press the Play key. Everything else is folded into summary rows, each opening
// its editor in place; the review, the estimate and the key sit in the right rail.
export function PlayForm({ onCreated }: { readonly onCreated: (projectId: string) => void }) {
  const { api } = useApp();
  const tutorialEvent = useTutorialEvent();

  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const voices = useQuery(voicesQuery(api));
  const settings = useQuery(settingsQuery(api));
  const channels = useQuery(channelsQuery(api));
  const templates = useQuery(templatesQuery(api));
  const fonts = useQuery({ queryKey: fontsKey, queryFn: () => listFonts(api), staleTime: 60_000 });

  const [form, setForm] = usePlayDraft();
  const cast = useDraftCast();
  const session = usePlaySession();
  const { document } = session;
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
  const [open, setOpen] = useState<ReadonlySet<SetupRowId>>(new Set());
  const [adding, setAdding] = useState(false);
  const [variantOpen, setVariantOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const routerNavigate = useNavigate();
  const touchedDraft = useRef(session.activeId);
  useLayoutEffect(() => {
    if (touchedDraft.current !== session.activeId) {
      touchedDraft.current = session.activeId;
      setTouched(new Set());
      setVariantOpen(null);
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
    ? { field: "subtitles.fontUpload", hint: "Wait for the subtitle font upload to finish to play" }
    : admissionBlocker;

  useEffect(() => {
    if (!session.review.created) return;
    const created = session.takeCreated();
    const id = created?.projectIds[0];
    if (!id) return;
    tutorialEvent({ type: "project-created", id });
    onCreated(id);
  }, [session.review.created, session.takeCreated, tutorialEvent, onCreated]);

  // Completion follows the same field rules as PLAY, with selected prompts checked
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

  const target = (field: string) =>
    checkpointTarget(field, form) ?? playFieldTarget(field, form, batchItems);
  const problem = (field: string): string | undefined => {
    const canonical = target(field).field;
    return errors.find(
      (error) =>
        target(error.field).field === canonical &&
        (refused.includes(error) || touched.has(field) || touched.has(canonical)),
    )?.message;
  };
  const revealField = (field: string): void => {
    const found = target(field);
    setTouched((current) => new Set([...current, field, found.field]));
    // Another video's keywords open in their own side panel, over the form rather than Review.
    void session.navigate(
      found.field.startsWith("items.") ? "content" : found.section,
      found.field,
    );
  };

  // Rows that need attention when a draft is opened start open; the rest stay folded until
  // Change. Decided once per draft, after the lists the rules read have arrived, so a row
  // never folds away while it is being fixed.
  const loaded = [providers, prompts, entries, voices, settings].every(
    (query) => query.isSuccess || query.isError,
  );
  // A fresh draft saved for the first time gets its id without being another draft, so only a
  // new operation (open, new draft, discard) or a different id decides again.
  const openedFor = useRef<{ readonly generation: number; readonly id: string | null } | null>(
    null,
  );
  const generation = session.generation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: decided once per opened draft.
  useEffect(() => {
    if (!loaded) return;
    const before = openedFor.current;
    openedFor.current = { generation, id: session.activeId };
    if (
      before !== null &&
      before.generation === generation &&
      (before.id === session.activeId || before.id === null)
    )
      return;
    setOpen(
      new Set(
        setupRows
          .map((row) => row.id)
          .filter((row) => row !== "reviews" && rowProblem(row, errors, topics) !== undefined),
      ),
    );
  }, [loaded, session.activeId, generation]);

  // A reveal (a refusal, the reason under the key, Library → Use in Play) opens what holds the
  // field, then focuses it.
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
    } else if (!(field && topics.some((topic) => field === `values.${topic}`))) {
      const owner = field ? rowOf(field) : undefined;
      const rows = owner === undefined ? rowsOfSection(reveal.section) : [owner];
      const closed = rows.filter((row) => !open.has(row));
      if (!(field === "title" && topics.length === 0) && closed.length > 0) {
        setOpen((current) => new Set([...current, ...closed]));
        return;
      }
    }
    focusSequence.current = reveal.sequence;
    if (field && focusPlayField(root.current, field)) return;
    heading.current?.focus();
  }, [session.reveal, open, variantOpen]);

  const library = async (to: "/prompts" | "/settings"): Promise<void> => {
    if (!(await session.flush())) return;
    if (to === "/prompts")
      await routerNavigate({ to: "/prompts/new", search: { kind: "article" } });
    else await routerNavigate({ to });
  };
  const openReview = (): void => {
    void session.navigate("review");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      openReview();
    }
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
    providers: providers.data?.providers ?? [],
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
    providers: providers.data?.providers ?? [],
    voices: voices.data?.voices ?? [],
    keywords: fields.length,
    topics,
    channel: channels.data?.find((one) => one.id === channelId)?.name,
    brandKit: document.form.useBrandKit !== false,
    look: lookSummary(document.form),
    fontName: fonts.data?.fonts.find((font) => font.id === form.subtitles.fontId)?.name,
    checkpoints: form.checkpoints?.length ?? 0,
    reviews,
  };
  const editors: Readonly<Record<SetupRowId, SetupListRow["editor"]>> = {
    title: (
      <div className="flex min-w-0 flex-col gap-4 py-4">
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
        {fields.length === topics.length ? (
          <p className="m-0 text-small text-ink-2">
            {fields.length === 0
              ? "No keywords. A prompt or the title that names {{a keyword}} adds one here."
              : "The only keywords are the topic, typed at the top."}
          </p>
        ) : null}
      </div>
    ),
    article: (
      <ContentSection
        {...controls}
        entries={choices.entries}
        onLibrary={(to) => {
          void library(to);
        }}
      />
    ),
    narration: (
      <NarrationSection
        {...controls}
        entries={choices.entries}
        onKeyword={revealField}
        onSettings={() => {
          void library("/settings");
        }}
      />
    ),
    images: <ImagesSection {...controls} />,
    video: <VideoSection {...controls} problemOf={problem} />,
    outputs: <ExtrasSection {...controls} />,
    reviews: undefined,
    channel: (
      <div className="flex min-w-0 flex-col gap-4 py-4">
        <ChannelPicker />
        <PlayLanguage />
      </div>
    ),
  };
  const rows: readonly SetupListRow[] = setupRows.map((row) => ({
    id: row.id,
    label: row.label,
    summary: rowSummary(row.id, form, summaryContext),
    problem: rowProblem(row.id, errors, topics)?.message,
    editor: editors[row.id],
  }));
  const setRow = (row: SetupRowId, next: boolean): void => {
    if (row === "reviews") {
      openReview();
      return;
    }
    setOpen((current) => {
      const changed = new Set(current);
      if (next) changed.add(row);
      else changed.delete(row);
      return changed;
    });
  };
  const openRow = (row: SetupRowId): void => {
    setRow(row, true);
    requestAnimationFrame(() => {
      root.current
        ?.querySelector(`[data-setup-row="${row}"]`)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  };

  // Every Play action in the command palette (Ctrl+K).
  const pageVideoCount = document.variants.length + 1;
  const pendingUpload = pendingReviewUpload(document, session.view);
  const canStart =
    !session.review.starting &&
    (session.review.uncertain ||
      (session.review.valid && !session.review.pending && errors.length === 0 && !pendingUpload));
  useCommand({
    id: "play.start",
    title: startLabel(session.review, document),
    group: "Play",
    context: form.title || "New video",
    keywords: ["start", "queue", "run", "play", "go"],
    run: () => {
      if (canStart) void session.startRun();
      else if (blocker) revealField(blocker.field);
      else if (errors[0]) revealField(errors[0].field);
    },
  });
  useCommand({
    id: "play.add-topic",
    title: "Add a topic for another video",
    group: "Play",
    context: `${String(pageVideoCount)} video${pageVideoCount === 1 ? "" : "s"}`,
    keywords: ["more videos", "variation", "batch", "queue"],
    run: () => setAdding(true),
  });
  useCommand({
    id: "play.save-template",
    title: "Save as template",
    group: "Play",
    keywords: ["template", "setup", "reuse"],
    run: () => setSaving(true),
  });
  useCommand({
    id: "play.review",
    title: "Review the whole setup",
    group: "Play",
    keywords: ["summary", "checkpoints", "prompt"],
    shortcut: ["Ctrl", "Enter"],
    run: openReview,
  });
  useCommand({
    id: "play.template",
    title: "Pick a template",
    group: "Play",
    keywords: ["template", "setup"],
    run: () => {
      if (root.current) focusPlayField(root.current, "template");
    },
  });
  const previewOn = form.sources.video === "generate" && form.sources.images !== "off";
  const drawn = previewImageOf(form, cast);
  const preview = previewOn ? (
    <StylePreview
      drawnOn={drawn?.drawnOn}
      settings={{
        format: form.format,
        subtitles: {
          mode: form.sources.audio === "off" ? "off" : form.subtitles.mode,
          fontId: form.subtitles.fontId,
          fontSize: Number(document.form.subtitles.fontSize) || form.subtitles.fontSize,
          position: form.subtitles.position,
        },
        videoEdit: form.videoEdit,
        previewText: document.previewText,
        image: drawn?.image,
      }}
    />
  ) : null;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: form-wide keyboard shortcut opens the whole setup without starting a run.
    <div
      ref={root}
      onKeyDown={onKeyDown}
      onBlurCapture={(event) => {
        const field = (event.target as HTMLElement).dataset.playField;
        if (field) setTouched((current) => new Set([...current, field]));
      }}
      data-play-grid="true"
      className="min-w-0 max-[767px]:[&_button]:min-h-11 max-[767px]:[&_input:not([type=checkbox])]:min-h-11 max-[767px]:[&_select]:min-h-11 max-[767px]:[&_summary]:min-h-11"
    >
      <PageHeader
        crumb="New video"
        title={
          <span ref={heading} tabIndex={-1}>
            What's the video about?
          </span>
        }
        meta={form.title.trim() === "" ? "Untitled draft" : form.title}
        actions={<DraftList />}
      />
      <Welcome onDefaults={session.adoptDefaults} />
      <Workspace
        className="sl-workspace--play"
        aside={
          <StartRail
            errors={errors}
            blocker={blocker}
            saveProblem={saveProblem}
            onReveal={revealField}
            onWholeSetup={openReview}
            onSaveTemplate={() => setSaving(true)}
            preview={preview}
          />
        }
        asideLabel="Review and start"
      >
        <div
          data-tour="play-options"
          className="grid min-w-0 grid-cols-1 items-start gap-4 min-[700px]:grid-cols-2"
        >
          <TemplateField topics={topics} onError={setTemplateError} />
          <TopicFields topics={topics} problem={problem} />
        </div>
        {templateError ? <Callout tone="danger" title={templateError} /> : null}
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
        <SetupList rows={rows} open={open} onChange={setRow} />
      </Workspace>
      <Drawer
        open={session.section === "review"}
        title="Review"
        headingRef={reviewHeading}
        onClose={() => {
          void session.navigate("content" satisfies PlaySection);
        }}
      >
        <ReviewSection fields={fields} errors={errors} problem={problem} onReveal={revealField} />
      </Drawer>
      <SaveTemplateDialog open={saving} onClose={() => setSaving(false)} />
      {setupRows.map((row) => (
        <RowCommand key={row.id} id={row.id} label={row.label} onOpen={openRow} />
      ))}
    </div>
  );
}

// "Change narration" and the rest in the command palette, one per summary row.
function RowCommand({
  id,
  label,
  onOpen,
}: {
  readonly id: SetupRowId;
  readonly label: string;
  readonly onOpen: (row: SetupRowId) => void;
}): null {
  useCommand({
    id: `play.row.${id}`,
    title: `Change ${label.toLowerCase()}`,
    group: "Play",
    keywords: ["open", "edit", "section", label],
    run: () => onOpen(id),
  });
  return null;
}
