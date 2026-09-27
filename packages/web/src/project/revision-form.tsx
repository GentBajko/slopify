import { stageKinds } from "@app/kernel/pipeline.js";
import { type MotionStyle, motionStyles, sourceOf } from "@app/slices/admission/model.js";
import {
  edgeSilenceSecondsMax,
  imageSecondsMax,
  imageSecondsMin,
  motionStyleLabels,
  silenceGapSecondsMax,
  titleMax,
  zoomPercentMax,
} from "@app/slices/admission/rules.js";
import { defaultSubtitles } from "@app/slices/subtitles/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { useApp } from "@/app-context";
import { channelQuery, defaultChannelId } from "@/channels/api";
import { DocumentThemePicker } from "@/components/document-theme-picker";
import { Button } from "@/components/kit/button";
import { Field, Input, Select, Textarea } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { Rule } from "@/components/kit/layout";
import type { HelpId } from "@/help/catalog";
import { RevisionLanguage } from "@/language/revision-language";
import { cn } from "@/lib/utils";
import { FormatPicker } from "@/play/format-picker";
import { sourceOptions } from "@/play/state";
import { entriesQuery, promptsQuery, providersQuery, voicesQuery } from "@/queries";
import { subtitlesFor } from "@/subtitles/config";
import { SubtitleControls } from "@/subtitles/controls";
import { useVideoEditControls } from "@/video/edit-controls";
import { StylePreview } from "@/video/style-preview";
import { EditChannel } from "./edit-channel.js";
import { editPreviewImageOf } from "./edit-preview-image.js";
import { EditAmbientBed } from "./edit-sound-and-scale.js";
import { changeSource, editOfForm } from "./revision-form-state.js";
import { RevisionNarration } from "./revision-narration.js";
import { RevisionPrompts } from "./revision-prompts.js";
import { RevisionProviders } from "./revision-providers.js";
import { RevisionReviews } from "./revision-reviews.js";
import { RevisionShorts } from "./revision-shorts.js";
import type { EditorProps, EditSection } from "./revision-workspace.js";
import { RevisionYoutube } from "./revision-youtube.js";

const stageLabels: Readonly<Record<(typeof stageKinds)[number], string>> = {
  research: "Research source",
  article: "Article source",
  audio: "Audio source",
  images: "Images source",
  thumbnail: "Thumbnail source",
  video: "Video source",
  document: "Document source",
};

const sourceTips = {
  research: "play.source.research",
  article: "play.source.article",
  audio: "play.source.audio",
  images: "play.source.images",
  thumbnail: "play.source.thumbnail",
  video: "play.source.video",
  document: "play.source.document",
} as const satisfies Readonly<Record<(typeof stageKinds)[number], HelpId>>;

// A group of settings inside a section: a sub-head, then its fields two to a row on desktop.
function Group({
  title,
  children,
  columns = true,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly columns?: boolean;
}) {
  return (
    <div className="space-y-4">
      <h3 className="m-0 text-title-3">{title}</h3>
      <div className={cn("grid min-w-0 gap-4", columns && "md:grid-cols-2")}>{children}</div>
    </div>
  );
}

