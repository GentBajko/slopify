import { RailGroup } from "@/components/rail";
import { AudioRail, ImageProviderControls, ImagesRail } from "@/play/media-rails";
import { OptionPicker } from "@/play/pickers";
import { FilePick, PasteArea } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { promptNames, railBeneath, railControls, SourceSwitch, StageRail } from "@/play/rail-frame";

// The left column of Play: six rails sharing their borders, each with its lamp, glyph,
// name, source switch and that source's controls.

export function StageRails(props: RailProps) {
  const { form } = props;

  return (
    <RailGroup>
      {/* Research only feeds article writing, so a provided article
          hides the rail rather than leaving a switch that changes nothing. */}
      {form.sources.article === "provide" ? null : <ResearchRail {...props} />}
      <ArticleRail {...props} />
      <AudioRail {...props} />
      <ImagesRail {...props} />
      <ThumbnailRail {...props} />
      <VideoRail {...props} />
    </RailGroup>
  );
}

function ResearchRail({ form, problem, update }: RailProps) {
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

function ArticleRail({ form, prompts, problem, update }: RailProps) {
  return (
    <StageRail kind="article" name="Article" dim={false}>
      <SourceSwitch kind="article" form={form} update={update} />
      <div className={railControls}>
        {form.sources.article === "generate" ? (
          <OptionPicker
            label="Article prompt"
            inline
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

function ThumbnailRail({
  form,
  providers,
  prompts,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
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
            label="Thumbnail prompt"
            inline
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
            label="Thumbnail image"
            accept="image/png,image/jpeg,image/webp"
            uploads={form.provided.thumbnail === undefined ? [] : [form.provided.thumbnail]}
            problem={problem("provided.thumbnail")}
            onPick={(files) => {
              onPickFiles("thumbnail", files);
            }}
            onRemove={(key) => {
              onRemoveFile("thumbnail", key);
            }}
          />
        </div>
      ) : null}
    </StageRail>
  );
}

function VideoRail({ form, silenceGapSeconds, update }: RailProps) {
  const explanation =
    form.sources.video === "generate"
      ? form.sources.audio === "off"
        ? "Silent video · 5 seconds per image"
        : `Images and narration · ${String(silenceGapSeconds)} s segment gaps`
      : form.sources.audio !== "off"
        ? "Combined WAV export with narration and segment gaps"
        : "Download each enabled stage separately";

  return (
    <StageRail kind="video" name="Video" dim={form.sources.video === "off"}>
      <SourceSwitch kind="video" form={form} update={update} />
      <span className={railControls}>
        <span className="engraved text-ink3">{explanation}</span>
      </span>
      {form.sources.images === "off" ? (
        <p className={`${railBeneath} text-small text-ink2`}>
          Video is Off because Images is Off. Generate or provide images to enable video.
        </p>
      ) : null}
    </StageRail>
  );
}
