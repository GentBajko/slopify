import { topicKeywords } from "@app/slices/project-templates/one-off.js";
import type { ProviderChoices } from "@app/slices/project-templates/provider-defaults.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { PlayLanguage } from "@/language/play-language";
import { usePlayDraft } from "@/lib/form-drafts";
import { admission, keywordOrigins } from "@/play/admission";
import { CheckpointControls } from "@/play/checkpoints";
import { ContentSection } from "@/play/content-section";
import { usePlaySession } from "@/play/draft-context";
import { KeywordBlock } from "@/play/keywords";
import { ImagesSection, NarrationSection, VideoSection } from "@/play/outputs-section";
import { FilePick } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { PlayReviews } from "@/play/reviews";
import { freshShorts, Shorts, shortsPreviewOf } from "@/play/shorts";
import { DocumentRail, ThumbnailRail } from "@/play/stage-rails";
import { type PlayFormState, shortsOn } from "@/play/state";
import { templateLibrary } from "@/play/template-library";
import { YoutubeDescription } from "@/play/youtube-description";
import { entriesQuery, promptsQuery, providersQuery, settingsQuery, voicesQuery } from "@/queries";
import { PostSettings } from "@/social/post-settings";
import { formSocial, shortsOf } from "@/social/studio-post-settings";
import { subtitlesFor } from "@/subtitles/config";
import { StylePreview } from "@/video/style-preview";

// Every setting a section has, in Create's own editors and Create's words, laid out whole. Each
// setting is in one section only: Shorts holds the shorts, YouTube description and posts the
// description and each site's post, Narration whether tables and figures are also shown.
// Rendered inside `TemplateSession`, which binds the editors to the template. A writer or image
// service nobody chose shows this computer's default in its pickers, as every video made from
// the template gets it, and is saved with the template only once the person picks one.
export function FineTune({
  section,
  defaults,
  onFiles,
}: {
  readonly section: TemplateSection;
  readonly defaults: ProviderChoices;
  readonly onFiles: () => void;
}): ReactElement | null {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const voices = useQuery(voicesQuery(api));
  const settings = useQuery(settingsQuery(api));
  const [saved, setForm] = usePlayDraft();
  const { document } = usePlaySession();
  // Kind by kind, as `project-templates/provider-defaults.ts` fills every run of the template.
  const form: PlayFormState = {
    ...saved,
    ...(saved.llm.provider === "" && defaults.llm !== undefined
      ? { llm: { ...saved.llm, ...defaults.llm } }
      : {}),
    ...(saved.images.provider === "" && defaults.images !== undefined
      ? { images: { ...saved.images, ...defaults.images } }
      : {}),
  };
  const choices = templateLibrary(
    document.librarySnapshot,
    prompts.data?.prompts ?? [],
    entries.data?.entries ?? [],
  );
  const silenceGapSeconds = settings.data?.silenceGapSeconds ?? 3;
  const input = { form, prompts: choices.prompts, entries: choices.entries, silenceGapSeconds };
  const { fields, result } = admission(input);
  const errors = result.ok ? [] : result.fields;
  const problem = (field: string): string | undefined =>
    errors.find((error) => error.field === field || error.field.startsWith(`${field}.`))?.message;
  const update = (patch: Partial<PlayFormState>): void =>
    setForm((current) => {
      const next = { ...current, ...patch };
      return { ...next, subtitles: subtitlesFor(next.subtitles, next.sources) };
    });
  const onRemoveFile: RailProps["onRemoveFile"] = (kind, key) =>
    setForm((current) => ({
      ...current,
      provided:
        kind === "images"
          ? {
              ...current.provided,
              images: current.provided.images.filter((image) => image.key !== key),
            }
          : { ...current.provided, [kind]: undefined },
    }));
  const controls: RailProps = {
    form,
    providers: providers.data?.providers ?? [],
    prompts: choices.prompts,
    voices: voices.data?.voices ?? [],
    silenceGapSeconds,
    problem,
    update,
    onPickFiles: onFiles,
    onRemoveFile,
    onReattachFile: onFiles,
  };
  const topics = topicKeywords(form.title);
  const written = form.sources.article !== "off";
  switch (section) {
    case "subject":
      return (
        <div className="flex min-w-0 flex-col gap-4 py-2">
          <KeywordBlock
            fields={fields}
            origins={keywordOrigins(input)}
            topics={topics}
            hide={topics}
            values={form.values}
            problem={problem}
            onChange={(name, value) => update({ values: { ...form.values, [name]: value } })}
          />
          <PlayLanguage />
        </div>
      );
    case "script":
      return <ContentSection {...controls} entries={choices.entries} />;
    case "voice":
      return (
        <NarrationSection {...controls} entries={choices.entries} onKeyword={() => undefined} />
      );
    case "pictures":
      return <ImagesSection {...controls} />;
    case "video":
      return <VideoSection {...controls} problemOf={problem} />;
    case "thumbnail":
      return <ThumbnailRail {...controls} />;
    case "shorts":
      return written ? (
        <Shorts
          value={form.shorts ?? freshShorts}
          prompts={choices.prompts}
          narrated={form.sources.audio !== "off"}
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
                onPick={() => onFiles()}
                onReattach={() => onFiles()}
                onRemove={(key) => onRemoveFile("shortsMusic", key)}
              />
            </div>
          }
          preview={
            <StylePreview
              settings={shortsPreviewOf(form.shorts ?? freshShorts, form.subtitles.fontId)}
            />
          }
          onChange={(shorts) => update({ shorts })}
        />
      ) : (
        <NeedsArticle what="Shorts are cut from the narrated article" />
      );
    case "upload":
      return written ? (
        <div className="flex min-w-0 flex-col gap-4">
          <YoutubeDescription
            enabled={form.youtubeDescription === true}
            prompt={form.descriptionPrompt ?? ""}
            prompts={choices.prompts}
            narrated={form.sources.audio !== "off"}
            problem={problem}
            onChange={(next) => update(next)}
          />
          <div data-play-field="social">
            <PostSettings
              value={form.social}
              prompts={choices.prompts}
              shorts={shortsOf(form.shorts)}
              onChange={(social) => update({ social: formSocial(social) })}
            />
          </div>
        </div>
      ) : (
        <NeedsArticle what="The description and the posts are written from the article" />
      );
    case "reviews":
      return (
        <div className="flex min-w-0 flex-col gap-4">
          <CheckpointControls problem={problem} />
          <PlayReviews problem={problem} />
        </div>
      );
    case "document":
      return written ? (
        <DocumentRail {...controls} />
      ) : (
        <NeedsArticle what="The PDF lays out the article" />
      );
    // Schedule's runs are on the section itself (schedule-section.tsx).
    case "schedule":
      return null;
  }
}

function NeedsArticle({ what }: { readonly what: string }): ReactElement {
  return <p className="m-0 text-small text-ink-2">{`${what}: turn the article on in Article.`}</p>;
}
