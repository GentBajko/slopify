import { stageKinds } from "@app/kernel/pipeline.js";
import { silenceGapSecondsMax, titleMax } from "@app/slices/admission/rules.js";
import { defaultSubtitles } from "@app/slices/subtitles/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useId, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import { FormatPicker } from "@/play/format-picker";
import { sourceOptions } from "@/play/state";
import { entriesQuery, promptsQuery, providersQuery, voicesQuery } from "@/queries";
import { subtitlesFor } from "@/subtitles/config";
import { SubtitleControls } from "@/subtitles/controls";
import { changeSource, editOfForm } from "./revision-form-state.js";
import { RevisionPrompts } from "./revision-prompts.js";
import { RevisionProviders } from "./revision-providers.js";
import type { EditorProps } from "./revision-workspace.js";
export function RevisionForm(
  props: EditorProps & { readonly renderContent?: (props: EditorProps) => ReactNode },
): import("react").ReactElement {
  const { view, edit, onChange, onPending, fields } = props;
  const formId = useId();
  const [pending, setPending] = useState({ font: false, content: false });
  useEffect(() => {
    onPending(pending.font || pending.content);
  }, [onPending, pending]);
  const markFont = useCallback((active: boolean): void => {
    setPending((current) => (current.font === active ? current : { ...current, font: active }));
  }, []);
  const markContent = useCallback((active: boolean): void => {
    setPending((current) =>
      current.content === active ? current : { ...current, content: active },
    );
  }, []);
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const voices = useQuery(voicesQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const entries = useQuery(entriesQuery(api));
  const { config } = edit;
  const problem = (field: string) =>
    fields.find(
      (one) =>
        one.field === field ||
        one.field === `config.${field}` ||
        one.field === `edit.config.${field}`,
    )?.message;
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-2">
      {Object.entries({
        providers: providers.error,
        voices: voices.error,
        prompts: prompts.error,
        entries: entries.error,
      }).flatMap(([name, error]) =>
        error === null
          ? []
          : [
              <p key={name} role="alert" className="text-small text-red lg:col-span-2">
                {error.message}
              </p>,
            ],
      )}
      <section className="min-w-0 space-y-3">
        <label htmlFor={`${formId}-title`} className="block space-y-1 text-small">
          Project title
          <Input
            id={`${formId}-title`}
            value={config.title}
            maxLength={titleMax}
            onChange={(event) =>
              onChange({ ...edit, config: { ...config, title: event.target.value } })
            }
          />
        </label>
        <FormatPicker
          value={config.format}
          onPick={(format) => onChange({ ...edit, config: { ...config, format } })}
        />
        {stageKinds.map((kind) => (
          <label
            htmlFor={`${formId}-source-${kind}`}
            key={kind}
            className="flex min-w-0 flex-col gap-1 text-small"
          >
            {kind} source
            <Picker
              id={`${formId}-source-${kind}`}
              value={config.sources[kind]}
              onChange={(event) => {
                const option = sourceOptions(kind).find((one) => one.value === event.target.value);
                if (option !== undefined) onChange(changeSource(edit, kind, option.value));
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
            </Picker>
          </label>
        ))}
        {config.sources.images === "off" ? (
          <p>Images are Off. Video is also Off in these changes.</p>
        ) : null}
        <label htmlFor={`${formId}-gap`} className="block space-y-1 text-small">
          Silence gap (seconds)
          <Input
            id={`${formId}-gap`}
            type="number"
            min={0}
            max={silenceGapSecondsMax}
            step={0.1}
            value={Number.isFinite(config.silenceGapSeconds) ? config.silenceGapSeconds : ""}
            onChange={(event) =>
              onChange({
                ...edit,
                config: { ...config, silenceGapSeconds: Number(event.target.value) },
              })
            }
          />
        </label>
        {(["intro", "outro"] as const).map((category) => (
          <label
            htmlFor={`${formId}-entry-${category}`}
            key={category}
            className="flex min-w-0 flex-col gap-1 text-small"
          >
            {category}
            <Picker
              id={`${formId}-entry-${category}`}
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
            </Picker>
          </label>
        ))}
        {config.sources.research === "provide" ? (
          <label htmlFor={`${formId}-research`} className="block space-y-1 text-small">
            Research notes
            <Textarea
              id={`${formId}-research`}
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
          </label>
        ) : null}
        <label htmlFor={`${formId}-article`} className="block space-y-1 text-small">
          Article text
          <Textarea
            id={`${formId}-article`}
            rows={6}
            maxLength={500000}
            value={
              edit.content.articleMarkdown ?? view.articleMarkdown ?? config.provided.article ?? ""
            }
            onChange={(event) =>
              onChange({
                ...edit,
                content: { ...edit.content, articleMarkdown: event.target.value },
              })
            }
          />
        </label>
        {edit.content.articleEdited ? (
          <p>
            Your edited article is retained when other settings change. Explicit regeneration
            replaces it after rebuild review.
          </p>
        ) : null}
        {config.sources.article === "generate" ? (
          <Button
            type="button"
            onClick={() =>
              onChange({
                ...edit,
                regenerate: [...new Set([...(edit.regenerate ?? []), "article:body"])],
              })
            }
          >
            Regenerate article after review
          </Button>
        ) : null}
        <RevisionProviders
          edit={edit}
          providers={providers.data?.providers ?? []}
          voices={voices.data?.voices ?? []}
          onChange={onChange}
        />
      </section>
      <section className="min-w-0 space-y-3">
        <RevisionPrompts
          edit={edit}
          prompts={prompts.data?.prompts ?? []}
          entries={entries.data?.entries ?? []}
          onChange={onChange}
        />
        <div data-tour="project-subtitles">
          <SubtitleControls
            value={config.subtitles ?? defaultSubtitles}
            format={config.format}
            audioEnabled={config.sources.audio !== "off"}
            videoEnabled={config.sources.video !== "off"}
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
        {fields.length === 0 ? null : (
          <ul role="alert">
            {fields.map((field) => (
              <li key={`${field.field}-${field.message}`}>
                {field.field}: {field.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="lg:col-span-2">
        {props.renderContent?.({ view, edit, fields, onChange, onPending: markContent })}
      </div>
    </div>
  );
}
