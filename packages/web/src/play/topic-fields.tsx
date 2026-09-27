import { titleMax, valueMax } from "@app/slices/admission/rules.js";
import { render } from "@app/slices/admission/substitute.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useId, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery } from "@/channels/api";
import { channelOfTemplate } from "@/channels/members-tabs";
import { KeywordList } from "@/components/keyword-list";
import { Button, ButtonRow } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { Field, Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Chip } from "@/components/kit/status";
import { instantiateProjectTemplate, templatesQuery } from "@/templates/api";
import { usePlaySession } from "./draft-context";

// The most videos one Start queues: this setup and 49 more.
export const moreVideosMax = 49;

// Template first: picking one opens a fresh draft made from it, and what was typed for the
// topic comes along.
export function TemplateField({
  topics,
  onError,
}: {
  readonly topics: readonly string[];
  readonly onError: (message: string | null) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const session = usePlaySession();
  const templates = useQuery(templatesQuery(api));
  const channels = useQuery(channelsQuery(api));
  const [busy, setBusy] = useState(false);
  const blocked =
    session.review.starting || session.review.uncertain || session.review.created !== null;
  const source = session.document.templateSource;
  const current = templates.data?.find((template) => template.id === source?.id);
  const channelName = (id: string): string | undefined =>
    channels.data?.find((channel) => channel.id === id)?.name;
  const pick = async (id: string): Promise<void> => {
    onError(null);
    if (id === "") {
      await session.newDraft();
      return;
    }
    const template = templates.data?.find((one) => one.id === id);
    if (!template) return;
    setBusy(true);
    try {
      if (!(await session.flush())) {
        onError(
          "Your draft wasn't saved, so the template wasn't applied. Press Retry beside Drafts, then pick the template again.",
        );
        return;
      }
      // The topic typed so far goes with the person into the new draft.
      const typed = Object.fromEntries(
        topics
          .map((name) => [name, session.document.form.values[name] ?? ""] as const)
          .filter(([, value]) => value.trim() !== ""),
      );
      const reply = await instantiateProjectTemplate(api, template, crypto.randomUUID());
      if (!reply.ok) {
        onError(`The template "${template.name}" wasn't applied. ${reply.message}`);
        return;
      }
      await client.invalidateQueries({ queryKey: ["play-drafts"] });
      if (!(await session.open(reply.value.draft.id))) {
        onError(`The draft made from "${template.name}" didn't open. Open it from Drafts.`);
        return;
      }
      const made = reply.value.draft.document;
      const carried = Object.fromEntries(
        Object.entries(typed).filter(([name]) => (made.form.values[name] ?? "") === ""),
      );
      if (Object.keys(carried).length > 0)
        session.edit({
          ...made,
          form: { ...made.form, values: { ...made.form.values, ...carried } },
        });
    } catch (error) {
      onError(
        error instanceof Error
          ? `The template "${template.name}" wasn't applied. ${error.message}`
          : `The template "${template.name}" wasn't applied. Pick it again.`,
      );
    } finally {
      setBusy(false);
    }
  };
  const help = templates.error
    ? `Templates didn't load. ${templates.error.message}`
    : current
      ? [channelName(channelOfTemplate(current)), `version ${String(current.version)}`]
          .filter(Boolean)
          .join(" · ")
      : templates.data?.length === 0
        ? "No templates yet. Set this video up, then Save as template."
        : undefined;
  return (
    <Field label="Template" tip="play.template" help={help}>
      <Select
        data-play-field="template"
        value={current?.id ?? ""}
        disabled={busy || blocked}
        onChange={(event) => void pick(event.target.value)}
      >
        <option value="">{source && !current ? "Template no longer saved" : "No template"}</option>
        {(templates.data ?? []).map((template) => (
          <option key={template.id} value={template.id}>
            {template.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// What the video is about. A title that names keywords ("History: {{Topic}}") asks for those
// keywords here, with the title they make beneath; a title without keywords is typed itself.
export function TopicFields({
  topics,
  problem,
}: {
  readonly topics: readonly string[];
  readonly problem: (field: string) => string | undefined;
}): ReactElement {
  const session = usePlaySession();
  const { document } = session;
  const { form } = document;
  const setForm = (next: typeof form): void => {
    session.edit({ ...document, form: next });
    session.invalidateReview(true);
  };
  if (topics.length === 0)
    return (
      <Field label="Title" tip="play.title" error={problem("title")}>
        <Input
          data-play-field="title"
          className="!h-11 text-[17px]"
          value={form.title}
          maxLength={titleMax}
          placeholder="What's the video about?"
          aria-invalid={problem("title") !== undefined}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </Field>
    );
  const title = render(form.title, form.values);
  return (
    <div className="grid min-w-0 gap-4">
      {topics.map((name, index) => (
        <Field
          key={name}
          label={name}
          tip="play.topic"
          help={
            index === topics.length - 1 ? (
              <>
                Title: <b className="font-semibold text-ink">{title}</b>
              </>
            ) : undefined
          }
          error={
            problem(`values.${name}`) ??
            (index === topics.length - 1 ? problem("title") : undefined)
          }
        >
          <Input
            data-play-field={`values.${name}`}
            className="!h-11 text-[17px]"
            value={form.values[name] ?? ""}
            maxLength={valueMax}
            spellCheck={false}
            aria-invalid={problem(`values.${name}`) !== undefined}
            onChange={(event) =>
              setForm({ ...form, values: { ...form.values, [name]: event.target.value } })
            }
          />
        </Field>
      ))}
    </div>
  );
}

// More videos from the same setup: each chip is one more video with its own topic. They are the
// draft's variants, so Start queues exactly the videos shown here.
export function MoreVideos({
  topics,
  keywordNames,
  origins,
  problem,
  adding,
  onAdding,
  open,
  onOpen,
}: {
  readonly topics: readonly string[];
  readonly keywordNames: readonly string[];
  readonly origins: ReadonlyMap<string, readonly string[]>;
  readonly problem: (field: string) => string | undefined;
  readonly adding: boolean;
  readonly onAdding: (adding: boolean) => void;
  // The variant whose keywords are open in the side panel.
  readonly open: string | null;
  readonly onOpen: (key: string | null) => void;
}): ReactElement {
  const session = usePlaySession();
  const { document } = session;
  const { form } = document;
  const [text, setText] = useState("");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const locked = session.review.starting || session.review.uncertain;
  const variants = document.variants;
  const edit = (next: typeof variants): void => {
    session.edit({ ...document, variants: next });
  };
  const first = topics[0];
  const labelOf = (variant: (typeof variants)[number]): string =>
    first === undefined ? variant.title : variant.values[first] || variant.title;
  const add = (): void => {
    const topic = text.trim();
    if (topic === "" || variants.length >= moreVideosMax) return;
    edit([
      ...variants,
      {
        id: crypto.randomUUID(),
        // A title that names keywords already differs per video once they are filled.
        title: first === undefined ? topic : form.title,
        values: first === undefined ? { ...form.values } : { ...form.values, [first]: topic },
      },
    ]);
    setText("");
    input.current?.focus();
  };
  const opened = variants.findIndex((variant) => variant.id === open);
  const variant = opened === -1 ? undefined : variants[opened];
  return (
    <section aria-label="More videos from the same setup" className="min-w-0" {...helpScope}>
      <div className="mb-2 flex items-center gap-1">
        <span className="sl-kicker">More videos from the same setup</span>
        <InfoTip id="play.more-videos" className="-my-1" />
      </div>
      <ButtonRow className="flex-wrap">
        {variants.map((one, index) => {
          const name = labelOf(one) || `Video ${String(index + 2)}`;
          const refused = [
            `items.${String(index + 1)}.title`,
            ...keywordNames.map((k) => `items.${String(index + 1)}.values.${k}`),
          ].some((field) => problem(field) !== undefined);
          return (
            <Chip
              key={one.id}
              {...(refused ? { className: "border-danger" } : {})}
              {...(locked
                ? {}
                : {
                    onRemove: () => edit(variants.filter((item) => item.id !== one.id)),
                    removeLabel: `Remove ${name}`,
                  })}
            >
              {/* The chip's name is its Change button: a quiet button with a pencil, not text. */}
              <Button
                variant="quiet"
                size="small"
                data-play-field={`items.${one.id}`}
                className="-my-1 -ml-1.5 h-6 px-1.5 text-ink"
                aria-label={`Change the keywords of ${name}`}
                onClick={() => onOpen(one.id)}
              >
                {name}
                <PencilIcon aria-hidden="true" strokeWidth={1.75} />
              </Button>
            </Chip>
          );
        })}
        {adding ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {first === undefined ? "Title of another video" : `${first} of another video`}
            </label>
            <Input
              ref={input}
              id={inputId}
              autoFocus
              className="!h-8 w-48"
              value={text}
              maxLength={first === undefined ? titleMax : valueMax}
              placeholder={first === undefined ? "Another title" : `Another ${first}`}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onAdding(false);
              }}
            />
            <Button type="submit" size="small" disabled={text.trim() === ""}>
              Add
            </Button>
            <Button variant="quiet" size="small" onClick={() => onAdding(false)}>
              Done
            </Button>
          </form>
        ) : (
          <Button
            variant="quiet"
            size="small"
            disabled={locked || variants.length >= moreVideosMax}
            disabledReason={
              locked
                ? "Wait for the start to finish"
                : `One Start queues at most ${String(moreVideosMax + 1)} videos`
            }
            onClick={() => onAdding(true)}
          >
            <PlusIcon aria-hidden="true" strokeWidth={1.75} />
            Add topic
          </Button>
        )}
      </ButtonRow>
      <Drawer
        open={variant !== undefined}
        title={variant ? `Video ${String(opened + 2)}: ${labelOf(variant) || "untitled"}` : ""}
        width="narrow"
        onClose={() => onOpen(null)}
        footer={
          <Button variant="secondary" onClick={() => onOpen(null)}>
            Done
          </Button>
        }
      >
        {variant ? (
          <fieldset disabled={locked} className="flex min-w-0 flex-col gap-5 border-0 p-0">
            <p className="m-0 text-small text-ink-2">
              Everything else comes from the setup of the first video.
            </p>
            <Field
              label="Title"
              tip="play.title"
              error={problem(`items.${String(opened + 1)}.title`)}
            >
              <Input
                data-play-field={`items.${variant.id}.title`}
                value={variant.title}
                maxLength={titleMax}
                onChange={(event) =>
                  edit(
                    variants.map((one) =>
                      one.id === variant.id ? { ...one, title: event.target.value } : one,
                    ),
                  )
                }
              />
            </Field>
            <KeywordList
              fieldPrefix={`items.${variant.id}.values`}
              keywords={keywordNames.map((name) => ({
                name,
                value: variant.values[name] ?? "",
                feeds: origins.get(name) ?? [],
                topic: topics.includes(name),
              }))}
              problem={(field) =>
                problem(field.replace(`items.${variant.id}.`, `items.${String(opened + 1)}.`))
              }
              onChange={(name, value) =>
                edit(
                  variants.map((one) =>
                    one.id === variant.id
                      ? { ...one, values: { ...one.values, [name]: value } }
                      : one,
                  ),
                )
              }
            />
          </fieldset>
        ) : null}
      </Drawer>
    </section>
  );
}
