import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { captionCues } from "@app/slices/subtitles/captions.js";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { CaptionEditor } from "./caption-editor.js";
import { ImageEditor } from "./image-editor.js";
import { NarrationEditor } from "./narration-editor.js";
import { revisionFileUrl } from "./revision-api.js";
import { captionNarrationDuration } from "./revision-caption-duration.js";
import { RevisionUpload } from "./revision-upload.js";
import type { EditorProps, EditSection } from "./revision-workspace.js";

const timing = z.object({
  words: z
    .array(
      z.object({
        text: z.string().trim().min(1),
        start: z.number().finite().nonnegative(),
        end: z.number().finite().positive(),
        confidence: z.number().optional(),
      }),
    )
    .min(1),
});

// These are the draft inputs that can replace the retained narration timeline. Title,
// image and subtitle style edits do not invalidate that timeline.
function narrationIdentity(edit: RevisionEdit): string {
  const { config, content } = edit;
  return JSON.stringify({
    source: config.sources.audio,
    audio: content.provided.audio,
    uploads:
      edit.uploads?.filter(
        (row) =>
          row.destination.kind === "narration" ||
          (row.destination.kind === "provided" && row.destination.stage === "audio"),
      ) ?? [],
    ...(config.sources.audio !== "generate"
      ? {}
      : {
          choice: config.audio,
          chunking: config.chunking,
          article: content.articleMarkdown ?? config.provided.article,
          articleSource: config.sources.article,
          renderedArticle: config.rendered.article,
          intro: config.intro,
          outro: config.outro,
          renderedIntro: config.rendered.intro,
          renderedOutro: config.rendered.outro,
          gap: config.silenceGapSeconds,
          overrides: content.narrationOverrides,
          regenerate: edit.regenerate?.filter((key) => /^(audio:|article:|entry:)/.test(key)) ?? [],
        }),
  });
}

