import type { Format, RunDraft } from "@app/slices/admission/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type KeyboardEvent, useId, useState } from "react";
import { createProject, type UploadKind, uploadStaged } from "@/api";
import { useApp } from "@/app-context";
import { Mark, StageGlyph } from "@/components/glyph";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { keys } from "@/queries";

// logic/04 §Q30 and logic/05 §Q39.
const titleMax = 200;
const imagesPerRunMax = 60;
// logic/11 §Q99: the default gap beside a segment that exists.
const silenceGapSeconds = 3;

// One picked file and where its copy into staging got to. A file starts copying the
// moment it is picked (logic/05 step 5); until the copy finishes the run cannot start
// (logic/05 §Q44).
interface Upload {
  readonly key: string;
  readonly name: string;
  readonly stagedFileId: string | undefined;
  readonly error: string | undefined;
}

export interface PlayFormState {
  readonly title: string;
  readonly article: string;
  readonly audio: Upload | undefined;
  readonly images: readonly Upload[];
}

export interface Blocker {
  // The dotted path of the control, the same name the admission rules use so the field
  // is marked in place (logic/04 §Q29).
  readonly field: string;
  // Hints name the next action, never the rule (uiux/screens/06-play.md).
  readonly hint: string;
}

// The first thing standing between this form and a run, in the order the form is read:
// the stage rails top to bottom, then the cue sheet (uiux/03-experience.md, tab order).
export function firstBlocker(form: PlayFormState): Blocker | undefined {
  if (form.article.trim() === "") {
    return { field: "provided.article", hint: "Paste the article to play" };
  }
  if (form.audio === undefined) {
    return { field: "provided.audio", hint: "Attach the narration audio to play" };
  }
  if (form.images.length === 0) {
    return { field: "provided.images", hint: "Attach at least one image to play" };
  }
  if (form.images.length > imagesPerRunMax) {
    return {
      field: "provided.images",
      hint: `Remove images to play: a run holds at most ${String(imagesPerRunMax)}`,
    };
  }
  const uploads = [form.audio, ...form.images];
  if (uploads.some((upload) => upload.error !== undefined)) {
    return { field: "provided", hint: "Remove the upload that failed to play" };
  }
  if (uploads.some((upload) => upload.stagedFileId === undefined)) {
    return { field: "provided", hint: "Wait for the uploads to finish to play" };
  }
  if (form.title.trim() === "") {
    return { field: "title", hint: "Name the video to play" };
  }
  if (form.title.trim().length > titleMax) {
    return {
      field: "title",
      hint: `Shorten the title to ${String(titleMax)} characters to play`,
    };
  }
  return undefined;
}

