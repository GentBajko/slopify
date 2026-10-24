import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { templateNameMax } from "@app/slices/project-templates/schema.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import type { ReactElement, ReactNode } from "react";
import { Field, Input } from "@/components/kit/field";
import { Segmented, type SegmentedOption, Switch } from "@/components/kit/switch";
import { ModelPicker, ProviderPicker } from "@/play/pickers";

type Form = PlayDraftDocument["form"];
type Edit = (form: Form) => void;

// The few settings each section leads with, presets before numbers, laid out two across. The
// section's whole editor (Play's own) is under "All … settings" below them. Shorts, Pauses and
// checks and YouTube description & posts show their whole editor here instead (page.tsx).
export function VisibleControls({
  section,
  document,
  name,
  providers,
  unchosen,
  onEdit,
  onName,
}: {
  readonly section: TemplateSection;
  readonly document: PlayDraftDocument;
  // The template's name as typed, saved with the next Save.
  readonly name: string;
  readonly providers: readonly ProviderStatus[];
  // The writer and the image service nobody chose, with no default of this computer to stand
  // in: their pickers are drawn here, where the check's link lands.
  readonly unchosen: { readonly llm: boolean; readonly images: boolean };
  readonly onEdit: (document: PlayDraftDocument) => void;
  readonly onName: (name: string) => void;
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
          <Field label="Template name">
            <Input
              value={name}
              maxLength={templateNameMax}
              onChange={(event) => onName(event.target.value)}
            />
          </Field>
          <TitlePattern value={form.title} onChange={(title) => edit({ ...form, title })} />
          <Choice
            label="Research"
            help="Looks the topic up before the article is written."
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
          <Choice
            label="Article"
            value={form.sources.article === "provide" ? "provide" : "generate"}
            options={[
              { value: "generate", label: "Written by AI" },
              { value: "provide", label: "I paste it" },
            ]}
            onChange={(article) => edit(sources({ article }))}
          />
          <Field label="Expected length (words)" help="About 150 words is one minute of narration.">
            <Input
              inputMode="numeric"
              className="sl-input--number"
              value={document.expectedWords}
              onChange={(event) => onEdit({ ...document, expectedWords: event.target.value })}
            />
          </Field>
          {unchosen.llm && form.sources.article === "generate" ? (
            <ServicePicker
              group="Written by"
              missing="writing service"
              field="llm"
              family="llm"
              providers={providers}
              value={form.llm}
              onPick={(llm) => edit({ ...form, llm })}
            />
          ) : null}
        </Controls>
      );
    case "voice":
      return (
        <Controls>
          <Switch
            label="Level the volume"
            help="Evens the narration out to YouTube's loudness."
            checked={form.loudness?.enabled ?? true}
            onChange={(enabled) => edit({ ...form, loudness: { ...form.loudness, enabled } })}
          />
          <Switch
            label="Soften breaths"
            checked={form.removeBreaths === true}
            onChange={(removeBreaths) => edit({ ...form, removeBreaths })}
          />
          <Switch
            label="Soften S sounds"
            checked={form.deEss === true}
            onChange={(deEss) => edit({ ...form, deEss })}
          />
        </Controls>
      );
    case "pictures":
      return (
        <Controls>
          <Choice
            label="Images"
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
          {form.sources.images === "generate" ? (
            <Switch
              label="Scenes from the article"
              help="Each image shows what the narration says at that moment."
              checked={form.imageScenes === true}
              onChange={(imageScenes) => edit({ ...form, imageScenes })}
            />
          ) : null}
          {unchosen.images && form.sources.images === "generate" ? (
            <ServicePicker
              group="Made by"
              missing="image service"
              field="images"
              family="image"
              providers={providers}
              value={form.images}
              onPick={(images) => edit({ ...form, images })}
            />
          ) : null}
        </Controls>
      );
    case "video":
      return (
        <Controls>
          <Choice
            label="Shape"
            wide
            value={form.format}
            options={[
              { value: "16:9", label: "Landscape 16:9" },
              { value: "9:16", label: "Vertical 9:16" },
              { value: "1:1", label: "Square 1:1" },
            ]}
            onChange={(format) => edit({ ...form, format })}
          />
          <Choice
            label="Captions"
            value={form.subtitles.mode}
            options={[
              { value: "off", label: "Off" },
              { value: "burn-in", label: "On the video" },
              { value: "files", label: "As a file" },
            ]}
            onChange={(mode) => edit({ ...form, subtitles: { ...form.subtitles, mode } })}
          />
          <Choice
            label="Image motion"
            value={form.motionStyle}
            options={[
              { value: "zoom", label: "Zoom" },
              { value: "pan", label: "Pan" },
              { value: "mixed", label: "Mixed" },
              { value: "still", label: "Still" },
            ]}
            onChange={(motionStyle) => edit({ ...form, motionStyle })}
          />
          <Field label="Seconds per image">
            <Input
              inputMode="decimal"
              className="sl-input--number"
              value={form.imageSeconds}
              onChange={(event) => edit({ ...form, imageSeconds: event.target.value })}
            />
          </Field>
        </Controls>
      );
    case "thumbnail":
      return (
        <Controls>
          <Choice
            label="Thumbnail"
            wide
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
          <Choice
            label="Thumbnails per video"
            value={String(form.thumbnailCount ?? 1) as "1" | "3"}
            options={[
              { value: "1", label: "One" },
              { value: "3", label: "Three to compare" },
            ]}
            onChange={(count) => edit({ ...form, thumbnailCount: count === "3" ? 3 : 1 })}
          />
        </Controls>
      );
    case "document":
      return (
        <Controls>
          <Choice
            label="PDF"
            value={form.sources.document === "generate" ? "generate" : "off"}
            options={[
              { value: "off", label: "Off" },
              { value: "generate", label: "Make a PDF of the article" },
            ]}
            onChange={(document) => edit(sources({ document }))}
          />
        </Controls>
      );
    default:
      return null;
  }
}

