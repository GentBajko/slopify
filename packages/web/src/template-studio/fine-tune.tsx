import { topicKeywords } from "@app/slices/project-templates/one-off.js";
import type { TemplateSection } from "@app/slices/template-studio/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Field, Input } from "@/components/kit/field";
import { TextLink } from "@/components/kit/link";
import { PlayLanguage } from "@/language/play-language";
import { usePlayDraft } from "@/lib/form-drafts";
import { admission, keywordOrigins } from "@/play/admission";
import { CheckpointControls } from "@/play/checkpoints";
import { ContentSection } from "@/play/content-section";
import { usePlaySession } from "@/play/draft-context";
import { KeywordBlock } from "@/play/keywords";
import { ImagesSection, NarrationSection, VideoSection } from "@/play/outputs-section";
import type { RailProps } from "@/play/rail-frame";
import { PlayReviews } from "@/play/reviews";
import { DocumentRail, ThumbnailRail, VideoExtras } from "@/play/stage-rails";
import type { PlayFormState } from "@/play/state";
import { StyleSection } from "@/play/style-section";
import { templateLibrary } from "@/play/template-library";
import { entriesQuery, promptsQuery, providersQuery, settingsQuery, voicesQuery } from "@/queries";
import { subtitlesFor } from "@/subtitles/config";

// Fine-tune: every setting a section has, in Play's own editors, so the studio's few visible
// controls never hide one. Rendered inside `TemplateSession`, which binds them to the template.
export function FineTune({
  section,
  onFiles,
}: {
  readonly section: TemplateSection;
  readonly onFiles: () => void;
}): ReactElement {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const voices = useQuery(voicesQuery(api));
  const settings = useQuery(settingsQuery(api));
  const [form, setForm] = usePlayDraft();
  const { document } = usePlaySession();
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
  const controls: RailProps = {
    form,
    providers: providers.data?.providers ?? [],
    prompts: choices.prompts,
    voices: voices.data?.voices ?? [],
    silenceGapSeconds,
    problem,
    update,
    onPickFiles: onFiles,
    onRemoveFile: (kind, key) =>
      setForm((current) => ({
        ...current,
        provided:
          kind === "images"
            ? {
                ...current.provided,
                images: current.provided.images.filter((image) => image.key !== key),
              }
            : { ...current.provided, [kind]: undefined },
      })),
    onReattachFile: onFiles,
  };
  const topics = topicKeywords(form.title);
  switch (section) {
    case "subject":
      return (
        <div className="flex min-w-0 flex-col gap-4 py-4">
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
      return <ContentSection {...controls} entries={choices.entries} onLibrary={() => undefined} />;
    case "voice":
      return (
        <NarrationSection
          {...controls}
          entries={choices.entries}
          onKeyword={() => undefined}
          onSettings={() => undefined}
        />
      );
    case "pictures":
      return <ImagesSection {...controls} />;
    case "video":
      return (
        <>
          <VideoSection {...controls} problemOf={problem} />
          <StyleSection problem={problem} />
        </>
      );
    case "thumbnail":
      return <ThumbnailRail {...controls} />;
    case "shorts":
    case "upload":
      return <VideoExtras {...controls} />;
    case "document":
      return <DocumentRail {...controls} />;
    case "reviews":
      return (
        <div className="flex min-w-0 flex-col gap-4 py-4">
          <CheckpointControls problem={problem} />
          <PlayReviews problem={problem} />
        </div>
      );
    case "schedule":
      return (
        <p className="m-0 py-4 text-small text-ink-2">
          When and how often it runs, and its topics, are set on its schedule:{" "}
          <TextLink to="/calendar" search={{ tab: "schedules" }}>
            Calendar → Schedules
          </TextLink>
          .
        </p>
      );
  }
}

export function TitlePattern({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (title: string) => void;
}): ReactElement {
  return (
    <Field
      label="Title"
      help="{{Topic}} is filled with each video's topic."
      tip="play.title-pattern"
    >
      <Input value={value} maxLength={200} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}
