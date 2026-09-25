import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UploadKind } from "@/api";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { PageBar } from "@/components/kit/page-bar";
import { Button } from "@/components/ui/button";
import { usePlayDraft } from "@/lib/form-drafts";
import { admission } from "@/play/admission";
import { checkpointTarget } from "@/play/checkpoints";
import { ContentSection } from "@/play/content-section";
import { usePlaySession } from "@/play/draft-context";
import { DraftList } from "@/play/draft-list";
import { focusPlayField, playFieldTarget } from "@/play/field-targets";
import { OutputPreview, useWidePlayLayout } from "@/play/output-preview";
import { OutputsSection } from "@/play/outputs-section";
import { ReadinessRail } from "@/play/readiness-rail";
import { ReviewSection } from "@/play/review-section";
import { SectionNavigation } from "@/play/section-navigation";
import { type PlaySection, playSections } from "@/play/sections";
import type { PlayFormState, Upload } from "@/play/state";
import { StyleSection } from "@/play/style-section";
import { templateLibrary } from "@/play/template-library";
import { entriesQuery, promptsQuery, providersQuery, settingsQuery, voicesQuery } from "@/queries";
import { subtitlesFor } from "@/subtitles/config";
import { useTutorialEvent, useTutorialProgress } from "@/tutorial/context";

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