// Who makes a section nobody chose one in, and no default of this computer stands in for: the
// group's name ("Written by"), then the service and model pickers, saying in red, in the
// checks' words, that a run can't start yet.
function ServicePicker({
  group,
  missing,
  field,
  family,
  providers,
  value,
  onPick,
}: {
  readonly group: string;
  // What the checks call it: "writing service".
  readonly missing: string;
  readonly field: "llm" | "images";
  readonly family: "llm" | "image";
  readonly providers: readonly ProviderStatus[];
  readonly value: { readonly provider: string; readonly model: string };
  readonly onPick: (next: { provider: string; model: string }) => void;
}): ReactElement {
  return (
    <fieldset className="sl-fields__wide m-0 min-w-0 border-0 p-0">
      <legend className="sl-kicker mb-2 p-0">{group}</legend>
      <div className="sl-fields">
        <ProviderPicker
          field={`${field}.provider`}
          label="Service"
          family={family}
          providers={providers}
          value={value.provider}
          problem={
            value.provider === "" ? `No ${missing} is chosen, so a run can't start.` : undefined
          }
          onPick={(provider) => onPick({ provider, model: "" })}
        />
        <ModelPicker
          field={`${field}.model`}
          label="Model"
          provider={value.provider}
          value={value.model}
          problem={undefined}
          onPick={(model) => onPick({ provider: value.provider, model })}
        />
      </div>
    </fieldset>
  );
}

function TitlePattern({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (title: string) => void;
}): ReactElement {
  return (
    <Field label="Video title" help="{{Topic}} is filled with each video's topic.">
      <Input value={value} maxLength={200} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function Controls({ children }: { readonly children: ReactNode }): ReactElement {
  return (
    <div data-slot="studio-controls" className="sl-fields">
      {children}
    </div>
  );
}

// A choice row with its name shown above it, the way a field's label is, so a row of presets
// never stands unlabelled (Shape, Captions, Image motion read alike as bare buttons).
function Choice<T extends string>({
  label,
  wide = false,
  ...rest
}: {
  readonly label: string;
  // Spans the row, for a choice whose options need the room ("Landscape 16:9").
  readonly wide?: boolean;
  readonly value: T;
  readonly options: readonly SegmentedOption<T>[];
  readonly onChange: (next: T) => void;
  readonly help?: string;
}): ReactElement {
  return (
    <div className={wide ? "sl-field sl-fields__wide" : "sl-field"} data-slot="studio-choice">
      <span className="sl-field__label" aria-hidden="true">
        {label}
      </span>
      <Segmented label={label} {...rest} />
    </div>
  );
}
