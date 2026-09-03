import type { FieldError } from "@app/slices/admission/rules.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useState } from "react";
import type { UploadKind } from "@/api";
import { createProject, uploadStaged } from "@/api";
import { useApp } from "@/app-context";
import { admission } from "@/play/admission";
import { CueSheet } from "@/play/cue-sheet";
import { StageRails } from "@/play/stage-rails";
import type { PlayFormState, Upload } from "@/play/state";
import { freshForm } from "@/play/state";
import {
  entriesQuery,
  keys,
  promptsQuery,
  providersQuery,
  settingsQuery,
  voicesQuery,
} from "@/queries";

// 06 Play. The stage rails on the left, the cue sheet on the right, and one key at the
// bottom of it (uiux/screens/06-play.md). This file is the composition: it holds the one
// piece of state the screen has, fetches what the pickers are filled from, stages the
// files a Provide needs, and posts the draft. Every rule it obeys lives elsewhere -
// `play/admission.ts` runs the server's own, and the controls are in `play/`.

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

  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const voices = useQuery(voicesQuery(api));
  const settings = useQuery(settingsQuery(api));

  const [form, setForm] = useState<PlayFormState>(freshForm);
  // What the server marked when it refused the draft: a template deleted since it was
  // picked, or a rule the browser's copy could not see (`logic/15` step 4).
  const [refused, setRefused] = useState<readonly FieldError[]>([]);
  // Whether the user has configured anything yet. A fresh form shows the hint over the
  // key and nothing else; a form being filled marks the control the hint is naming
  // (uiux/screens/06-play.md, Fresh vs Invalid field).
  const [touched, setTouched] = useState(false);

  const update = (patch: Partial<PlayFormState>): void => {
    setForm((current) => ({ ...current, ...patch }));
    setTouched(true);
    // A refusal stands until the form changes; the next press asks the server again.
    setRefused([]);
  };

  const { fields, draft, result, blocker } = admission({
    form,
    prompts: prompts.data?.prompts ?? [],
    entries: entries.data?.entries ?? [],
    silenceGapSeconds: settings.data?.silenceGapSeconds ?? 3,
  });

  const play = useMutation({
    mutationFn: () => createProject(api, draft),
    onSuccess: (created) => {
      if (!created.ok) {
        // `logic/04` §Q29: the server names every failing field, and each one is marked
        // where it stands rather than being summarised over the key.
        setRefused(created.fields);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: keys.projects });
      void queryClient.invalidateQueries({ queryKey: keys.staging });
      onCreated(created.value.project.id);
    },
  });

  // The refusal to put under one control: every field the server named, and the one the
  // hint is pointing at once the form has been touched. Nothing else, so a form nobody
  // has configured yet is not painted red (`logic/04` §Q29 with uiux/screens/06-play.md).
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
      play.mutate();
    }
  };

  // Ctrl/Cmd+Enter presses Play from anywhere on the form when it is valid
  // (uiux/03-experience.md, Keyboard).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  };

  const stage = async (kind: UploadKind, file: File, key: string): Promise<void> => {
    try {
      const staged = await uploadStaged(api, kind, file);
      settle(key, (upload) => ({ ...upload, file: staged }));
    } catch (error) {
      settle(key, (upload) => ({ ...upload, error: messageOf(error) }));
    }
  };

  const settle = (key: string, done: (upload: Upload) => Upload): void => {
    setForm((current) => ({
      ...current,
      provided: {
        ...current.provided,
        audio:
          current.provided.audio?.key === key
            ? done(current.provided.audio)
            : current.provided.audio,
        thumbnail:
          current.provided.thumbnail?.key === key
            ? done(current.provided.thumbnail)
            : current.provided.thumbnail,
        images: current.provided.images.map((image) => (image.key === key ? done(image) : image)),
      },
    }));
  };

  // `logic/05` step 5: the copy starts the moment the file is picked, in the background,
  // with its progress on the form. §Q43: a second pick replaces the first in a
  // single-file slot; §Q39: the slideshow keeps selection order.
  const onPickFiles = (kind: UploadKind, files: readonly File[]): void => {
    const uploads = files.map(newUpload);
    const last = uploads[uploads.length - 1];
    setForm((current) => ({
      ...current,
      provided:
        kind === "images"
          ? { ...current.provided, images: [...current.provided.images, ...uploads] }
          : kind === "audio"
            ? { ...current.provided, audio: last }
            : { ...current.provided, thumbnail: last },
    }));
    setRefused([]);
    for (const [at, upload] of uploads.entries()) {
      const file = files[at];
      if (file !== undefined) {
        void stage(kind, file, upload.key);
      }
    }
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
          Six stages. Generate any of them, or provide the output yourself and the stage is skipped.
        </p>

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
      />
    </div>
  );
}

function newUpload(file: File): Upload {
  return { key: crypto.randomUUID(), name: file.name, file: undefined, error: undefined };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