export function PlayForm({ onCreated }: { readonly onCreated: (projectId: string) => void }) {
  const { api } = useApp();
  const wide = useWidePlayLayout();
  const tutorialEvent = useTutorialEvent();

  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const voices = useQuery(voicesQuery(api));
  const settings = useQuery(settingsQuery(api));

  const [form, setForm] = usePlayDraft();
  const session = usePlaySession();
  const choices = templateLibrary(
    session.document.librarySnapshot,
    prompts.data?.prompts ?? [],
    entries.data?.entries ?? [],
  );
  const batchItems = session.document.variants.map(({ id, ...item }) => ({ ...item, key: id }));
  const subtitleUploading = session.fontUploading || session.document.fontUpload !== null;
  // What the server marked when it refused the draft: a template deleted since it was
  // picked, or a rule the browser's copy could not see.
  const refused = session.review.fields;
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // The editor under the Review drawer: the last tab the user was on.
  const lastEditor = useRef<Exclude<PlaySection, "review">>("content");
  if (session.section !== "review") lastEditor.current = session.section;
  const routerNavigate = useNavigate();
  const touchedDraft = useRef(session.activeId);
  useLayoutEffect(() => {
    if (touchedDraft.current !== session.activeId) {
      touchedDraft.current = session.activeId;
      setTouched(new Set());
    }
  }, [session.activeId]);
  const focusSequence = useRef<number | null>(null);
  useLayoutEffect(() => {
    const reveal = session.reveal;
    if (!reveal) focusSequence.current = null;
    if (
      !reveal ||
      reveal.sequence === focusSequence.current ||
      reveal.section !== session.section ||
      !root.current
    )
      return;
    focusSequence.current = reveal.sequence;
    if (reveal.field) {
      const target = [...root.current.querySelectorAll<HTMLElement>("[data-play-field]")].find(
        (element) => element.dataset.playField === reveal.field,
      );
      let ancestor = target?.parentElement;
      while (ancestor && ancestor !== root.current) {
        if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
        ancestor = ancestor.parentElement;
      }
      if (focusPlayField(root.current, reveal.field)) return;
    }
    heading.current?.focus();
  }, [session.reveal, session.section]);
  const revealField = (field: string): void => {
    const target = checkpointTarget(field, form) ?? playFieldTarget(field, form, batchItems);
    setTouched((current) => new Set([...current, field, target.field]));
    void session.navigate(target.section, target.field);
  };
  const library = async (to: "/prompts" | "/settings"): Promise<void> => {
    if (!(await session.flush())) return;
    if (to === "/prompts")
      await routerNavigate({ to: "/prompts/new", search: { kind: "article" } });
    else await routerNavigate({ to });
  };

  const update = (patch: Partial<PlayFormState>): void => {
    setForm((current) => {
      const next = { ...current, ...patch };
      return { ...next, subtitles: subtitlesFor(next.subtitles, next.sources) };
    });
    // A refusal stands until the form changes; the next press asks the server again.
    session.invalidateReview(true);
  };

  const {
    fields,
    result,
    blocker: admissionBlocker,
  } = admission({
    form,
    prompts: choices.prompts,
    entries: choices.entries,
    silenceGapSeconds: settings.data?.silenceGapSeconds ?? 3,
  });

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

  const problem = (field: string): string | undefined => {
    const canonical = (checkpointTarget(field, form) ?? playFieldTarget(field, form, batchItems))
      .field;
    return errors.find(
      (error) =>
        (checkpointTarget(error.field, form) ?? playFieldTarget(error.field, form, batchItems))
          .field === canonical &&
        (refused.includes(error) || touched.has(field) || touched.has(canonical)),
    )?.message;
  };
  const submit = (): void => {
    void session.navigate("review");
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const onPickFiles = (kind: UploadKind, files: readonly File[]): void => {
    session.invalidateReview(true);
    void session.attach(kind, files);
  };

  const onRemoveFile = (kind: UploadKind, key: string): void => {
    setForm((current) => ({
      ...current,
      provided:
        kind === "images"
          ? {
              ...current.provided,
              images: current.provided.images.filter((image) => image.key !== key),
            }
          : kind === "audio"
            ? { ...current.provided, audio: undefined }
            : { ...current.provided, thumbnail: undefined },
    }));
  };

  // Nothing on this screen can be picked from a list that failed to arrive, so the
  // failure is said once above the rails rather than eight times inside them.
  const loadError = [providers, prompts, entries, voices, settings].find(
    (query) => query.error !== null,
  )?.error?.message;

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
    onReattachFile: (kind: UploadKind, key: string, file: File) => {
      void session.attach(kind, [file], key);
    },
  };
  const editorSection: Exclude<PlaySection, "review"> =
    session.section === "review" ? lastEditor.current : session.section;
  const next = playSections[playSections.findIndex((item) => item.id === editorSection) + 1];
  // Nothing here can be picked from a list that failed to arrive, so that failure is said
  // once, in the action bar's reserved line, beside a save failure's.
  const saveProblem = session.error ? `Your draft wasn't saved. ${session.error}` : loadError;
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: form-wide keyboard shortcut opens Review without starting a run.
    <div
      ref={root}
      onKeyDown={onKeyDown}
      onBlurCapture={(event) => {
        const field = (event.target as HTMLElement).dataset.playField;
        if (field) setTouched((current) => new Set([...current, field]));
      }}
      data-play-grid="true"
      className="min-w-0 max-[1099px]:[&_button]:min-h-11 max-[1099px]:[&_input:not([type=checkbox])]:min-h-11 max-[1099px]:[&_select]:min-h-11 max-[1099px]:[&_summary]:min-h-11"
    >
      <PageBar
        title="New run"
        meta={form.title.trim() === "" ? "Untitled draft" : form.title}
        actions={<DraftList />}
      />
      <SectionNavigation
        section={session.section}
        underneath={editorSection}
        onNavigate={(section) => {
          void session.navigate(section);
        }}
      />
      {!wide ? <ReadinessRail compact form={form} errors={errors} onReveal={revealField} /> : null}
      <div className="grid min-w-0 grid-cols-1 items-start gap-8 min-[1100px]:grid-cols-[minmax(0,1fr)_300px]">
        <section
          data-tour={editorSection === "content" ? "play-options" : undefined}
          className="min-w-0"
        >
          <h2
            ref={session.section === "review" ? undefined : heading}
            tabIndex={-1}
            className="text-row font-semibold"
          >
            {editorSection === "style"
              ? "Make it look like yours."
              : playSections.find((item) => item.id === editorSection)?.label}
          </h2>
          {!wide && editorSection === "style" ? (
            <div className="mt-5">
              <OutputPreview />
            </div>
          ) : null}
          {editorSection === "content" ? (
            <ContentSection
              {...controls}
              fields={fields}
              entries={choices.entries}
              onLibrary={(to) => {
                void library(to);
              }}
            />
          ) : null}
          {editorSection === "outputs" ? (
            <OutputsSection
              {...controls}
              entries={choices.entries}
              missingKeyword={errors.find((error) => error.field.startsWith("values."))?.field}
              onKeyword={revealField}
              onSettings={() => {
                void library("/settings");
              }}
            />
          ) : null}
          {editorSection === "style" ? <StyleSection problem={problem} /> : null}
        </section>
        {wide ? (
          <div className="flex min-w-0 flex-col gap-6 min-[1100px]:sticky min-[1100px]:top-16">
            {editorSection === "style" ? <OutputPreview /> : null}
            <ReadinessRail form={form} errors={errors} onReveal={revealField} />
          </div>
        ) : null}
      </div>
      <ActionBar
        status={
          <StatusSlot tone={saveProblem ? "error" : "info"}>
            {saveProblem ??
              (blocker ? (
                <>
                  <span className="min-w-0 truncate" title={blocker.hint}>
                    {blocker.hint}
                  </span>
                  <Button variant="ghost" onClick={() => revealField(blocker.field)}>
                    Fix setup
                  </Button>
                </>
              ) : undefined)}
          </StatusSlot>
        }
      >
        {/* Kept in place on Style, where there is no next tab, so Review and start never
            moves. */}
        <Button
          variant="ghost"
          className={next && next.id !== "review" ? undefined : "invisible"}
          aria-hidden={next && next.id !== "review" ? undefined : true}
          tabIndex={next && next.id !== "review" ? undefined : -1}
          onClick={() => {
            if (next && next.id !== "review") void session.navigate(next.id);
          }}
        >
          Continue to {next && next.id !== "review" ? next.label : "Review"} →
        </Button>
        <Button variant="primary" aria-expanded={session.section === "review"} onClick={submit}>
          Review and start
        </Button>
      </ActionBar>
      <Drawer
        open={session.section === "review"}
        title="Review"
        headingRef={heading}
        onClose={() => {
          void session.navigate(lastEditor.current);
        }}
      >
        <ReviewSection fields={fields} errors={errors} problem={problem} onReveal={revealField} />
      </Drawer>
    </div>
  );
}