export function RevisionForm(
  props: EditorProps & { readonly renderContent?: (props: EditorProps) => ReactNode },
): import("react").ReactElement {
  const { view, edit, onChange, onPending, fields } = props;
  const formId = useId();
  const [section, setSection] = useState<EditSection>(props.focus?.section ?? "inputs");
  // A change asked for from the project page opens the section it belongs to.
  useEffect(() => {
    if (props.focus !== undefined) setSection(props.focus.section);
  }, [props.focus]);
  const [pending, setPending] = useState({ font: false, content: false, music: false });
  useEffect(() => {
    onPending(pending.font || pending.content || pending.music);
  }, [onPending, pending]);
  const markFont = useCallback((active: boolean): void => {
    setPending((current) => (current.font === active ? current : { ...current, font: active }));
  }, []);
  const markContent = useCallback((active: boolean): void => {
    setPending((current) =>
      current.content === active ? current : { ...current, content: active },
    );
  }, []);
  const markMusic = useCallback((active: boolean): void => {
    setPending((current) => (current.music === active ? current : { ...current, music: active }));
  }, []);
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const voices = useQuery(voicesQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const { config } = edit;
  // The style preview draws on the establishing image or a cast picture, as Play's does.
  const cast = useQuery(channelQuery(api, config.channelId ?? defaultChannelId));
  const drawn = editPreviewImageOf(view, edit, cast.data?.cast ?? []);
  const problem = (field: string) =>
    fields.find(
      (one) =>
        one.field === field ||
        one.field === `config.${field}` ||
        one.field === `edit.config.${field}`,
    )?.message;
  // Cuts, transitions, the Look and animated images; an old project gets settings only once
  // one of them is changed.
  const videoEdit = useVideoEditControls({
    value: config.videoEdit,
    narrated: config.sources.audio !== "off",
    imageProvider: config.images?.provider ?? "",
    problem,
    language: config.language,
    onChange: (next) => onChange({ ...edit, config: { ...config, videoEdit: next } }),
  });
  const sections: readonly {
    readonly id: EditSection;
    readonly label: string;
    readonly badge?: string;
  }[] = [
    { id: "inputs", label: "Inputs" },
    { id: "article", label: "Article", ...(edit.content.articleEdited ? { badge: "edited" } : {}) },
    { id: "providers", label: "Providers" },
    { id: "prompts", label: "Prompts" },
    {
      id: "reviews",
      label: "Reviews",
      ...(config.reviews === undefined ? {} : { badge: "on" }),
    },
    ...(config.sources.audio !== "off" || config.shorts?.enabled === true
      ? [
          {
            id: "shorts" as const,
            label: "Shorts",
            ...(config.shorts?.enabled ? { badge: "on" } : {}),
          },
        ]
      : []),
    { id: "subtitles", label: "Subtitles" },
    { id: "images", label: "Images", badge: String(edit.content.imageOrder.length) },
    ...(config.sources.audio === "generate"
      ? [{ id: "narration" as const, label: "Narration" }]
      : []),
    {
      id: "captions",
      label: "Captions",
      ...(edit.content.subtitleCues === undefined
        ? {}
        : { badge: String(edit.content.subtitleCues.cues.length) }),
    },
  ];
  const current = sections.some((one) => one.id === section) ? section : "inputs";
  const panel = (id: EditSection) => cn("min-w-0 space-y-6", current === id ? undefined : "hidden");
  const number = (value: number) => (Number.isFinite(value) ? value : "");
  const video = config.sources.video !== "off";
  return (
    <div className="grid min-w-0 gap-8 md:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Edit sections" className="min-w-0 md:sticky md:top-16 md:self-start">
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:none] md:flex-col">
          {sections.map((one) => (
            <li key={one.id} className="shrink-0">
              <button
                type="button"
                aria-current={one.id === current ? "page" : undefined}
                onClick={() => setSection(one.id)}
                className={cn(
                  "flex min-h-9 w-full items-center justify-between gap-3 rounded-control px-3 text-left whitespace-nowrap",
                  one.id === current
                    ? "bg-raised font-semibold text-ink shadow-[inset_2px_0_0_var(--color-accent)]"
                    : "text-ink-2 hover:bg-raised hover:text-ink",
                )}
              >
                {one.label}
                {one.badge === undefined ? null : (
                  <span className="text-label font-normal text-ink-3">{one.badge}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-6">
        {Object.entries({
          providers: providers.error,
          voices: voices.error,
          prompts: prompts.error,
          entries: entries.error,
        }).flatMap(([name, error]) =>
          error === null
            ? []
            : [
                <p key={name} role="alert" className="m-0 text-small text-danger">
                  {error.message}
                </p>,
              ],
        )}
        {fields.length === 0 ? null : (
          <ul role="alert" className="m-0 space-y-1 pl-5 text-small text-danger">
            {fields.map((field) => (
              <li key={`${field.field}-${field.message}`}>
                {field.field}: {field.message}
              </li>
            ))}
          </ul>
        )}
        <section aria-label="Inputs" hidden={current !== "inputs"} className={panel("inputs")}>
          <Group title="Project">
            <Field label="Project title" error={problem("title")} className="md:col-span-2">
              <Input
                value={config.title}
                maxLength={titleMax}
                onChange={(event) =>
                  onChange({ ...edit, config: { ...config, title: event.target.value } })
                }
              />
            </Field>
            <div className="md:col-span-2">
              <FormatPicker
                value={config.format}
                onPick={(format) => onChange({ ...edit, config: { ...config, format } })}
              />
            </div>
          </Group>
          <Rule />
          <Group title="Channel" columns={false}>
            <EditChannel
              edit={edit}
              saved={view.revision.config}
              problem={problem}
              onChange={onChange}
            />
          </Group>
          <Rule />
          <Group title="Stages">
            {stageKinds.map((kind) => (
              <Field
                key={kind}
                label={stageLabels[kind]}
                tip={sourceTips[kind]}
                error={problem(`sources.${kind}`)}
              >
                <Select
                  value={sourceOf(config.sources, kind)}
                  onChange={(event) => {
                    const option = sourceOptions(kind).find(
                      (one) => one.value === event.target.value,
                    );
                    if (option === undefined) return;
                    const next = changeSource(edit, kind, option.value);
                    onChange(
                      kind === "article" &&
                        option.value === "provide" &&
                        !edit.content.articleEdited
                        ? {
                            ...next,
                            content: {
                              ...next.content,
                              articleMarkdown: view.articleMarkdown ?? edit.content.articleMarkdown,
                            },
                          }
                        : next,
                    );
                  }}
                >
                  {sourceOptions(kind).map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={
                        kind === "video" &&
                        option.value === "generate" &&
                        config.sources.images === "off"
                      }
                    >
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            {config.sources.images === "off" ? (
              <p className="m-0 text-small text-ink-2 md:col-span-2">
                Images are Off. Video is also Off in these changes.
              </p>
            ) : null}
            <Field label="Document theme" id={`${formId}-document-theme`} tip="play.document-theme">
              <DocumentThemePicker
                id={`${formId}-document-theme`}
                disabled={sourceOf(config.sources, "document") === "off"}
                value={config.document}
                onChange={(document) => {
                  onChange({ ...edit, config: { ...config, document } });
                }}
              />
            </Field>
          </Group>
          <Rule />
          <Group title="Timing">
            <Field
              label="Silence gap (seconds)"
              tip="play.silence-gap"
              error={problem("silenceGapSeconds")}
            >
              <Input
                type="number"
                min={0}
                max={silenceGapSecondsMax}
                step={0.1}
                value={number(config.silenceGapSeconds)}
                onChange={(event) =>
                  onChange({
                    ...edit,
                    config: { ...config, silenceGapSeconds: Number(event.target.value) },
                  })
                }
              />
            </Field>
            {config.sources.audio === "off" ? null : (
              <Field
                label="Silence at start and end (seconds)"
                tip="play.edge-silence"
                error={problem("edgeSilenceSeconds")}
              >
                <Input
                  type="number"
                  min={0}
                  max={edgeSilenceSecondsMax}
                  step={0.5}
                  value={number(config.edgeSilenceSeconds)}
                  onChange={(event) =>
                    onChange({
                      ...edit,
                      config: { ...config, edgeSilenceSeconds: Number(event.target.value) },
                    })
                  }
                />
              </Field>
            )}
            {video ? (
              <Field
                label="Seconds per image"
                tip="play.image-seconds"
                error={problem("imageSeconds")}
              >
                <Input
                  type="number"
                  min={imageSecondsMin}
                  max={imageSecondsMax}
                  step={1}
                  value={number(config.imageSeconds)}
                  onChange={(event) =>
                    onChange({
                      ...edit,
                      config: { ...config, imageSeconds: Number(event.target.value) },
                    })
                  }
                />
              </Field>
            ) : null}
            {video ? (
              <Field label="Zoom (%)" tip="play.zoom" error={problem("zoomPercent")}>
                <Input
                  type="number"
                  min={0}
                  max={zoomPercentMax}
                  step={0.5}
                  value={number(config.zoomPercent)}
                  onChange={(event) =>
                    onChange({
                      ...edit,
                      config: { ...config, zoomPercent: Number(event.target.value) },
                    })
                  }
                />
              </Field>
            ) : null}
            {video ? (
              <Field label="Motion" tip="play.motion">
                <Select
                  value={config.motionStyle}
                  onChange={(event) =>
                    onChange({
                      ...edit,
                      config: { ...config, motionStyle: event.target.value as MotionStyle },
                    })
                  }
                >
                  {motionStyles.map((style) => (
                    <option key={style} value={style}>
                      {motionStyleLabels[style]}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </Group>
          {video ? (
            <>
              <Rule />
              <Group title="Cuts and look" columns={false}>
                {videoEdit.cuts}
                {videoEdit.look}
              </Group>
              {config.sources.audio === "off" ? null : (
                <>
                  <Rule />
                  <Group title="Ambient sound" columns={false}>
                    <EditAmbientBed edit={edit} problem={problem} onChange={onChange} />
                  </Group>
                </>
              )}
            </>
          ) : null}
          <Rule />
          <Group title="Intro and outro">
            {(["intro", "outro"] as const).map((category) => (
              <Field
                key={category}
                label={category === "intro" ? "Intro" : "Outro"}
                tip={category === "intro" ? "play.intro" : "play.outro"}
              >
                <Select
                  value={config[category]?.name ?? ""}
                  onChange={(event) => {
                    const selected = entries.data?.entries.find(
                      (entry) => entry.category === category && entry.name === event.target.value,
                    );
                    const next = { ...config };
                    if (selected === undefined) delete next[category];
                    else next[category] = { name: selected.name, mode: selected.mode };
                    onChange(
                      editOfForm({
                        ...edit,
                        config: next,
                        content:
                          selected === undefined
                            ? edit.content
                            : {
                                ...edit.content,
                                promptTemplates: {
                                  ...edit.content.promptTemplates,
                                  [category]: selected.body,
                                },
                              },
                      }),
                    );
                  }}
                >
                  <option value="">Off</option>
                  {config[category] !== undefined &&
                  !entries.data?.entries.some(
                    (entry) => entry.category === category && entry.name === config[category]?.name,
                  ) ? (
                    <option value={config[category]?.name}>
                      {config[category]?.name} (saved entry)
                    </option>
                  ) : null}
                  {entries.data?.entries
                    .filter((entry) => entry.category === category)
                    .map((entry) => (
                      <option key={entry.id} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                </Select>
              </Field>
            ))}
          </Group>
          {config.sources.research === "provide" ? (
            <>
              <Rule />
              <Group title="Research" columns={false}>
                <Field
                  label="Research notes"
                  tip="play.provided.research"
                  error={problem("provided.research")}
                >
                  <Textarea
                    rows={6}
                    value={config.provided.research ?? ""}
                    onChange={(event) =>
                      onChange({
                        ...edit,
                        config: {
                          ...config,
                          provided: { ...config.provided, research: event.target.value },
                        },
                      })
                    }
                  />
                </Field>
              </Group>
            </>
          ) : null}
        </section>
        <section aria-label="Article" hidden={current !== "article"} className={panel("article")}>
          <Field
            label="Article text"
            tip="project.edit.article-text"
            error={problem("content.articleMarkdown") ?? problem("provided.article")}
            help={
              edit.content.articleEdited
                ? "Your edited article is kept when other settings change. Regenerating it replaces it after the rebuild review."
                : undefined
            }
          >
            <Textarea
              rows={12}
              maxLength={500000}
              value={
                (edit.content.articleEdited
                  ? edit.content.articleMarkdown
                  : view.articleMarkdown) ??
                edit.content.articleMarkdown ??
                config.provided.article ??
                ""
              }
              onChange={(event) =>
                onChange({
                  ...edit,
                  content: {
                    ...edit.content,
                    articleMarkdown: event.target.value,
                    articleEdited: true,
                  },
                })
              }
            />
          </Field>
          {config.sources.article === "generate" ? (
            <div className="flex items-center gap-1">
              <Button
                onClick={() =>
                  onChange({
                    ...edit,
                    regenerate: [...new Set([...(edit.regenerate ?? []), "article:body"])],
                  })
                }
              >
                Regenerate article after review
              </Button>
              <InfoTip id="project.edit.regenerate-article" />
            </div>
          ) : null}
        </section>
        <section
          aria-label="Providers"
          hidden={current !== "providers"}
          className={panel("providers")}
        >
          <RevisionLanguage edit={edit} error={problem("language")} onChange={onChange} />
          <RevisionProviders
            projectId={view.revision.projectId}
            edit={edit}
            providers={providers.data?.providers ?? []}
            voices={voices.data?.voices ?? []}
            onChange={onChange}
          />
          <RevisionNarration
            edit={edit}
            view={view}
            prompts={prompts.data?.prompts ?? []}
            error={problem("narrationPrompt")}
            onChange={onChange}
          />
        </section>
        <section aria-label="Prompts" hidden={current !== "prompts"} className={panel("prompts")}>
          <RevisionYoutube
            edit={edit}
            view={view}
            prompts={prompts.data?.prompts ?? []}
            problem={problem}
            onChange={onChange}
          />
          <RevisionPrompts
            edit={edit}
            saved={view.revision.config.imagePrompts}
            prompts={prompts.data?.prompts ?? []}
            entries={entries.data?.entries ?? []}
            onChange={onChange}
          />
        </section>
        <section aria-label="Reviews" hidden={current !== "reviews"} className={panel("reviews")}>
          <RevisionReviews
            edit={edit}
            providers={providers.data?.providers ?? []}
            prompts={prompts.data?.prompts ?? []}
            problem={problem}
            onChange={onChange}
          />
        </section>
        <section aria-label="Shorts" hidden={current !== "shorts"} className={panel("shorts")}>
          <RevisionShorts
            edit={edit}
            view={view}
            prompts={prompts.data?.prompts ?? []}
            problem={problem}
            onChange={onChange}
            onPending={markMusic}
          />
        </section>
        <section
          aria-label="Subtitles"
          hidden={current !== "subtitles"}
          className={panel("subtitles")}
        >
          <div data-tour="project-subtitles">
            <SubtitleControls
              value={config.subtitles ?? defaultSubtitles}
              format={config.format}
              audioEnabled={config.sources.audio !== "off"}
              videoEnabled={video}
              onChange={(subtitles) =>
                onChange({
                  ...edit,
                  config: { ...config, subtitles: subtitlesFor(subtitles, config.sources) },
                })
              }
              onUploading={markFont}
              problem={problem}
            />
          </div>
          {/* Mounted only while the section is open: each change renders a few seconds of video. */}
          {current !== "subtitles" || !video ? null : (
            <StylePreview
              drawnOn={drawn?.drawnOn}
              settings={{
                format: config.format,
                subtitles: {
                  mode: (config.subtitles ?? defaultSubtitles).mode,
                  fontId: (config.subtitles ?? defaultSubtitles).fontId,
                  fontSize: (config.subtitles ?? defaultSubtitles).fontSize,
                  position: (config.subtitles ?? defaultSubtitles).position ?? "bottom",
                },
                videoEdit: config.videoEdit,
                image: drawn?.image,
              }}
            />
          )}
        </section>
        {props.renderContent?.({
          view,
          edit,
          fields,
          onChange,
          onPending: markContent,
          section: current,
        })}
      </div>
    </div>
  );
}
