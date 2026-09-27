import { tagsLength } from "@app/slices/youtube/answer.js";
import { chapterNotice, fitChapters } from "@app/slices/youtube/chapters.js";
import {
  composeDescription,
  type DescriptionField,
  type DescriptionFields,
  type ResolvedField,
  resolveFields,
  shownFields,
  splitDescription,
} from "@app/slices/youtube/edits.js";
import { descriptionMaxCharacters, tagsMaxCharacters } from "@app/slices/youtube/model.js";
import {
  type ChannelLink,
  fillPlaceholders,
  linkKey,
  mergeLinks,
  placeholderParts,
  previousVideoLink,
} from "@app/slices/youtube/placeholders.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CopyIcon, PencilIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useId, useRef, useState } from "react";
import {
  type ProjectDescriptionEdits,
  readDescriptionEdits,
  readProjectChannelLinks,
  saveDescriptionEdit,
  saveProjectLinks,
} from "@/api";
import { useApp } from "@/app-context";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { ariaKeyShortcuts, useCommand } from "@/components/kit/command-palette";
import { Input, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { useToast } from "@/components/kit/toast";
import type { HelpId } from "@/help/catalog";
import { shortcuts } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { DiffColumns } from "@/library/diff-view";
import { keys } from "@/queries";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { useOutputText } from "./parts.js";

const labels: Readonly<Record<DescriptionField, string>> = {
  summary: "Summary",
  chapters: "Chapters",
  hashtags: "Hashtags",
  tags: "Tags",
};

const fieldTips = {
  Summary: "project.youtube.summary",
  Chapters: "project.youtube.chapters",
  Hashtags: "project.youtube.hashtags",
  Tags: "project.youtube.tags",
} as const satisfies Readonly<Record<string, HelpId>>;

// The Video stage's YouTube part: the description (summary, chapters, hashtags) and the tags as
// written, each editable in place. An edit is kept as the user's own and survives the next
// regeneration: when the description is written again, a field the user changed keeps their
// text and offers the new one (`slices/youtube/edits.ts`). `{{Name}}` placeholders fill from
// the project's channel's links (its Brand tab) and this project's own Previous video when
// shown, copied and downloaded; one without a link stays as typed and is marked. It is a part
// of the stage body, set off by a rule and a heading rather than a box of its own; everything
// stays mounted while the step runs or waits, so nothing moves when the text lands.
export function YoutubeBlock({ stage, project, outputs }: Omit<BodyProps, "actions" | "busy">) {
  const id = useId();
  const { api } = useApp();
  const queryClient = useQueryClient();
  const own = outputsOf(outputs, stage);
  const description = roleOf(own, "youtube_description");
  const tags = roleOf(own, "youtube_tags");
  const descriptionText = useOutputText(description).data;
  const tagsText = useOutputText(tags).data;
  const edits = useQuery({
    queryKey: keys.youtubeEdits(project.id),
    queryFn: () => readDescriptionEdits(api, project.id),
  });
  const channelLinks = useQuery({
    queryKey: keys.projectChannelLinks(project.id),
    queryFn: () => readProjectChannelLinks(api, project.id),
  });
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const notify = useToast();
  const saved = (next: ProjectDescriptionEdits) =>
    queryClient.setQueryData(keys.youtubeEdits(project.id), next);
  const save = useMutation({
    mutationFn: (change: {
      readonly field: DescriptionField;
      readonly edit: { readonly text: string; readonly base: string } | null;
      readonly done: string;
    }) => saveDescriptionEdit(api, project.id, change.field, change.edit),
    onSuccess: (next, change) => {
      saved(next);
      setStatus({ text: change.done, tone: "success" });
    },
    onError: (error) =>
      setStatus({
        text: `Couldn't save the change: ${error.message}`,
        tone: "error",
      }),
  });
  // Copy description and Copy tags are palette commands too; they copy what is shown here,
  // placeholders filled, so they read the latest text when run.
  const copyLatest = useRef<{ description?: () => void; tags?: () => void }>({});
  useCommand({
    id: "project.copy-description",
    title: "Copy description",
    group: "This project",
    context: project.title,
    keywords: ["youtube", "description", "chapters", "clipboard"],
    shortcut: shortcuts.copyDescription,
    run: () =>
      copyLatest.current.description === undefined
        ? notify("The description has not been written yet.", "info")
        : copyLatest.current.description(),
  });
  useCommand({
    id: "project.copy-tags",
    title: "Copy tags",
    group: "This project",
    context: project.title,
    keywords: ["youtube", "tags", "clipboard"],
    run: () =>
      copyLatest.current.tags === undefined
        ? notify("The tags have not been written yet.", "info")
        : copyLatest.current.tags(),
  });
  if (project.config.youtubeDescription !== true && description === undefined) return null;

  const generated: DescriptionFields | undefined =
    descriptionText === undefined ? undefined : splitDescription(descriptionText, tagsText ?? "");
  const resolved = resolveFields(generated, edits.data?.fields ?? {});
  const shown = shownFields(resolved);
  const links = mergeLinks(channelLinks.data?.links ?? [], edits.data?.links ?? []);
  // The chapters as YouTube will take them (`slices/youtube/chapters.ts`): shown and copied
  // fitted, with a note saying what changed; the stored text and the user's edit stay as they
  // are, so editing starts from what was written.
  const video = roleOf(own, "video");
  const fitted = fitChapters(
    shown.chapters,
    video?.durationMs === null || video?.durationMs === undefined
      ? undefined
      : video.durationMs / 1000,
  );
  const adjusted = chapterNotice(fitted.adjustments);
  const composed = composeDescription({ ...shown, chapters: fitted.text });
  const filledDescription = fillPlaceholders(composed, links);
  const filledTags = fillPlaceholders(shown.tags, links);
  const unknown = [...filledDescription.unknown, ...filledTags.unknown].filter(
    (name, index, all) => all.findIndex((one) => linkKey(one) === linkKey(name)) === index,
  );
  const tagList = splitTags(filledTags.text);
  const written = generated !== undefined;

  const copy = (text: string, what: string) => {
    const failed = `Couldn't copy the ${what}. Select the text in the YouTube section and copy it.`;
    if (!navigator.clipboard) {
      setStatus({ text: failed, tone: "error" });
      notify(failed, "error");
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () => {
        setStatus({ text: `Copied the ${what}.`, tone: "success" });
        notify(`Copied the ${what}.`, "success");
      },
      () => {
        setStatus({ text: failed, tone: "error" });
        notify(failed, "error");
      },
    );
  };
  copyLatest.current = written
    ? {
        description: () => copy(filledDescription.text, "description"),
        tags: () => copy(filledTags.text, "tags"),
      }
    : {};
  const waiting =
    stage.state === "running"
      ? "Written after the subtitle timing."
      : "Not written yet. It is made with the video.";
  const field = (name: DescriptionField, render?: (text: string) => ReactNode) => (
    <EditableField
      key={name}
      label={labels[name]}
      value={resolved[name]}
      links={links}
      disabled={!written || save.isPending}
      multiline={name !== "hashtags"}
      placeholder={waiting}
      render={render}
      onSave={(text) =>
        save.mutate({
          field: name,
          edit: { text, base: generated?.[name] ?? "" },
          done: `Saved your ${labels[name].toLowerCase()}.`,
        })
      }
      onUseGenerated={() =>
        save.mutate({
          field: name,
          edit: null,
          done: `The ${labels[name].toLowerCase()} follows the generated text again.`,
        })
      }
      onKeepMine={(text, next) =>
        save.mutate({
          field: name,
          edit: { text, base: next },
          done: `Kept your ${labels[name].toLowerCase()}.`,
        })
      }
    />
  );

  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4">
      <h3 id={`${id}-title`} className="sr-only">
        YouTube
      </h3>
      {/* The description reads best at a paragraph's width; the tags take the room beside
          it and drop below it on a narrow screen. */}
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,75ch)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <PartHead
            id={`${id}-description`}
            label="Description"
            copy={written ? () => copy(filledDescription.text, "description") : undefined}
            keyshortcuts={ariaKeyShortcuts(shortcuts.copyDescription)}
            count={
              written
                ? `${String(filledDescription.text.length)} / ${String(descriptionMaxCharacters)} characters`
                : undefined
            }
            over={filledDescription.text.length > descriptionMaxCharacters}
          />
          {field("summary")}
          {field("chapters", () =>
            fitted.text === "" ? (
              <span className="text-ink-3">Left out; see the note below.</span>
            ) : (
              <Filled text={fitted.text} links={links} />
            ),
          )}
          {adjusted === undefined ? null : <p className="text-small text-waiting">{adjusted}</p>}
          {field("hashtags")}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <PartHead
            id={`${id}-tags`}
            label="Tags"
            copy={written ? () => copy(filledTags.text, "tags") : undefined}
            count={
              written
                ? `${String(tagsLength(tagList))} / ${String(tagsMaxCharacters)} characters`
                : undefined
            }
            over={tagsLength(tagList) > tagsMaxCharacters}
          />
          {field("tags", (text) => (
            <TagChips text={text} links={links} />
          ))}
        </div>
      </div>
      {unknown.length === 0 ? null : (
        <p className="text-small text-waiting">
          {`No link is saved for ${unknown.map((name) => `{{${name}}}`).join(", ")}, so it stays as typed. Add it under Channel links on `}
          {channelLinks.data === undefined ? (
            "the channel's Brand tab"
          ) : (
            <Link
              to="/channels/$channelId"
              params={{ channelId: channelLinks.data.channelId }}
              className="underline"
            >
              the channel's Brand tab
            </Link>
          )}
          {`${unknown.some((name) => linkKey(name) === linkKey(previousVideoLink)) ? ", or set this project's Previous video below" : ""}.`}
        </p>
      )}
      <PreviousVideo
        projectId={project.id}
        edits={edits.data}
        onSaved={(next) => {
          saved(next);
          setStatus({ text: "Saved this project's Previous video link.", tone: "success" });
        }}
        onError={(message) => setStatus({ text: message, tone: "error" })}
      />
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
    </section>
  );
}

