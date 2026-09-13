import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UploadKind } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { usePlayDraft } from "@/lib/form-drafts";
import { admission } from "@/play/admission";
import { ContentSection } from "@/play/content-section";
import { usePlaySession } from "@/play/draft-context";
import { DraftList } from "@/play/draft-list";
import { focusPlayField, playFieldTarget } from "@/play/field-targets";
import { OutputPreview, useWidePlayLayout } from "@/play/output-preview";
import { OutputsSection } from "@/play/outputs-section";
import { ReviewSection } from "@/play/review-section";
import { SectionNavigation } from "@/play/section-navigation";
import { playSections } from "@/play/sections";
import { SetupSummary } from "@/play/setup-summary";
import type { PlayFormState, Upload } from "@/play/state";
import { StyleSection } from "@/play/style-section";
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
  const batchItems = session.document.variants.map(({ id, ...item }) => ({ ...item, key: id }));
  const subtitleUploading = session.fontUploading || session.document.fontUpload !== null;
  // What the server marked when it refused the draft: a template deleted since it was
  // picked, or a rule the browser's copy could not see.
  const refused = session.review.fields;
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
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
    const target = playFieldTarget(field, form, batchItems);
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
    prompts: prompts.data?.prompts ?? [],
    entries: entries.data?.entries ?? [],
    silenceGapSeconds: settings.data?.silenceGapSeconds ?? 3,
  });

  const blocker = subtitleUploading
    ? { field: "subtitles.fontId", hint: "Wait for the subtitle font upload to finish to play" }
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
    (prompts.data?.prompts ?? []).some((prompt) => prompt.kind === kind && prompt.name === name);
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
    const canonical = playFieldTarget(field, form, batchItems).field;
    return errors.find(
      (error) =>
        playFieldTarget(error.field, form, batchItems).field === canonical &&
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
    prompts: prompts.data?.prompts ?? [],
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
      className="mx-auto max-w-[1320px] pb-[calc(4rem+env(safe-area-inset-bottom))] [&_input:not([type=checkbox])]:min-h-10 [&_select]:min-h-10 [&_button]:min-h-10 [&_summary]:min-h-10 max-[1099px]:[&_button]:min-h-11 max-[1099px]:[&_input:not([type=checkbox])]:min-h-11 max-[1099px]:[&_select]:min-h-11 max-[1099px]:[&_summary]:min-h-11"
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-[36px] font-bold tracking-[-0.01em]">New run</h1>
          <p className="text-body text-ink2">
            Create the article, choose the outputs, then review.
          </p>
        </div>
        <DraftList />
      </header>
      {loadError ? <p className="mb-4 text-body text-red">{loadError}</p> : null}
      <SectionNavigation
        section={session.section}
        onNavigate={(section) => {
          void session.navigate(section);
        }}
      />
      <div className="grid min-w-0 grid-cols-1 items-start gap-7 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <section
          data-tour={session.section === "content" ? "play-options" : undefined}
          className="min-w-0"
        >
          <h2 ref={heading} tabIndex={-1} className="text-xl font-semibold">
            {session.section === "style"
              ? "Make it look like yours."
              : playSections.find((item) => item.id === session.section)?.label}
          </h2>
          {!wide ? (
            session.section === "style" ? (
              <div className="mt-5">
                <OutputPreview />
              </div>
            ) : (
              <details className="my-5 rounded-control border border-line p-3">
                <summary className="min-h-11 cursor-pointer text-small font-semibold">
                  Preview · {form.format}
                </summary>
                <OutputPreview />
              </details>
            )
          ) : null}
          {session.section === "content" ? (
            <ContentSection
              {...controls}
              fields={fields}
              entries={entries.data?.entries ?? []}
              onLibrary={(to) => {
                void library(to);
              }}
            />
          ) : null}
          {session.section === "outputs" ? (
            <OutputsSection
              {...controls}
              entries={entries.data?.entries ?? []}
              missingKeyword={errors.find((error) => error.field.startsWith("values."))?.field}
              onKeyword={revealField}
              onSettings={() => {
                void library("/settings");
              }}
            />
          ) : null}
          {session.section === "style" ? <StyleSection problem={problem} /> : null}
          {session.section === "review" ? (
            <ReviewSection
              fields={fields}
              errors={errors}
              problem={problem}
              onReveal={revealField}
            />
          ) : (
            <div className="mt-8 flex justify-end border-t border-line py-6">
              <Button
                variant="play"
                onClick={() => {
                  const next =
                    playSections[playSections.findIndex((item) => item.id === session.section) + 1];
                  if (next) void session.navigate(next.id);
                }}
              >
                Continue to{" "}
                {
                  playSections[playSections.findIndex((item) => item.id === session.section) + 1]
                    ?.label
                }{" "}
                →
              </Button>
            </div>
          )}
        </section>
        <div className="flex min-w-0 flex-col gap-6 min-[1100px]:sticky min-[1100px]:top-6">
          {wide ? <OutputPreview /> : null}
          <SetupSummary form={form} blocker={blocker} onReveal={revealField} />
        </div>
      </div>
    </div>
  );
}
