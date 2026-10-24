import type { stageKinds } from "@app/kernel/pipeline.js";
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
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { Entry } from "@/api";
import { useApp } from "@/app-context";
import { channelQuery, defaultChannelId } from "@/channels/api";
import { DocumentThemePicker } from "@/components/document-theme-picker";
import { Button } from "@/components/kit/button";
import { Field, HelpLine, Input, Select, Textarea } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { RailButton } from "@/components/kit/rail";
import type { HelpId } from "@/help/catalog";
import { RevisionLanguage } from "@/language/revision-language";
import { stageWords } from "@/lib/stage-words";
import { cn } from "@/lib/utils";
import { ShowFiguresToggle } from "@/play/describe-figures";
import { FormatPicker } from "@/play/format-picker";
import { sourceOptions } from "@/play/state";
import { entriesQuery, promptsQuery, providersQuery, voicesQuery } from "@/queries";
import { subtitlesFor } from "@/subtitles/config";
import { SubtitleControls } from "@/subtitles/controls";
import { useVideoEditControls } from "@/video/edit-controls";
import { StylePreview } from "@/video/style-preview";
import { ArticleTextField } from "./article-text-field.js";
import { EditChannel } from "./edit-channel.js";
import { editPreviewImageOf } from "./edit-preview-image.js";
import { EditAmbientBed, EditLoudness, EditPauses } from "./edit-sound-and-scale.js";
import { revisionFileUrl } from "./revision-api.js";
import { changeSource, editOfForm } from "./revision-form-state.js";
import { RevisionNarration } from "./revision-narration.js";
import { type PromptPart, RevisionPrompts } from "./revision-prompts.js";
import { RevisionProviders } from "./revision-providers.js";
import { RevisionReviews } from "./revision-reviews.js";
import { RevisionShorts } from "./revision-shorts.js";
import type { EditorProps, EditSection } from "./revision-workspace.js";
import { RevisionYoutube } from "./revision-youtube.js";

const sourceTips = {
  research: "play.source.research",
  article: "play.source.article",
  audio: "play.source.audio",
  images: "play.source.images",
  thumbnail: "play.source.thumbnail",
  video: "play.source.video",
  document: "play.source.document",
} as const satisfies Readonly<Record<(typeof stageKinds)[number], HelpId>>;

