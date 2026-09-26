import { type MotionStyle, motionStyles } from "@app/slices/admission/model.js";
import { motionStyleLabels } from "@app/slices/admission/rules.js";
import { Link } from "@tanstack/react-router";
import { DocumentThemePicker } from "@/components/document-theme-picker";
import { InfoTip } from "@/components/kit/info-tip";
import { Input } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import { ImageProviderControls } from "@/play/media-rails";
import { LabelledField, OptionPicker } from "@/play/pickers";
import { FilePick, PasteArea } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { promptNames, railBeneath, railControls, SourceSwitch, StageRail } from "@/play/rail-frame";
import { YoutubeDescription } from "@/play/youtube-description";

export function ResearchRail({ form, problem, update }: RailProps) {
  return (
    <StageRail kind="research" name="Research" dim={form.sources.research === "off"}>
      <SourceSwitch kind="research" form={form} update={update} />
      <div className={railControls}>
        {form.sources.research === "generate" ? (
          <span className="engraved text-ink3">Runs through the LLM, one agent per chapter</span>
        ) : null}
      </div>
      {form.sources.research === "provide" ? (
        <div className={railBeneath}>
          <PasteArea
            field="provided.research"
            label="Research notes"
            value={form.provided.research}
            placeholder="Paste the notes the article will be written from."
            problem={problem("provided.research")}
            onChange={(research) => {
              update({ provided: { ...form.provided, research } });
            }}
          />
        </div>
      ) : null}
    </StageRail>
  );
}

export function ArticleRail({ form, prompts, problem, update }: RailProps) {
  return (
    <StageRail kind="article" name="Article" dim={false}>
      <SourceSwitch kind="article" form={form} update={update} />
      <div className={`${railBeneath} grid gap-4`}>
        {form.sources.article === "generate" ? (
          <OptionPicker
            field="articlePrompt"
            label="Article prompt"
            value={form.articlePrompt}
            placeholder="Pick a prompt"
            options={promptNames(prompts, "article")}
            problem={problem("articlePrompt")}
            onPick={(articlePrompt) => {
              update({ articlePrompt });
            }}
          />
        ) : null}
      </div>
      {form.sources.article === "provide" ? (
        <div className={railBeneath}>
          <PasteArea
            field="provided.article"
            label="Article text"
            value={form.provided.article}
            placeholder="Paste the article that will be narrated."
            problem={problem("provided.article")}
            onChange={(article) => {
              update({ provided: { ...form.provided, article } });
            }}
          />
        </div>
      ) : null}
    </StageRail>
  );
}

export function ThumbnailRail({
  form,
  providers,
  prompts,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
}: RailProps) {
  const generating =
    form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm";

  return (
    <StageRail kind="thumbnail" name="Thumbnail" dim={form.sources.thumbnail === "off"}>
      <SourceSwitch kind="thumbnail" form={form} update={update} />
      <div className={railControls}>
        {generating && form.sources.images !== "generate" ? (
          <ImageProviderControls
            form={form}
            providers={providers}
            problem={problem}
            update={update}
          />
        ) : null}
        {generating ? (
          <OptionPicker
            field="thumbnailPrompt"
            label="Thumbnail prompt"
            value={form.thumbnailPrompt}
            placeholder="Pick a prompt"
            options={promptNames(prompts, "thumbnail")}
            problem={problem("thumbnailPrompt")}
            onPick={(thumbnailPrompt) => {
              update({ thumbnailPrompt });
            }}
          />
        ) : null}
      </div>
      {form.sources.thumbnail === "provide" ? (
        <div className={railBeneath}>
          <FilePick
            field="provided.thumbnail"
            label="Thumbnail image"
            accept="image/png,image/jpeg,image/webp"
            uploads={form.provided.thumbnail === undefined ? [] : [form.provided.thumbnail]}
            problem={problem("provided.thumbnail")}
            onPick={(files) => {
              onPickFiles("thumbnail", files);
            }}
            onReattach={
              onReattachFile ? (key, file) => onReattachFile("thumbnail", key, file) : undefined
            }
            onRemove={(key) => {
              onRemoveFile("thumbnail", key);
            }}
          />
        </div>
      ) : null}
    </StageRail>
  );
}

// Edit project → Inputs says the same under its own Motion select.
const motionHint = "How each image moves while it's on screen.";

export type TimingField = "imageSeconds" | "zoomPercent" | "edgeSilenceSeconds";

// Raw text for the timing fields, edited in the draft document itself so what was typed
// survives a reload; without it the fields write numbers through `update`.
export type RawTiming = Readonly<Record<TimingField, string>> & {
  readonly onChange: (field: TimingField, value: string) => void;
};

