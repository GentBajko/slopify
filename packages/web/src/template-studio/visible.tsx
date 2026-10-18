import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { ReactElement, ReactNode } from "react";
import { Field, Input } from "@/components/kit/field";
import { Segmented, Switch } from "@/components/kit/switch";
import { freshShorts } from "@/play/shorts";
import { TitlePattern } from "./fine-tune";

type Form = PlayDraftDocument["form"];
type Edit = (form: Form) => void;

// The two to four settings each section shows before Fine-tune, presets before numbers. Every
// one is also in Fine-tune, in Play's own editor.
export function VisibleControls({
  section,
  document,
  onEdit,
}: {
  readonly section: TemplateSection;
  readonly document: PlayDraftDocument;
  readonly onEdit: (document: PlayDraftDocument) => void;
}): ReactElement | null {
  const { form } = document;
  const edit: Edit = (next) => onEdit({ ...document, form: next });
  const sources = (patch: Partial<Form["sources"]>): Form => ({
    ...form,
    sources: { ...form.sources, ...patch },
  });
  switch (section) {
    case "subject":
      return (
        <Controls>
          <TitlePattern value={form.title} onChange={(title) => edit({ ...form, title })} />
          <Segmented
            label="Research"
            tip="play.source.research"
            value={form.sources.research === "off" ? "off" : "generate"}
            options={[
              { value: "off", label: "Off" },
              { value: "generate", label: "Research the topic" },
            ]}
            onChange={(research) => edit(sources({ research }))}
          />
        </Controls>
      );
    case "script":
      return (
        <Controls>
          <Segmented
            label="Script"
            tip="play.source.article"
            value={form.sources.article === "provide" ? "provide" : "generate"}
            options={[
              { value: "generate", label: "Written by AI" },
              { value: "provide", label: "I paste it" },
            ]}
            onChange={(article) => edit(sources({ article }))}
          />
          <Field
            label="Expected length (words)"
            help="For the cost estimate."
            tip="play.expected-words"
          >
            <Input
              inputMode="numeric"
              value={document.expectedWords}
              onChange={(event) => onEdit({ ...document, expectedWords: event.target.value })}
            />
          </Field>
        </Controls>
      );
    case "voice":
      return (
        <Controls>
          <Switch
            label="Level the volume"
            tip="project.loudness"
            checked={form.loudness?.enabled ?? true}
            onChange={(enabled) => edit({ ...form, loudness: { ...form.loudness, enabled } })}
          />
          <Switch
            label="Soften breaths"
            tip="project.remove-breaths"
            checked={form.removeBreaths === true}
            onChange={(removeBreaths) => edit({ ...form, removeBreaths })}
          />
          <Switch
            label="Soften S sounds"
            tip="project.soften-s"
            checked={form.deEss === true}
            onChange={(deEss) => edit({ ...form, deEss })}
          />
        </Controls>
      );
    case "pictures":
      return (
        <Controls>
          <Segmented
            label="Pictures"
            tip="play.source.images"
            value={
              form.sources.images === "provide"
                ? "provide"
                : form.sources.images === "off"
                  ? "off"
                  : "generate"
            }
            options={[
              { value: "generate", label: "Made by AI" },
              { value: "provide", label: "I add them" },
              { value: "off", label: "Off" },
            ]}
            onChange={(images) => edit(sources({ images }))}
          />
          <Switch
            label="Scenes from the script"
            tip="play.image-scenes"
            checked={form.imageScenes === true}
            disabled={form.sources.images !== "generate"}
            onChange={(imageScenes) => edit({ ...form, imageScenes })}
          />
        </Controls>
      );
    case "video":
      return (
        <Controls>
          <Segmented
            label="Format"
            tip="play.format"
            value={form.format}
            options={[
              { value: "16:9", label: "Landscape 16:9" },
              { value: "9:16", label: "Vertical 9:16" },
              { value: "1:1", label: "Square 1:1" },
            ]}
            onChange={(format) => edit({ ...form, format })}
          />
          <Segmented
            label="Captions"
            tip="project.subtitles.mode"
            value={form.subtitles.mode}
            options={[
              { value: "off", label: "Off" },
              { value: "burn-in", label: "On the video" },
              { value: "files", label: "As a file" },
            ]}
            onChange={(mode) => edit({ ...form, subtitles: { ...form.subtitles, mode } })}
          />
          <Segmented
            label="Motion"
            tip="play.motion"
            value={form.motionStyle}
            options={[
              { value: "zoom", label: "Zoom" },
              { value: "pan", label: "Pan" },
              { value: "mixed", label: "Mixed" },
              { value: "still", label: "Still" },
            ]}
            onChange={(motionStyle) => edit({ ...form, motionStyle })}
          />
          <Field label="Seconds per picture" tip="play.image-seconds">
            <Input
              inputMode="decimal"
              value={form.imageSeconds}
              onChange={(event) => edit({ ...form, imageSeconds: event.target.value })}
            />
          </Field>
        </Controls>
      );
    case "thumbnail":
      return (
        <Controls>
          <Segmented
            label="Thumbnail"
            tip="play.source.thumbnail"
            value={
              form.sources.thumbnail === "provide" ||
              form.sources.thumbnail === "off" ||
              form.sources.thumbnail === "prompt_by_llm"
                ? form.sources.thumbnail
                : "from_prompt"
            }
            options={[
              { value: "from_prompt", label: "From my prompt" },
              { value: "prompt_by_llm", label: "Prompt written by AI" },
              { value: "provide", label: "I add it" },
              { value: "off", label: "Off" },
            ]}
            onChange={(thumbnail) => edit(sources({ thumbnail }))}
          />
          <Segmented
            label="Thumbnails per video"
            tip="play.thumbnail-count"
            value={String(form.thumbnailCount ?? 1) as "1" | "3"}
            options={[
              { value: "1", label: "One" },
              { value: "3", label: "Three to compare" },
            ]}
            onChange={(count) => edit({ ...form, thumbnailCount: count === "3" ? 3 : 1 })}
          />
        </Controls>
      );
    case "shorts":
      return (
        <Controls>
          <Switch
            label="Make shorts from the video"
            tip="play.shorts"
            checked={form.shorts?.enabled === true}
            onChange={(enabled) =>
              edit({ ...form, shorts: { ...(form.shorts ?? freshShorts), enabled } })
            }
          />
          <Field label="Shorts per video" tip="play.shorts.count">
            <Input
              inputMode="numeric"
              disabled={form.shorts?.enabled !== true}
              value={form.shorts?.count ?? freshShorts.count}
              onChange={(event) =>
                edit({
                  ...form,
                  shorts: { ...(form.shorts ?? freshShorts), count: event.target.value },
                })
              }
            />
          </Field>
        </Controls>
      );
    case "document":
      return (
        <Controls>
          <Segmented
            label="PDF document"
            tip="play.source.document"
            value={form.sources.document === "generate" ? "generate" : "off"}
            options={[
              { value: "off", label: "Off" },
              { value: "generate", label: "Make a PDF from the script" },
            ]}
            onChange={(document) => edit(sources({ document }))}
          />
        </Controls>
      );
    case "reviews":
      return (
        <p className="m-0 text-small text-ink-2">
          {reviewSummary(form)} Change them under Fine-tune.
        </p>
      );
    case "upload":
      return (
        <Controls>
          <Switch
            label="Write the YouTube description, chapters and tags"
            tip="play.youtube-description"
            checked={form.youtubeDescription === true}
            onChange={(youtubeDescription) => edit({ ...form, youtubeDescription })}
          />
        </Controls>
      );
    case "schedule":
      return null;
  }
}

function reviewSummary(form: Form): string {
  const checkpoints = form.checkpoints?.length ?? 0;
  const reviews = Object.values(form.reviews?.stages ?? {}).filter(
    (stage) => stage.mode !== "off",
  ).length;
  const count = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;
  return `${count(checkpoints, "checkpoint", "checkpoints")} and ${count(reviews, "automatic review", "automatic reviews")}.`;
}

function Controls({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div data-slot="studio-controls" className="flex min-w-0 flex-col gap-4">
      {children}
    </div>
  );
}