// The intro or outro picker's value for "this project's version" of an entry the Library has
// changed since the project copied it.
const keptValue = "\u0000kept:";

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
  props: EditorProps & {
    readonly renderContent?: (props: EditorProps) => ReactNode;
    // The section an address opened the settings on.
    readonly opening?: EditSection | undefined;
    // The pauses for this run, at the top of Pauses and checks: they take effect at once.
    readonly checks?: ReactNode;
  },
): ReactElement {
  const { view, edit, onChange, onPending, fields } = props;
  const formId = useId();
  const [section, setSection] = useState<EditSection>(
    props.focus?.section ?? props.opening ?? "title",
  );
  // A change asked for from the project page opens the section it belongs to; Rename puts
  // the cursor in the title.
  const titleField = useRef<HTMLInputElement>(null);
  const [renaming, setRenaming] = useState(0);
  useEffect(() => {
    if (props.focus === undefined) return;
    setSection(props.focus.section);
    if (props.focus.section === "title") setRenaming((count) => count + 1);
  }, [props.focus]);
  // Once the title's section is on screen.
  useEffect(() => {
    if (renaming > 0) titleField.current?.focus();
  }, [renaming]);
  useEffect(() => {
    if (props.opening !== undefined) setSection(props.opening);
  }, [props.opening]);
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
  // The establishing image the preview is drawn on is its poster too.
  const drawnRecord =
    drawn?.image.kind === "output"
      ? view.outputs.find(
          (row) =>
            row.selected &&
            row.available &&
            drawn.image.kind === "output" &&
            row.output.id === drawn.image.outputId,
        )
      : undefined;
  const previewPoster =
    drawnRecord === undefined
      ? undefined
      : revisionFileUrl(api, view.revision.projectId, view.revision.id, drawnRecord.recordId);
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
    { id: "title", label: "Title and keywords" },
    {
      id: "article",
      label: "Article",
      ...(edit.content.articleEdited ? { badge: "edited" } : {}),
    },
    { id: "narration", label: "Narration" },
    { id: "images", label: "Images", badge: String(edit.content.imageOrder.length) },
    { id: "video", label: "Video and style" },
    ...(config.sources.article === "off"
      ? []
      : [
          {
            id: "captions" as const,
            label: "Captions",
            ...(edit.content.subtitleCues === undefined
              ? {}
              : { badge: String(edit.content.subtitleCues.cues.length) }),
          },
        ]),
    { id: "outputs", label: "Outputs" },
    {
      id: "checks",
      label: "Pauses and checks",
      ...(config.reviews === undefined ? {} : { badge: "on" }),
    },
    { id: "channel", label: "Channel" },
  ];
  const current = sections.some((one) => one.id === section) ? section : "title";
  const panel = (id: EditSection) => cn("min-w-0 space-y-6", current === id ? undefined : "hidden");
  const number = (value: number) => (Number.isFinite(value) ? value : "");
  const video = config.sources.video !== "off";
  const promptList = prompts.data?.prompts ?? [];
  const entryList = entries.data?.entries ?? [];
  // Each stage's source (made by AI, supplied, or off) sits at the top of its own section.
  const sourceField = (kind: (typeof stageKinds)[number]) =>
    // With Article Off, what reads the article is off and not offered.
    config.sources.article === "off" &&
    (kind === "research" || kind === "audio" || kind === "document") ? null : (
      <Field
        key={kind}
        label={`${stageWords[kind]} source`}
        tip={sourceTips[kind]}
        error={problem(`sources.${kind}`)}
      >
        <Select
          value={sourceOf(config.sources, kind)}
          onChange={(event) => {
            const option = sourceOptions(kind).find((one) => one.value === event.target.value);
            if (option === undefined) return;
            const next = changeSource(edit, kind, option.value);
            onChange(
              kind === "article" && option.value === "provide" && !edit.content.articleEdited
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
          {sourceOptions(kind)
            .filter(
              (option) =>
                !(
                  kind === "thumbnail" &&
                  option.value === "prompt_by_llm" &&
                  config.sources.article === "off"
                ),
            )
            .map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={
                  kind === "video" && option.value === "generate" && config.sources.images === "off"
                }
              >
                {option.label}
              </option>
            ))}
        </Select>
      </Field>
    );
  const providerPart = (part: "text" | "voice" | "images") => (
    <RevisionProviders
      part={part}
      projectId={view.revision.projectId}
      edit={edit}
      providers={providers.data?.providers ?? []}
      voices={voices.data?.voices ?? []}
      onChange={onChange}
    />
  );
  const promptPart = (part: PromptPart) => (
    <RevisionPrompts
      part={part}
      edit={edit}
      projectId={view.revision.projectId}
      saved={view.revision.config.imagePrompts}
      prompts={promptList}
      entries={entryList}
      onChange={onChange}
    />
  );
  return (
    <div className="grid min-w-0 gap-6 md:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Edit sections" className="min-w-0 md:sticky md:top-4 md:self-start">
        <ul className="m-0 flex list-none gap-1 overflow-x-auto p-0 [scrollbar-width:none] md:flex-col">
          {sections.map((one) => (
            <li key={one.id} className="shrink-0">
              <RailButton
                current={one.id === current}
                onClick={() => setSection(one.id)}
                meta={one.badge}
                className="whitespace-nowrap"
              >
                {one.label}
              </RailButton>
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
              <li key={`${field.field}-${field.message}`}>{field.message}</li>
            ))}
          </ul>
        )}
        <section
          aria-label="Title and keywords"
          hidden={current !== "title"}
          className={panel("title")}
        >
          <Field label="Project title" error={problem("title")}>
            <Input
              ref={titleField}
              value={config.title}
              maxLength={titleMax}
              onChange={(event) =>
                onChange({ ...edit, config: { ...config, title: event.target.value } })
              }
            />
          </Field>
          {promptPart("keywords")}
        </section>
        <section aria-label="Article" hidden={current !== "article"} className={panel("article")}>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            {sourceField("research")}
            {sourceField("article")}
          </div>
          {config.sources.research === "provide" ? (
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
          ) : null}
          {providerPart("text")}
          {promptPart("article")}
          {config.sources.article === "off" ? null : (
            <>
              <ArticleTextField
                error={problem("content.articleMarkdown") ?? problem("provided.article")}
                help={
                  edit.content.articleEdited
                    ? "Your edited article is kept when other settings change. Writing it again replaces it after the remake review."
                    : undefined
                }
                value={
                  (edit.content.articleEdited
                    ? edit.content.articleMarkdown
                    : view.articleMarkdown) ??
                  edit.content.articleMarkdown ??
                  config.provided.article ??
                  ""
                }
                onChange={(text) =>
                  onChange({
                    ...edit,
                    content: { ...edit.content, articleMarkdown: text, articleEdited: true },
                  })
                }
              />
              {config.sources.article === "generate" ? (
                <div className="flex flex-col items-start gap-1" {...helpScope}>
                  <Button
                    onClick={() =>
                      onChange({
                        ...edit,
                        regenerate: [...new Set([...(edit.regenerate ?? []), "article:body"])],
                      })
                    }
                  >
                    Write the article again after review
                  </Button>
                  <HelpLine>
                    Paid writing calls when you remake; the remake shows their cost first. It
                    replaces your edits to the article.
                  </HelpLine>
                </div>
              ) : null}
            </>
          )}
        </section>
        <section
          aria-label="Narration"
          hidden={current !== "narration"}
          className={panel("narration")}
        >
          {sourceField("audio")}
          {providerPart("voice")}
          <RevisionNarration
            edit={edit}
            view={view}
            prompts={promptList}
            error={problem("narrationPrompt")}
            onChange={onChange}
          />
          <Group title="Intro and outro">
            {(["intro", "outro"] as const).map((category) => (
              <IntroOutro
                key={category}
                category={category}
                view={view}
                edit={edit}
                entries={entryList}
                onChange={onChange}
              />
            ))}
          </Group>
          {promptPart("narration")}
        </section>
        <section aria-label="Images" hidden={current !== "images"} className={panel("images")}>
          {sourceField("images")}
          {providerPart("images")}
          {promptPart("images")}
        </section>
        <section
          aria-label="Video and style"
          hidden={current !== "video"}
          className={panel("video")}
        >
          {sourceField("video")}
          {config.sources.images === "off" ? (
            <p className="m-0 text-small text-ink-2">
              Images are Off. Video is also Off in these changes.
            </p>
          ) : null}
          <FormatPicker
            value={config.format}
            onPick={(format) => onChange({ ...edit, config: { ...config, format } })}
          />
          {video ? (
            <Group title="Images and cuts">
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
              <div className="space-y-4 md:col-span-2">
                {videoEdit.cuts}
                {videoEdit.look}
                {config.sources.audio === "generate" && config.audio?.describeFigures === true ? (
                  <ShowFiguresToggle
                    tip="project.edit.show-figures"
                    value={config.showFigures}
                    onChange={(on) => {
                      // Stored only when on.
                      const { showFigures: _old, ...rest } = config;
                      onChange({ ...edit, config: on ? { ...rest, showFigures: true } : rest });
                    }}
                  />
                ) : null}
              </div>
            </Group>
          ) : null}
          <Fold
            summary="Sound polish"
            state={config.sources.audio === "off" ? "Silence only" : "Pauses, volume and silences"}
          >
            <div className="mt-3 space-y-6">
              <div className="grid min-w-0 gap-4 md:grid-cols-2">
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
              </div>
              {config.sources.audio === "off" ? null : (
                <>
                  <EditPauses edit={edit} problem={problem} onChange={onChange} />
                  <EditLoudness edit={edit} problem={problem} onChange={onChange} />
                  {video ? (
                    <EditAmbientBed edit={edit} problem={problem} onChange={onChange} />
                  ) : null}
                </>
              )}
            </div>
          </Fold>
        </section>
        <section
          aria-label="Captions"
          hidden={current !== "captions"}
          className={panel("captions")}
        >
          <div data-tour="project-subtitles">
            <SubtitleControls
              value={config.subtitles ?? defaultSubtitles}
              format={config.format}
              language={config.language}
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
          {current !== "captions" || !video ? null : (
            <StylePreview
              drawnOn={drawn?.drawnOn}
              poster={previewPoster}
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
        <section aria-label="Outputs" hidden={current !== "outputs"} className={panel("outputs")}>
          {sourceField("thumbnail")}
          <RevisionYoutube
            edit={edit}
            view={view}
            prompts={promptList}
            problem={problem}
            onChange={onChange}
          />
          {config.sources.audio !== "off" || config.shorts?.enabled === true ? (
            <section aria-label="Shorts" className="space-y-4">
              <h3 className="m-0 text-title-3">Shorts</h3>
              <RevisionShorts
                edit={edit}
                view={view}
                prompts={promptList}
                problem={problem}
                onChange={onChange}
                onPending={markMusic}
              />
            </section>
          ) : null}
          <Group title="PDF">
            {sourceField("document")}
            <Field label="PDF look" id={`${formId}-document-theme`} tip="play.document-theme">
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
          {promptPart("outputs")}
        </section>
        <section
          aria-label="Pauses and checks"
          hidden={current !== "checks"}
          className={panel("checks")}
        >
          {props.checks}
          <RevisionReviews
            edit={edit}
            providers={providers.data?.providers ?? []}
            prompts={promptList}
            problem={problem}
            onChange={onChange}
          />
          {promptPart("checks")}
        </section>
        <section aria-label="Channel" hidden={current !== "channel"} className={panel("channel")}>
          <EditChannel
            edit={edit}
            saved={view.revision.config}
            problem={problem}
            onChange={onChange}
          />
          <RevisionLanguage edit={edit} error={problem("language")} onChange={onChange} />
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

// The intro or the outro: off, an entry from the Library, or the wording this project copied
// when the Library's entry of the same name has changed since (both are offered then).
function IntroOutro({
  category,
  view,
  edit,
  entries,
  onChange,
}: {
  readonly category: "intro" | "outro";
  readonly view: EditorProps["view"];
  readonly edit: EditorProps["edit"];
  readonly entries: readonly Entry[];
  readonly onChange: (edit: EditorProps["edit"]) => void;
}): ReactElement {
  const { config } = edit;
  const chosen = config[category]?.name;
  const copy = view.revision.content.promptTemplates[category];
  const library = entries.find((entry) => entry.category === category && entry.name === chosen);
  const split =
    chosen !== undefined &&
    library !== undefined &&
    typeof copy === "string" &&
    view.revision.config[category]?.name === chosen &&
    copy !== library.body;
  const current = edit.content.promptTemplates[category];
  const kept = `${keptValue}${chosen ?? ""}`;
  const value = chosen === undefined ? "" : split && current !== library?.body ? kept : chosen;
  return (
    <Field
      label={category === "intro" ? "Intro" : "Outro"}
      tip={category === "intro" ? "play.intro" : "play.outro"}
    >
      <Select
        value={value}
        onChange={(event) => {
          if (event.target.value === kept && typeof copy === "string") {
            // Back to the wording this project already had.
            onChange(
              editOfForm({
                ...edit,
                config: { ...config, [category]: view.revision.config[category] },
                content: {
                  ...edit.content,
                  promptTemplates: { ...edit.content.promptTemplates, [category]: copy },
                },
              }),
            );
            return;
          }
          const selected = entries.find(
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
        {chosen !== undefined &&
        !entries.some((entry) => entry.category === category && entry.name === chosen) ? (
          <option value={chosen}>{chosen} (saved entry)</option>
        ) : null}
        {split ? <option value={kept}>{chosen} · this project's version</option> : null}
        {entries
          .filter((entry) => entry.category === category)
          .map((entry) => (
            <option key={entry.id} value={entry.name}>
              {split && entry.name === chosen
                ? `${entry.name} · Library version (newer)`
                : entry.name}
            </option>
          ))}
      </Select>
    </Field>
  );
}