export function draftOf(form: PlayFormState, format: Format): RunDraft {
  return {
    title: form.title.trim(),
    format,
    // logic/04 §Q32 with logic/05 §Q41: a provided article forces research off, and
    // video is always generated (logic/01 step 5).
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "off",
      video: "generate",
    },
    imagePrompts: [],
    values: {},
    provided: {
      article: form.article,
      ...(form.audio?.stagedFileId === undefined ? {} : { audio: form.audio.stagedFileId }),
      images: form.images.flatMap((image) =>
        image.stagedFileId === undefined ? [] : [image.stagedFileId],
      ),
    },
    silenceGapSeconds,
  };
}

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
  const titleId = useId();
  const articleId = useId();
  const audioId = useId();
  const imagesId = useId();

  const [format, setFormat] = useState<Format>("16:9");
  const [form, setForm] = useState<PlayFormState>({
    title: "",
    article: "",
    audio: undefined,
    images: [],
  });

  const blocker = firstBlocker(form);

  const play = useMutation({
    mutationFn: () => createProject(api, draftOf(form, format)),
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: keys.projects });
      void queryClient.invalidateQueries({ queryKey: keys.staging });
      onCreated(created.project.id);
    },
  });

  // logic/05 step 5: the copy starts the moment the file is picked, in the background,
  // with its progress on the form.
  const stage = async (kind: UploadKind, file: File, key: string): Promise<void> => {
    try {
      const staged = await uploadStaged(api, kind, file);
      settle(key, (upload) => ({ ...upload, stagedFileId: staged.id }));
    } catch (error) {
      settle(key, (upload) => ({ ...upload, error: messageOf(error) }));
    }
  };

  const settle = (key: string, done: (upload: Upload) => Upload): void => {
    setForm((current) => ({
      ...current,
      audio: current.audio?.key === key ? done(current.audio) : current.audio,
      images: current.images.map((image) => (image.key === key ? done(image) : image)),
    }));
  };

  const pickAudio = (file: File | undefined): void => {
    if (file === undefined) {
      return;
    }
    // logic/05 §Q43: a second pick replaces the first in a single-file slot.
    const upload = newUpload(file);
    setForm((current) => ({ ...current, audio: upload }));
    void stage("audio", file, upload.key);
  };

  const pickImages = (files: readonly File[]): void => {
    const uploads = files.map(newUpload);
    // logic/05 §Q39: slideshow order is selection order.
    setForm((current) => ({ ...current, images: [...current.images, ...uploads] }));
    for (const [at, upload] of uploads.entries()) {
      const file = files[at];
      if (file !== undefined) {
        void stage("images", file, upload.key);
      }
    }
  };

  const removeImage = (key: string): void => {
    setForm((current) => ({
      ...current,
      images: current.images.filter((image) => image.key !== key),
    }));
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

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: this listens for the form-wide Ctrl/Cmd+Enter shortcut and does not make the container itself operable.
    <div
      onKeyDown={onKeyDown}
      className="mx-auto grid max-w-[1440px] grid-cols-1 gap-6 min-[900px]:grid-cols-[1fr_480px]"
    >
      <div>
        <h1 className="mb-1 text-title font-bold tracking-[-0.01em]">New run</h1>
        <p className="mb-4 text-body text-ink2">
          Provide the article, the narration, and the images. Slopify renders the video.
        </p>

        <RailGroup>
          <Rail className="items-start">
            <StageGlyph kind="research" className="text-ink3" />
            <span className="w-[110px] shrink-0 font-semibold text-ink3">Research</span>
            <span className="engraved text-ink3">Off</span>
            <span className="ml-auto text-small text-ink3">
              A provided article needs no research
            </span>
          </Rail>

          <Rail className="flex-col items-stretch gap-[10px]">
            <div className="flex items-center gap-[14px]">
              <StageGlyph kind="article" className="text-ink2" />
              <span className="w-[110px] shrink-0 font-semibold">Article</span>
              <span className="engraved text-ink3">Provide</span>
            </div>
            <div>
              <Label htmlFor={articleId} className="mb-[5px]">
                Article text
              </Label>
              <Textarea
                id={articleId}
                rows={6}
                value={form.article}
                aria-invalid={blocker?.field === "provided.article"}
                placeholder="Paste the article that will be narrated."
                onChange={(event) => {
                  const article = event.target.value;
                  setForm((current) => ({ ...current, article }));
                }}
              />
            </div>
          </Rail>

          <Rail className="flex-col items-stretch gap-[10px]">
            <div className="flex items-center gap-[14px]">
              <StageGlyph kind="audio" className="text-ink2" />
              <span className="w-[110px] shrink-0 font-semibold">Audio</span>
              <span className="engraved text-ink3">Provide</span>
            </div>
            <div>
              <Label htmlFor={audioId} className="mb-[5px]">
                Narration file
              </Label>
              <input
                id={audioId}
                type="file"
                accept="audio/*"
                className="text-small text-ink2 file:mr-3 file:h-8 file:rounded-control file:border file:border-line2 file:bg-panel2 file:px-3 file:text-ink"
                onChange={(event) => {
                  pickAudio(event.target.files?.[0]);
                }}
              />
              {form.audio === undefined ? null : <UploadRow upload={form.audio} />}
            </div>
          </Rail>

          <Rail className="flex-col items-stretch gap-[10px]">
            <div className="flex items-center gap-[14px]">
              <StageGlyph kind="images" className="text-ink2" />
              <span className="w-[110px] shrink-0 font-semibold">Images</span>
              <span className="engraved text-ink3">Provide</span>
            </div>
            <div>
              <Label htmlFor={imagesId} className="mb-[5px]">
                Slideshow images
              </Label>
              <input
                id={imagesId}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="text-small text-ink2 file:mr-3 file:h-8 file:rounded-control file:border file:border-line2 file:bg-panel2 file:px-3 file:text-ink"
                onChange={(event) => {
                  pickImages([...(event.target.files ?? [])]);
                }}
              />
              <ul className="mt-2 flex flex-col gap-1">
                {form.images.map((image, at) => (
                  <li key={image.key} className="flex items-center gap-3">
                    <span className="engraved w-6 text-ink3">{String(at + 1)}</span>
                    <UploadRow upload={image} />
                    <Button
                      variant="ghost"
                      className="ml-auto"
                      onClick={() => {
                        removeImage(image.key);
                      }}
                    >
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </Rail>

          <Rail>
            <StageGlyph kind="thumbnail" className="text-ink3" />
            <span className="w-[110px] shrink-0 font-semibold text-ink3">Thumbnail</span>
            <span className="engraved text-ink3">Off</span>
          </Rail>

          <Rail>
            <StageGlyph kind="video" className="text-ink2" />
            <span className="w-[110px] shrink-0 font-semibold">Video</span>
            <span className="engraved text-ink3">Generate</span>
            <span className="ml-auto text-small text-ink2">
              {`Rendered from the stages above · ${String(silenceGapSeconds)} s gaps`}
            </span>
          </Rail>
        </RailGroup>
      </div>

      <aside className="flex h-fit flex-col gap-[14px] rounded-panel border border-line bg-panel p-[18px] min-[900px]:sticky min-[900px]:top-6">
        <h2 className="engraved text-ink3">Cue sheet</h2>

        <div>
          <Label htmlFor={titleId} className="mb-[5px]">
            Video title
          </Label>
          <Input
            id={titleId}
            value={form.title}
            aria-invalid={blocker?.field === "title"}
            onChange={(event) => {
              const title = event.target.value;
              setForm((current) => ({ ...current, title }));
            }}
          />
        </div>

        <div>
          <Label className="mb-[5px]" asChild>
            <span id="play-format-label">Format</span>
          </Label>
          <ToggleGroup
            type="single"
            value={format}
            aria-labelledby="play-format-label"
            onValueChange={(next) => {
              if (next === "16:9" || next === "9:16") {
                setFormat(next);
              }
            }}
          >
            <ToggleGroupItem value="16:9">16:9</ToggleGroupItem>
            <ToggleGroupItem value="9:16">9:16</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {play.error === null ? null : <p className="text-small text-red">{play.error.message}</p>}

        {blocker === undefined ? null : <p className="text-small text-ink3">{blocker.hint}</p>}

        <Button
          variant="play"
          size="play"
          disabled={blocker !== undefined || play.isPending}
          onClick={submit}
        >
          <Mark className="relative top-[2px] size-[22px]" />
          PLAY
        </Button>
      </aside>
    </div>
  );
}

function UploadRow({ upload }: { readonly upload: Upload }) {
  return (
    <span className="flex items-center gap-3 text-small">
      <span className={upload.error === undefined ? "text-ink" : "text-red"}>{upload.name}</span>
      {upload.error === undefined ? (
        <span className="engraved text-ink3">
          {upload.stagedFileId === undefined ? "Copying" : "Staged"}
        </span>
      ) : (
        <span className="text-small text-red">{upload.error}</span>
      )}
    </span>
  );
}

function newUpload(file: File): Upload {
  return {
    key: crypto.randomUUID(),
    name: file.name,
    stagedFileId: undefined,
    error: undefined,
  };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
