import type { FieldError } from "@app/slices/admission/rules.js";
import type { QueueEntry } from "@app/slices/batch/index.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useState } from "react";
import type { UploadKind } from "@/api";
import { createProject } from "@/api";
import { useApp } from "@/app-context";
import { read } from "@/http";
import { usePlayDraft } from "@/lib/form-drafts";
import { admission } from "@/play/admission";
import { CueSheet } from "@/play/cue-sheet";
import { usePlaySession } from "@/play/draft-context";
import { DraftList } from "@/play/draft-list";
import { BatchEditor, RunReview } from "@/play/run-review";
import { StageRails } from "@/play/stage-rails";
import type { PlayFormState, Upload } from "@/play/state";
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

// 06 Play. The stage rails on the left, the cue sheet on the right, and one key at the bottom
// of it. This file is the composition: it holds the one piece of state the screen has, fetches
// what the pickers are filled from, stages the files a Provide needs, and posts the draft.
// Every rule it obeys lives elsewhere - `play/admission.ts` runs the server's own, and the
// controls are in `play/`.

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
  // Whether the user has configured anything yet. A fresh form shows the hint over the key and
  // nothing else; a form being filled marks the control the hint is naming.
  const [touched, setTouched] = useState(false);

  const update = (patch: Partial<PlayFormState>): void => {
    setForm((current) => {
      const next = { ...current, ...patch };
      return { ...next, subtitles: subtitlesFor(next.subtitles, next.sources) };
    });
    setBatchId(crypto.randomUUID());
    setTouched(true);
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
      const created = await read<{ queue: QueueEntry[] }>(
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
      const first = created.queue[0];
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

  // The refusal to put under one control: every field the server named, and the one the
  // hint is pointing at once the form has been touched. Nothing else, so a form nobody
  // has configured yet is not painted red.
  const problem = (field: string): string | undefined => {
    const named = refused.find((error) => error.field === field);
    if (named !== undefined) {
      return named.message;
    }
    if (!touched || blocker?.field !== field || result.ok) {
      return undefined;
    }
    return result.fields.find((error) => error.field === field)?.message;
  };

  const submit = (): void => {
    if (blocker === undefined && !play.isPending) {
      setReview(true);
    }
  };

  // Ctrl/Cmd+Enter presses Play from anywhere on the form when it is valid.
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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: this listens for the form-wide Ctrl/Cmd+Enter shortcut and does not make the container itself operable.
    <div
      onKeyDown={onKeyDown}
      data-play-grid="true"
      className="mx-auto grid max-w-[1440px] grid-cols-1 items-start gap-6 min-[1180px]:grid-cols-[minmax(0,1fr)_480px]"
    >
      <div className="min-w-0">
        <h1 className="mb-1 text-title font-bold tracking-[-0.01em]">New run</h1>
        <p className="mb-4 text-body text-ink2">
          Generate or provide an Article. Every other stage can be Off. Choose narration, images,
          and a video or combined audio export to suit your project.
        </p>

        <DraftList />
        {loadError === undefined ? null : <p className="mb-4 text-body text-red">{loadError}</p>}

        <StageRails
          form={form}
          providers={providers.data?.providers ?? []}
          prompts={prompts.data?.prompts ?? []}
          voices={voices.data?.voices ?? []}
          silenceGapSeconds={settings.data?.silenceGapSeconds ?? 3}
          problem={problem}
          update={update}
          onPickFiles={onPickFiles}
          onRemoveFile={onRemoveFile}
          subtitleSession={{
            previewText: session.document.previewText,
            fontUploading: session.fontUploading,
            fontUpload: session.document.fontUpload,
            selectFont: session.selectFont,
            uploadSubtitleFont: session.uploadSubtitleFont,
          }}
        />
      </div>

      <CueSheet
        form={form}
        providers={providers.data?.providers ?? []}
        entries={entries.data?.entries ?? []}
        fields={fields}
        problem={problem}
        blocker={blocker}
        failure={play.error === null ? undefined : play.error.message}
        pending={play.isPending}
        update={update}
        onPlay={submit}
      >
        <BatchEditor
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
      </CueSheet>
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
