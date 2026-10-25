import { type MotionStyle, motionStyles } from "@app/slices/admission/model.js";
import { motionStyleLabels } from "@app/slices/admission/rules.js";
import { usesScriptPrompt } from "@app/slices/voices/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { readStudioSettings } from "@/api";
import { useApp } from "@/app-context";
import { DocumentThemePicker } from "@/components/document-theme-picker";
import { HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { Picker } from "@/components/ui/picker";
import type { HelpId } from "@/help/catalog";
import { ImageProviderControls } from "@/play/media-rails";
import { LabelledField, OptionPicker } from "@/play/pickers";
import { FilePick, PasteArea } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { promptNames, SourceSwitch, StageRail } from "@/play/rail-frame";
import { freshShorts, Shorts, shortsPreviewOf } from "@/play/shorts";
import { shortsOn } from "@/play/state";
import { YoutubeDescription } from "@/play/youtube-description";
import { PostSettings } from "@/social/post-settings";
import { formSocial, shortsOf } from "@/social/studio-post-settings";
import { studioSettingsKey } from "@/studio/settings-panel";
import { useVideoEditControls } from "@/video/edit-controls";
import { StylePreview } from "@/video/style-preview";
import { PlayAmbientBed } from "./ambient-bed";
import { articleKind } from "./article-kind";
import { ArticleTaskSwitch, articleTaskOf, SpokenText } from "./article-task";
import { OutputTick } from "./output-tick";
import { PromptCards } from "./prompt-cards";
import { ThumbnailCountPicker } from "./thumbnail-count.js";

export function ResearchRail({ form, problem, update }: RailProps) {
  return (
    <StageRail
      kind="research"
      name="Research"
      dim={form.sources.research === "off"}
      source={<SourceSwitch kind="research" form={form} update={update} />}
      note={
        form.sources.research === "generate"
          ? "The AI plans chapters and looks each one up on the web before it writes: a few more AI calls."
          : undefined
      }
    >
      {form.sources.research === "provide" ? (
        <PasteArea
          field="provided.research"
          label="Research notes"
          tip="play.provided.research"
          value={form.provided.research}
          placeholder="Paste the notes the article will be written from."
          problem={problem("provided.research")}
          onChange={(research) => {
            update({ provided: { ...form.provided, research } });
          }}
        />
      ) : null}
    </StageRail>
  );
}

export function ArticleRail({ form, prompts, problem, update, titled }: RailProps) {
  return (
    <StageRail
      kind="article"
      name="Article"
      dim={false}
      titled={titled}
      source={<ArticleTaskSwitch form={form} update={update} />}
    >
      {form.sources.article === "generate" ? (
        <PromptCards
          field="articlePrompt"
          label={usesScriptPrompt(form) ? "Script prompt" : "Article prompt"}
          kind={articleKind(form)}
          prompts={prompts}
          value={form.articlePrompt}
          problem={problem("articlePrompt")}
          onPick={(articlePrompt) => {
            update({ articlePrompt });
          }}
        />
      ) : null}
      {form.sources.article === "provide" ? (
        <div className="min-w-0">
          <PasteArea
            field="provided.article"
            label="Article text"
            tip="play.provided.article"
            value={form.provided.article}
            placeholder="Paste the article that will be narrated."
            problem={problem("provided.article")}
            onChange={(article) => {
              update({ provided: { ...form.provided, article } });
            }}
          />
          <p className="m-0 mt-1 text-label text-ink-3">
            {form.provided.article.trim() ? form.provided.article.trim().split(/\s+/).length : 0}{" "}
            words · {form.provided.article.length} characters
          </p>
          <SpokenText form={form} />
        </div>
      ) : null}
      {articleTaskOf(form) === "adapt" ? (
        <div className="min-w-0">
          <PasteArea
            field="provided.research"
            label="Your text"
            tip="play.provided.research"
            value={form.provided.research}
            placeholder="Paste the text the article prompt will rewrite."
            problem={problem("provided.research")}
            onChange={(research) => {
              update({ provided: { ...form.provided, research } });
            }}
          />
          <p className="mt-2 mb-0 text-small text-ink-2">
            The article prompt rewrites this text; the narration reads the rewritten article. To
            read it first, tick Pause after the article under Pauses and checks.
          </p>
        </div>
      ) : null}
    </StageRail>
  );
}

// Outputs → Thumbnail: one tick; once ticked, how it is made and from what. Bare (Edit
// template, whose section leads with the source and the count), only who draws it, its prompt
// or its file.
export function ThumbnailRail({
  form,
  providers,
  prompts,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
  bare = false,
}: RailProps) {
  const generating =
    form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm";
  const made = (
    <>
      {generating ? (
        <div className="sl-fields">
          {form.sources.images !== "generate" ? (
            <ImageProviderControls
              form={form}
              providers={providers}
              problem={problem}
              update={update}
              label="Drawn by"
            />
          ) : null}
          <OptionPicker
            field="thumbnailPrompt"
            label="Thumbnail prompt"
            tip="play.thumbnail-prompt"
            value={form.thumbnailPrompt}
            placeholder="Pick a prompt"
            options={promptNames(prompts, "thumbnail")}
            problem={problem("thumbnailPrompt")}
            onPick={(thumbnailPrompt) => {
              update({ thumbnailPrompt });
            }}
          />
          {bare ? null : (
            <ThumbnailCountPicker
              value={form.thumbnailCount === 3 ? 3 : 1}
              onPick={(thumbnailCount) => {
                update({ thumbnailCount });
              }}
            />
          )}
        </div>
      ) : null}
      {form.sources.thumbnail === "provide" ? (
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
      ) : null}
    </>
  );
  if (bare) return made;
  return (
    <OutputTick
      field="sources.thumbnail"
      label="Thumbnail"
      help="The picture people see before they press play. A drawn one is one image call each."
      checked={form.sources.thumbnail !== "off"}
      onChange={(on) =>
        update({ sources: { ...form.sources, thumbnail: on ? "from_prompt" : "off" } })
      }
    >
      <SourceSwitch kind="thumbnail" form={form} update={update} without="off" />
      {made}
    </OutputTick>
  );
}

export type TimingField = "imageSeconds" | "zoomPercent" | "edgeSilenceSeconds";

// Raw text for the timing fields, edited in the draft document itself so what was typed
// survives a reload; without it the fields write numbers through `update`.
export type RawTiming = Readonly<Record<TimingField, string>> & {
  readonly onChange: (field: TimingField, value: string) => void;
};

export function timingOf(
  form: RailProps["form"],
  update: RailProps["update"],
  rawTiming: RawTiming | undefined,
) {
  return (field: TimingField) => ({
    value: rawTiming ? rawTiming[field] : Number.isFinite(form[field]) ? String(form[field]) : "",
    onChange: (value: string) => {
      if (rawTiming) rawTiming.onChange(field, value);
      else update({ [field]: value.trim() === "" ? Number.NaN : Number(value) });
    },
  });
}

// The Video stage's switch and the one sentence that says what the picked choice makes.
export function VideoRail({ form, update, titled }: Pick<RailProps, "form" | "update" | "titled">) {
  const narrated = form.sources.audio !== "off";
  const made =
    form.sources.video === "generate" && form.sources.images !== "off"
      ? narrated
        ? "The narration over the images, put together on this computer · free."
        : "A silent video, each image shown once, put together on this computer · free."
      : narrated
        ? "Sound only: the narration as one audio file."
        : "Each finished stage downloads on its own.";
  // Make the video is greyed while there are no images; the line says why.
  const note = form.sources.images === "off" ? `${made} A video needs images first.` : made;
  return (
    <StageRail
      kind="video"
      name="Video"
      dim={form.sources.video === "off"}
      titled={titled}
      source={<SourceSwitch kind="video" form={form} update={update} />}
      note={note}
    />
  );
}

// Under Video and style: how long each image stays, how it moves and is cut, its look, and the
// ambient sound under the narration.
export function ImagesAndCuts({
  form,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
  rawTiming,
  language,
}: Pick<
  RailProps,
  "form" | "problem" | "update" | "onPickFiles" | "onRemoveFile" | "onReattachFile"
> & {
  readonly rawTiming?: RawTiming;
  // The language the run is narrated in, the channel's when the draft picked none; a
  // language without word timing always cuts every N seconds.
  readonly language?: string | undefined;
}): ReactElement {
  const timing = timingOf(form, update, rawTiming);
  const edit = useVideoEditControls({
    value: form.videoEdit,
    narrated: form.sources.audio !== "off",
    imageProvider: form.images.provider,
    problem,
    language: language ?? form.language,
    onChange: (videoEdit) => update({ videoEdit }),
  });
  return (
    <section
      aria-label="Images and cuts"
      className="flex min-w-0 flex-col gap-4 border-b border-line py-4 last:border-b-0"
      {...helpScope}
    >
      <h4 className="m-0 text-body font-semibold">Images and cuts</h4>
      <div className="sl-fields">
        <NumberField
          field="imageSeconds"
          label="Seconds per image"
          step={1}
          problem={problem("imageSeconds")}
          {...timing("imageSeconds")}
        />
        <NumberField
          field="zoomPercent"
          label="Zoom (%)"
          step={0.5}
          problem={problem("zoomPercent")}
          {...timing("zoomPercent")}
        />
        <LabelledField label="Motion" problem={undefined}>
          {({ id }) => (
            <Picker
              id={id}
              data-play-field="motionStyle"
              className="w-full"
              value={form.motionStyle}
              onChange={(event) => update({ motionStyle: event.target.value as MotionStyle })}
            >
              {motionStyles.map((style) => (
                <option key={style} value={style}>
                  {motionStyleLabels[style]}
                </option>
              ))}
            </Picker>
          )}
        </LabelledField>
        {edit.cuts}
      </div>
      <HelpLine>
        Cuts that follow the narration wait for a sentence to end; when the images run out they
        start again.
      </HelpLine>
      {edit.look}
      {form.sources.audio !== "off" ? (
        <PlayAmbientBed
          form={form}
          problem={problem}
          update={update}
          onPickFiles={onPickFiles}
          onRemoveFile={onRemoveFile}
          onReattachFile={onReattachFile}
        />
      ) : null}
    </section>
  );
}

// Outputs → Post to other sites: one tick; once ticked, the sites and what each post carries.
// Nothing is posted for the person: Slopify fills a draft on each site and they press Post.
function PostToSites({
  form,
  prompts,
  update,
}: Pick<RailProps, "form" | "prompts" | "update">): ReactElement {
  const { api } = useApp();
  const [opened, setOpened] = useState(false);
  const studio = useQuery({
    queryKey: studioSettingsKey,
    queryFn: () => readStudioSettings(api),
  });
  const paired = studio.data === undefined ? undefined : studio.data.pairing.origin !== null;
  const on = form.social !== undefined || opened;
  return (
    <OutputTick
      field="social"
      label="Post to other sites"
      help={
        paired === false ? (
          <>
            Drafts only: Slopify fills each post and you press Post. It needs the Slopify Studio
            extension, which isn't set up yet ·{" "}
            <TextLink to="/settings" search={{ section: "studio" }}>
              Set it up ↗
            </TextLink>
          </>
        ) : (
          "Drafts only: Slopify fills each post and you press Post."
        )
      }
      checked={on}
      onChange={(next) => {
        setOpened(next);
        if (!next) update({ social: undefined });
      }}
    >
      <PostSettings
        value={form.social}
        prompts={prompts}
        shorts={shortsOf(form.shorts)}
        onChange={(social) => update({ social: formSocial(social) })}
      />
    </OutputTick>
  );
}

// The YouTube description, Shorts and posting to other sites: made from the narrated video,
// each one tick of the Outputs checklist.
export function VideoExtras({
  form,
  prompts,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
}: Pick<
  RailProps,
  "form" | "prompts" | "problem" | "update" | "onPickFiles" | "onRemoveFile" | "onReattachFile"
>) {
  if (form.sources.article === "off") return null;
  const narrated = form.sources.audio !== "off";
  return (
    <>
      {narrated || form.youtubeDescription === true ? (
        <YoutubeDescription
          enabled={form.youtubeDescription === true}
          prompt={form.descriptionPrompt ?? ""}
          prompts={prompts}
          narrated={narrated}
          problem={problem}
          onChange={(next) => update(next)}
        />
      ) : null}
      {narrated || form.shorts?.enabled === true ? (
        <Shorts
          value={form.shorts ?? freshShorts}
          prompts={prompts}
          narrated={narrated}
          problem={problem}
          musicName={form.provided.shortsMusic?.name}
          music={
            <div className="basis-full">
              <FilePick
                field="shorts.music"
                label="Background music (optional): an audio file, looped if shorter than a short"
                accept="audio/*"
                disabled={!shortsOn(form)}
                uploads={form.provided.shortsMusic === undefined ? [] : [form.provided.shortsMusic]}
                problem={problem("shorts.music")}
                onPick={(files) => onPickFiles("shortsMusic", files)}
                onReattach={
                  onReattachFile
                    ? (key, file) => onReattachFile("shortsMusic", key, file)
                    : undefined
                }
                onRemove={(key) => onRemoveFile("shortsMusic", key)}
              />
              <p className="mt-1 text-label text-ink-3">
                Plays at the volume above under every short and dips while the narrator speaks.
              </p>
            </div>
          }
          preview={
            <StylePreview
              settings={shortsPreviewOf(form.shorts ?? freshShorts, form.subtitles.fontId)}
            />
          }
          onChange={(shorts) => update({ shorts })}
        />
      ) : null}
      <PostToSites form={form} prompts={prompts} update={update} />
    </>
  );
}

export function NumberField({
  field,
  label,
  tip,
  placeholder,
  step,
  problem,
  value,
  onChange,
}: {
  readonly field: string;
  readonly label: string;
  readonly tip?: HelpId | undefined;
  readonly placeholder?: string | undefined;
  readonly step: number;
  readonly problem: string | undefined;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <LabelledField label={label} tip={tip} problem={problem}>
      {({ id, describedBy }) => (
        <Input
          id={id}
          data-play-field={field}
          type="text"
          inputMode={step < 1 ? "decimal" : "numeric"}
          className="sl-input--number"
          aria-invalid={problem !== undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </LabelledField>
  );
}

// Extras → PDF of the article: laid out locally from the article and title, so nothing here
// needs a provider. One tick; once ticked, its look, named as Edit template, Edit settings and
// Settings → Production defaults name it.
export function DocumentRail({ form, update }: RailProps) {
  if (form.sources.article === "off") return null;
  return (
    <OutputTick
      field="sources.document"
      label="PDF of the article"
      help="Laid out on this computer from the article and title · free."
      checked={form.sources.document === "generate"}
      onChange={(on) => update({ sources: { ...form.sources, document: on ? "generate" : "off" } })}
    >
      <LabelledField label="PDF look" problem={undefined}>
        {({ id }) => (
          <span className="flex flex-wrap items-center gap-3">
            <DocumentThemePicker
              id={id}
              field="document.theme"
              className="w-auto min-w-[160px]"
              disabled={false}
              value={form.document}
              onChange={(document) => {
                update({ document });
              }}
            />
            <TextLink to="/document-themes" className="text-small">
              Edit PDF looks ↗
            </TextLink>
          </span>
        )}
      </LabelledField>
    </OutputTick>
  );
}