function PartHead({
  id,
  label,
  copy,
  count,
  over,
  keyshortcuts,
}: {
  readonly id: string;
  readonly label: string;
  // The Copy button's key, as `aria-keyshortcuts`.
  readonly keyshortcuts?: string | undefined;
  // Undefined until there is text to copy.
  readonly copy: (() => void) | undefined;
  readonly count: string | undefined;
  readonly over: boolean;
}): ReactElement {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-3">
      <h4 id={id} className="text-small font-semibold text-ink-2">
        {label}
      </h4>
      {count === undefined ? null : (
        <span className={cn("text-small tabular-nums", over ? "text-danger" : "text-ink-3")}>
          {over ? `${count}, over YouTube's limit` : count}
        </span>
      )}
      <span className="flex-1" />
      <Button
        type="button"
        variant="quiet"
        disabled={copy === undefined}
        aria-label={`Copy ${label.toLowerCase()}`}
        aria-keyshortcuts={keyshortcuts}
        onClick={copy}
      >
        <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
        Copy
      </Button>
    </div>
  );
}

// One field shown as text, with Edit to change it in place. The user's text is marked as theirs
// with a way back to the generated one, and a regenerated text the user has not seen yet waits
// beside it instead of replacing it.
function EditableField({
  label,
  value,
  links,
  disabled,
  multiline,
  placeholder,
  render,
  onSave,
  onUseGenerated,
  onKeepMine,
}: {
  readonly label: string;
  readonly value: ResolvedField;
  readonly links: readonly ChannelLink[];
  readonly disabled: boolean;
  readonly multiline: boolean;
  readonly placeholder: string;
  readonly render?: ((text: string) => ReactNode) | undefined;
  readonly onSave: (text: string) => void;
  readonly onUseGenerated: () => void;
  readonly onKeepMine: (text: string, next: string) => void;
}): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState<string | undefined>();
  const [diff, setDiff] = useState(false);
  const editing = draft !== undefined;
  const lower = label.toLowerCase();
  const tip = label in fieldTips ? fieldTips[label as keyof typeof fieldTips] : undefined;
  return (
    <div className="flex min-w-0 flex-col gap-1" {...helpScope}>
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1">
          <h5 id={`${id}-label`} className="sl-kicker text-ink-3">
            {label}
          </h5>
          {tip === undefined ? null : <InfoTip id={tip} label={lower} className="-my-1" />}
        </span>
        {value.edited ? <span className="text-small text-ink-2">Your edit</span> : null}
        <span className="flex-1" />
        {value.edited && !editing ? (
          <Button
            type="button"
            variant="quiet"
            disabled={disabled}
            aria-label={`Use the generated ${lower}`}
            onClick={onUseGenerated}
          >
            Use generated
          </Button>
        ) : null}
        <Button
          type="button"
          variant="quiet"
          disabled={disabled || editing}
          aria-label={`Edit ${lower}`}
          onClick={() => setDraft(value.text)}
        >
          <PencilIcon aria-hidden="true" className="size-[14px]" />
          Edit
        </Button>
      </div>
      {value.pending === undefined ? null : (
        <div className="flex flex-col gap-2 border-l-2 border-waiting pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-small text-ink">New generated version available.</p>
            <Button
              type="button"
              disabled={disabled}
              aria-label={`Use the new generated ${lower}`}
              onClick={onUseGenerated}
            >
              Use it
            </Button>
            <Button
              type="button"
              disabled={disabled}
              aria-label={`Keep my ${lower}`}
              onClick={() => onKeepMine(value.text, value.pending ?? "")}
            >
              Keep mine
            </Button>
            <Button
              type="button"
              variant="quiet"
              aria-expanded={diff}
              aria-label={`${diff ? "Hide" : "View"} the ${lower} diff`}
              onClick={() => setDiff((now) => !now)}
            >
              {diff ? "Hide diff" : "View diff"}
            </Button>
          </div>
          {diff ? (
            <DiffColumns
              before={value.text}
              after={value.pending}
              beforeLabel="Yours"
              afterLabel="New generated"
            />
          ) : null}
        </div>
      )}
      {editing ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-edit`} className="sr-only">
            {label}
          </label>
          {multiline ? (
            <Textarea
              id={`${id}-edit`}
              rows={label === "Chapters" ? 8 : 5}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          ) : (
            <Input
              id={`${id}-edit`}
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={disabled}
              onClick={() => {
                onSave(draft);
                setDraft(undefined);
              }}
            >
              Save {lower}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setDraft(undefined)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <section
          aria-labelledby={`${id}-label`}
          className={cn(
            "min-w-0 whitespace-pre-wrap break-words text-small",
            value.text === "" ? "text-ink-3" : "text-ink",
          )}
        >
          {value.text === "" ? (
            placeholder
          ) : render === undefined ? (
            <Filled text={value.text} links={links} />
          ) : (
            render(value.text)
          )}
        </section>
      )}
    </div>
  );
}

// The text with its placeholders filled: a filled one shows its link, marked so it reads as
// filled in; one without a link stays as typed and is highlighted.
function Filled({
  text,
  links,
}: {
  readonly text: string;
  readonly links: readonly ChannelLink[];
}): ReactElement {
  let at = 0;
  return (
    <>
      {placeholderParts(text, links).map((part) => {
        const key = String(at);
        at += part.kind === "text" ? part.text.length : part.raw.length;
        if (part.kind === "text") return <span key={key}>{part.text}</span>;
        return part.url === undefined ? (
          <mark
            key={key}
            title={`No link named ${part.name}`}
            className="rounded-[2px] bg-waiting/25 px-0.5 text-ink"
          >
            {part.raw}
          </mark>
        ) : (
          <span
            key={key}
            title={part.raw}
            className="underline decoration-dotted underline-offset-[3px]"
          >
            {part.url}
          </span>
        );
      })}
    </>
  );
}

function splitTags(text: string): readonly string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

// The tags as the chips they become on YouTube. Copy still copies them exactly as written,
// commas and all, for YouTube's Tags field.
function TagChips({
  text,
  links,
}: {
  readonly text: string;
  readonly links: readonly ChannelLink[];
}): ReactElement {
  return (
    <ul className="flex flex-wrap gap-2 whitespace-normal">
      {splitTags(text).map((tag, index) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: a tag can repeat, and the list never reorders
          key={index}
          className="rounded-full border border-line bg-raised px-2 py-0.5 text-small text-ink"
        >
          <Filled text={tag} links={links} />
        </li>
      ))}
    </ul>
  );
}

// This project's own Previous video, which `{{Previous video}}` fills with ahead of the one in
// its channel's links.
function PreviousVideo({
  projectId,
  edits,
  onSaved,
  onError,
}: {
  readonly projectId: string;
  readonly edits: ProjectDescriptionEdits | undefined;
  readonly onSaved: (next: ProjectDescriptionEdits) => void;
  readonly onError: (message: string) => void;
}): ReactElement {
  const { api } = useApp();
  const id = useId();
  const saved =
    edits?.links.find((link) => linkKey(link.name) === linkKey(previousVideoLink))?.url ?? "";
  const [value, setValue] = useState<string | undefined>();
  const shown = value ?? saved;
  const save = useMutation({
    mutationFn: () => {
      const others = (edits?.links ?? []).filter(
        (link) => linkKey(link.name) !== linkKey(previousVideoLink),
      );
      return saveProjectLinks(
        api,
        projectId,
        shown.trim() === "" ? others : [...others, { name: previousVideoLink, url: shown.trim() }],
      );
    },
    onSuccess: (next) => {
      setValue(undefined);
      onSaved(next);
    },
    onError: (error) => onError(error.message),
  });
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-[260px] flex-1 flex-col gap-1 sm:max-w-[520px]" {...helpScope}>
        <div className="flex items-center gap-1">
          <label className="sl-field__label" htmlFor={id}>
            Previous video for this project
          </label>
          <InfoTip id="project.youtube.previous-video" className="-my-1" />
        </div>
        <Input
          id={id}
          type="url"
          placeholder="https://youtu.be/…"
          value={shown}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
      </div>
      <Button
        type="button"
        disabled={save.isPending || edits === undefined || shown.trim() === saved}
        onClick={() => save.mutate()}
      >
        Save links
      </Button>
    </div>
  );
}