export function RevisionContentEditors({
  view,
  edit,
  onChange,
  onPending,
  section,
}: EditorProps): import("react").ReactElement {
  const { api } = useApp();
  const identity = narrationIdentity(edit);
  const currentNarration =
    edit.config.sources.audio !== "off" &&
    identity ===
      narrationIdentity({ config: view.revision.config, content: view.revision.content });
  const fingerprint = view.revision.fingerprints["subtitles:timing"];
  const duration = currentNarration ? captionNarrationDuration(view) : undefined;
  const ready = duration !== undefined && fingerprint !== undefined && fingerprint !== "";
  const latest = useRef({ edit, onChange, revisionId: view.revision.id, identity });
  latest.current = { edit, onChange, revisionId: view.revision.id, identity };
  const pendingCallback = useRef(onPending);
  pendingCallback.current = onPending;
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | undefined>();
  const operation = useRef<AbortController | undefined>(undefined);
  const mounted = useRef(true);
  const mark = useCallback((key: string, active: boolean): void => {
    if (!mounted.current) return;
    setPending((current) => {
      if (current.has(key) === active) return current;
      const next = new Set(current);
      if (active) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  useEffect(() => {
    pendingCallback.current(pending.size > 0);
  }, [pending]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      operation.current?.abort();
      pendingCallback.current(false);
    };
  }, []);
  useEffect(() => {
    const revisionId = view.revision.id;
    return () => {
      if (latest.current.revisionId !== revisionId || latest.current.identity !== identity)
        operation.current?.abort();
    };
  }, [view.revision.id, identity]);

  function emit(next: RevisionEdit): void {
    const change = latest.current.onChange;
    latest.current = { ...latest.current, edit: next, identity: narrationIdentity(next) };
    change(next);
  }

  async function loadCues(): Promise<void> {
    if (operation.current !== undefined) return;
    const controller = new AbortController();
    operation.current = controller;
    const before = latest.current;
    mark("captions:load", true);
    setError(undefined);
    try {
      const record = view.outputs.find(
        (one) =>
          one.selected &&
          one.state === "ready" &&
          one.output.role === "subtitle_words" &&
          one.available,
      );
      if (!ready || duration === undefined || fingerprint === undefined || record === undefined)
        throw new Error(
          "Build subtitle timing from the current narration before editing its cues.",
        );
      const response = await api.fetch(
        revisionFileUrl(api, view.revision.projectId, view.revision.id, record.recordId),
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("The retained timing file is unavailable.");
      const saved = timing.parse(await response.json());
      let previous = 0;
      for (const word of saved.words) {
        if (word.start < previous || word.end <= word.start || word.end > duration)
          throw new Error("The subtitle word timing must be ordered and within narration.");
        previous = word.end;
      }
      const cues = captionCues(saved.words).map((cue) => ({ ...cue, id: crypto.randomUUID() }));
      const current = latest.current;
      if (
        !mounted.current ||
        controller.signal.aborted ||
        current.revisionId !== before.revisionId ||
        current.identity !== before.identity ||
        current.edit.content.subtitleCues !== before.edit.content.subtitleCues
      )
        return;
      emit({
        ...current.edit,
        content: { ...current.edit.content, subtitleCues: { audioFingerprint: fingerprint, cues } },
      });
    } catch (failure) {
      if (mounted.current && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      if (operation.current === controller) operation.current = undefined;
      mark("captions:load", false);
    }
  }
  const captions = edit.content.subtitleCues;
  const shows = (part: EditSection) => section === undefined || section === part;
  return (
    <div className="space-y-5">
      <section aria-label="Images" hidden={!shows("images")} className="space-y-5">
        {(["audio", "thumbnail"] as const).map((stage) =>
          edit.config.sources[stage] !== "provide" ? null : (
            <RevisionUpload
              key={stage}
              label={`Replace provided ${stage}`}
              kind={stage}
              onPending={(active) => mark(`provided:${stage}`, active)}
              onReady={(file) => {
                const current = latest.current;
                if (current.edit.config.sources[stage] !== "provide") return;
                emit({
                  ...current.edit,
                  uploads: [
                    ...(current.edit.uploads ?? []).filter(
                      (one) =>
                        one.destination.kind !== "provided" || one.destination.stage !== stage,
                    ),
                    { stagedFileId: file.id, destination: { kind: "provided", stage } },
                  ],
                });
              }}
            />
          ),
        )}
        <ImageEditor
          getEdit={() => latest.current.edit}
          view={view}
          edit={edit}
          onChange={emit}
          onPending={mark}
        />
      </section>
      <section aria-label="Narration" hidden={!shows("narration")} className="space-y-5">
        {edit.config.sources.audio === "generate" ? (
          <NarrationEditor
            getEdit={() => latest.current.edit}
            view={view}
            edit={edit}
            onChange={emit}
            onPending={mark}
          />
        ) : null}
      </section>
      {error === undefined ? null : (
        <p role="alert" className="text-red">
          {error}
        </p>
      )}
      <section aria-label="Captions" hidden={!shows("captions")} className="space-y-5">
        {!ready ? (
          <p>
            Build current narration timing before editing caption cues; its duration or timing is
            unavailable or stale.
          </p>
        ) : null}
        {captions === undefined ? (
          <Button
            type="button"
            disabled={!ready || pending.has("captions:load")}
            onClick={() => void loadCues()}
          >
            Edit existing caption cues
          </Button>
        ) : (
          <>
            {captions.audioFingerprint !== fingerprint ? (
              <p>
                These caption edits belong to an earlier narration. Review their text and timing
                against the current narration, then apply your corrections and save the project.
              </p>
            ) : null}
            {ready && duration !== undefined ? (
              <CaptionEditor
                key={`${view.revision.id}:${fingerprint}`}
                cues={captions.cues}
                duration={duration}
                onPending={(active) => mark("captions:dirty", active)}
                onChange={(cues) => {
                  const current = latest.current;
                  const saved = current.edit.content.subtitleCues;
                  if (saved !== undefined)
                    emit({
                      ...current.edit,
                      content: { ...current.edit.content, subtitleCues: { ...saved, cues } },
                    });
                }}
              />
            ) : null}
            <Button
              type="button"
              onClick={() =>
                emit({ ...edit, content: { ...edit.content, subtitleCues: undefined } })
              }
            >
              Discard caption edits
            </Button>
          </>
        )}
      </section>
    </div>
  );
}
