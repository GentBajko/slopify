import type { FieldError } from "@app/slices/admission/rules.js";
import type { QueueEntry } from "@app/slices/batch/index.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import type { UploadKind } from "@/api";
import { createProject } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { saved } from "@/http";
import { usePlayDraft } from "@/lib/form-drafts";
import { admission } from "@/play/admission";
import { ContentSection } from "@/play/content-section";
import { usePlaySession } from "@/play/draft-context";
import { DraftList } from "@/play/draft-list";
import { focusPlayField, playFieldTarget } from "@/play/field-targets";
import { OutputPreview, useWidePlayLayout } from "@/play/output-preview";
import { OutputsSection } from "@/play/outputs-section";
import { BatchEditor, RunReview } from "@/play/run-review";
import { SectionNavigation } from "@/play/section-navigation";
import { playSections } from "@/play/sections";
import { SetupSummary } from "@/play/setup-summary";
import type { PlayFormState, Upload } from "@/play/state";
import { StyleSection } from "@/play/style-section";
import {
  entriesQuery,
  keys,
  promptsQuery,
  providersQuery,
  settingsQuery,
  voicesQuery,
} from "@/queries";
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
  const queryClient = useQueryClient();
  const tutorialEvent = useTutorialEvent();

  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const voices = useQuery(voicesQuery(api));
  const settings = useQuery(settingsQuery(api));

  const [form, setForm] = usePlayDraft();
  const session = usePlaySession();
  const batchItems = session.document.variants.map(({ id, ...item }) => ({ ...item, key: id }));
  const [review, setReview] = useState(false);
  const [batchId, setBatchId] = useState(() => crypto.randomUUID());
  const subtitleUploading = session.fontUploading || session.document.fontUpload !== null;
  // What the server marked when it refused the draft: a template deleted since it was
  // picked, or a rule the browser's copy could not see.
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  const [touched, setTouched] = useState<ReadonlySet<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const routerNavigate = useNavigate();
  const touchedDraft = useRef(session.activeId);
  useLayoutEffect(() => {
    if (touchedDraft.current !== session.activeId) {
      touchedDraft.current = session.activeId;
      setTouched(new Set());
      setRefused([]);
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
    setBatchId(crypto.randomUUID());
    // A refusal stands until the form changes; the next press asks the server again.
    setRefused([]);
  };

  const {
    fields,
    draft,
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

  const play = useMutation({
    mutationFn: async () => {
      if (!batchItems.length) return createProject(api, draft);
      const created = await saved<{ queue: QueueEntry[] }>(
        await api.fetch(`${api.origin}/api/projects/batch`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            requestId: batchId,
            draft,
            items: [
              { title: draft.title, values: draft.values },
              ...batchItems.map(({ title, values }) => ({ title, values })),
            ],
          }),
        }),
      );
      if (!created.ok) return created;
      const first = created.value.queue[0];
      if (!first) throw new Error("No videos were queued.");
      return { ok: true as const, value: { project: { id: first.projectId } } };
    },
    onSuccess: (created) => {
      if (!created.ok) {
        // The server names every failing field, and each one is marked
        // where it stands rather than being summarised over the key.
        setRefused(created.fields);
        setReview(false);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: keys.projects });
      void queryClient.invalidateQueries({ queryKey: keys.staging });
      // Upload IDs belong to this run once accepted; the next Play starts fresh.
      void session.newDraft();
      setBatchId(crypto.randomUUID());
      setReview(false);
      tutorialEvent({ type: "project-created", id: created.value.project.id });
      onCreated(created.value.project.id);
    },
  });

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
    playReady: blocker === undefined && !play.isPending,
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
    setRefused([]);
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
      className="mx-auto max-w-[1320px] pb-[calc(4rem+env(safe-area-inset-bottom))] [&_input:not([type=checkbox])]:min-h-10 [&_select]:min-h-10 [&_button]:min-h-10 max-[1099px]:[&_button]:min-h-11 max-[1099px]:[&_input:not([type=checkbox])]:min-h-11 max-[1099px]:[&_select]:min-h-11"
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
            <div className="flex flex-col gap-5 py-6">
              {errors.length ? (
                <ul aria-label="Setup errors" className="text-small text-red">
                  {errors.map((error) => (
                    <li key={`${error.field}-${error.message}`}>
                      <Button variant="ghost" onClick={() => revealField(error.field)}>
                        {error.message}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {subtitleUploading ? (
                <Button variant="ghost" onClick={() => revealField("subtitles.fontId")}>
                  Wait for the subtitle font upload to finish to play
                </Button>
              ) : null}
              <BatchEditor
                problem={problem}
                items={batchItems}
                fields={fields}
                title={form.title}
                values={form.values}
                onChange={(items) => {
                  session.edit({
                    ...session.document,
                    variants: items.map(({ key, ...item }) => ({ ...item, id: key })),
                  });
                  setBatchId(crypto.randomUUID());
                }}
              />
              <Button
                data-tour="play-start"
                aria-disabled={blocker !== undefined || play.isPending}
                onClick={() => {
                  if (!blocker && !play.isPending) setReview(true);
                }}
              >
                Review costs
              </Button>
            </div>
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
      {review ? (
        <RunReview
          draft={draft}
          items={batchItems}
          pending={play.isPending}
          expectedWords={session.document.expectedWords}
          onExpectedWords={(expectedWords) => session.edit({ ...session.document, expectedWords })}
          failure={play.error?.message ?? refused.map((f) => f.message).join(" ")}
          onClose={() => setReview(false)}
          onStart={() => play.mutate()}
        />
      ) : null}
    </div>
  );
}