export function VideoRail({
  form,
  prompts,
  silenceGapSeconds,
  problem,
  update,
  rawTiming,
}: RailProps & { readonly rawTiming?: RawTiming }) {
  const explanation =
    form.sources.video === "generate"
      ? form.sources.audio === "off"
        ? "Silent video · each image shown once"
        : `Images and narration · ${String(silenceGapSeconds)} s segment gaps`
      : form.sources.audio !== "off"
        ? "Combined WAV export with narration and segment gaps"
        : "Download each enabled stage separately";
  const timing = (field: TimingField) => ({
    value: rawTiming ? rawTiming[field] : Number.isFinite(form[field]) ? String(form[field]) : "",
    onChange: (value: string) => {
      if (rawTiming) rawTiming.onChange(field, value);
      else update({ [field]: value.trim() === "" ? Number.NaN : Number(value) });
    },
  });

  return (
    <StageRail kind="video" name="Export" dim={form.sources.video === "off"}>
      <SourceSwitch kind="video" form={form} update={update} />
      <span className={railControls}>
        <span className="engraved text-ink3">{explanation}</span>
      </span>
      {form.sources.video === "generate" || form.sources.audio !== "off" ? (
        <div className={railControls}>
          {form.sources.video === "generate" ? (
            <NumberField
              field="imageSeconds"
              label="Seconds per image"
              help="Each image stays on screen this long, then the next one; after the last image they start again."
              step={1}
              problem={problem("imageSeconds")}
              {...timing("imageSeconds")}
            />
          ) : null}
          {form.sources.video === "generate" ? (
            <NumberField
              field="zoomPercent"
              label="Zoom (%)"
              help="How far each image zooms in or out over its time on screen. 0 keeps images still."
              step={0.5}
              problem={problem("zoomPercent")}
              {...timing("zoomPercent")}
            />
          ) : null}
          {form.sources.video === "generate" ? (
            <LabelledField label="Motion" problem={undefined} inline>
              {({ id }) => (
                <>
                  <Picker
                    id={id}
                    data-play-field="motionStyle"
                    className="w-auto min-w-[120px]"
                    value={form.motionStyle}
                    onChange={(event) => update({ motionStyle: event.target.value as MotionStyle })}
                  >
                    {motionStyles.map((style) => (
                      <option key={style} value={style}>
                        {motionStyleLabels[style]}
                      </option>
                    ))}
                  </Picker>
                  <InfoTip label="motion">
                    <p>{motionHint}</p>
                  </InfoTip>
                </>
              )}
            </LabelledField>
          ) : null}
          {form.sources.audio !== "off" ? (
            <NumberField
              field="edgeSilenceSeconds"
              label="Silence at start and end (seconds)"
              help="Quiet time before the narration starts and after it ends."
              step={0.5}
              problem={problem("edgeSilenceSeconds")}
              {...timing("edgeSilenceSeconds")}
            />
          ) : null}
        </div>
      ) : null}
      <div className={railBeneath}>
        <YoutubeDescription
          enabled={form.youtubeDescription === true}
          prompt={form.descriptionPrompt ?? ""}
          prompts={prompts}
          narrated={form.sources.audio !== "off"}
          problem={problem}
          onChange={(next) => update(next)}
        />
      </div>
      {form.sources.images === "off" ? (
        <p className={`${railBeneath} text-small text-ink2`}>
          Video is Off because Images is Off. Generate or provide images to enable video.
        </p>
      ) : null}
    </StageRail>
  );
}

function NumberField({
  field,
  label,
  help,
  step,
  problem,
  value,
  onChange,
}: {
  readonly field: string;
  readonly label: string;
  readonly help: string;
  readonly step: number;
  readonly problem: string | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <LabelledField label={label} problem={problem} inline>
      {({ id, describedBy }) => (
        <>
          <Input
            id={id}
            data-play-field={field}
            type="text"
            inputMode={step < 1 ? "decimal" : "numeric"}
            className="w-[80px] tabular-nums"
            aria-invalid={problem !== undefined}
            aria-describedby={describedBy}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          <InfoTip label={label.toLowerCase()}>
            <p>{help}</p>
          </InfoTip>
        </>
      )}
    </LabelledField>
  );
}

// The PDF is laid out locally from the article and title, so nothing here needs a provider.
export function DocumentRail({ form, update }: RailProps) {
  const off = form.sources.document === "off";
  return (
    <StageRail kind="document" name="Document" dim={off}>
      <SourceSwitch kind="document" form={form} update={update} />
      <div className={railControls}>
        <LabelledField label="Theme" problem={undefined} inline>
          {({ id }) => (
            <span className="flex flex-wrap items-center gap-3">
              <DocumentThemePicker
                id={id}
                field="document.theme"
                className="w-auto min-w-[120px]"
                disabled={off}
                value={form.document}
                onChange={(document) => {
                  update({ document });
                }}
              />
              <Link to="/document-themes" className="text-small text-run-text underline">
                Edit themes
              </Link>
            </span>
          )}
        </LabelledField>
      </div>
    </StageRail>
  );
}
