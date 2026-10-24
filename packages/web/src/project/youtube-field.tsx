import type { ResolvedField } from "@app/slices/youtube/edits.js";
import { type ChannelLink, placeholderParts } from "@app/slices/youtube/placeholders.js";
import { CopyIcon, PencilIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import { Button } from "@/components/kit/button";
import { HelpLine, Input, Textarea } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { cn } from "@/lib/utils";
import { DiffColumns } from "@/library/diff-view";

// The YouTube text's pieces: a part's head (its name, its count and Copy), the editor a part
// opens in place with Save and Cancel, what an edit of the person's own and a newly written
// version waiting beside it say, the placeholders filled as links, and the tags as chips.

// One part's head: "Tags  248 / 500 characters  [Copy tags] [Edit tags]".
export function PartHead({
  id,
  label,
  count,
  over,
  children,
}: {
  readonly id: string;
  readonly label: string;
  // "342 / 5000 characters"; undefined until there is text.
  readonly count: string | undefined;
  readonly over: boolean;
  // The part's Copy and Edit, in that order.
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-1.5">
      <h3 id={id} className="m-0 text-title-3 font-semibold text-ink">
        {label}
      </h3>
      {count === undefined ? null : (
        <span className={cn("text-small tabular-nums", over ? "text-danger" : "text-ink-2")}>
          {over ? `${count}, over YouTube's limit` : count}
        </span>
      )}
      <span className="flex-1" />
      {children}
    </div>
  );
}

// "Copy description": what the part is, on the button, so it reads alone.
export function CopyButton({
  what,
  onCopy,
  keyshortcuts,
}: {
  // "description", "tags", "pinned comment".
  readonly what: string;
  readonly onCopy: () => void;
  readonly keyshortcuts?: string | undefined;
}): ReactElement {
  return (
    <Button type="button" size="small" aria-keyshortcuts={keyshortcuts} onClick={onCopy}>
      <CopyIcon aria-hidden="true" strokeWidth={1.75} />
      {`Copy ${what}`}
    </Button>
  );
}

// "Edit summary": opens the part's editor below, starting from the text as it is now.
export function EditButton({
  what,
  onEdit,
}: {
  readonly what: string;
  readonly onEdit: () => void;
}): ReactElement {
  return (
    <Button type="button" variant="quiet" size="small" onClick={onEdit}>
      <PencilIcon aria-hidden="true" strokeWidth={1.75} />
      {`Edit ${what}`}
    </Button>
  );
}

// What a part has beyond its text: its editor while it is open, the person's own text marked
// as theirs with a way back to the written one, and a newly written version waiting beside
// it instead of replacing it. Nothing when none of these applies.
export function FieldEditor({
  label,
  value,
  draft,
  onDraft,
  note,
  disabled,
  multiline,
  rows = 5,
  onSave,
  onUseGenerated,
  onKeepMine,
}: {
  // "Summary": the editor's name and, lower-cased, the object of its buttons.
  readonly label: string;
  readonly value: ResolvedField;
  // The text being typed, held by the section so its counts follow it; undefined when the
  // editor is closed.
  readonly draft: string | undefined;
  readonly onDraft: (draft: string | undefined) => void;
  // A line under the editor about YouTube's rules for what is typed.
  readonly note?: { readonly text: string; readonly warn: boolean } | undefined;
  readonly disabled: boolean;
  readonly multiline: boolean;
  readonly rows?: number;
  readonly onSave: (text: string) => void;
  readonly onUseGenerated: () => void;
  readonly onKeepMine: (text: string, next: string) => void;
}): ReactElement | null {
  const id = useId();
  const [diff, setDiff] = useState(false);
  const editing = draft !== undefined;
  const lower = label.toLowerCase();
  if (!editing && !value.edited && value.pending === undefined) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {value.pending === undefined ? null : (
        <div className="flex flex-col gap-2 border-l-2 border-waiting pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="m-0 text-small text-ink">
              {`${label} written again. Yours stays until you choose.`}
            </p>
            {editing ? null : (
              <Button
                type="button"
                size="small"
                disabled={disabled}
                aria-label={`Use the new ${lower}`}
                onClick={onUseGenerated}
              >
                Use the new one
              </Button>
            )}
            <Button
              type="button"
              size="small"
              disabled={disabled}
              aria-label={`Keep my ${lower}`}
              onClick={() => onKeepMine(value.text, value.pending ?? "")}
            >
              Keep mine
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="small"
              aria-expanded={diff}
              aria-label={`${diff ? "Hide" : "Show"} what changed in the ${lower}`}
              onClick={() => setDiff((now) => !now)}
            >
              {diff ? "Hide the changes" : "Show the changes"}
            </Button>
          </div>
          {diff ? (
            <DiffColumns
              before={value.text}
              after={value.pending}
              beforeLabel="Yours"
              afterLabel="New"
            />
          ) : null}
        </div>
      )}
      {editing ? (
        <div className="flex flex-col gap-2" {...helpScope}>
          <label htmlFor={`${id}-edit`} className="text-small font-semibold text-ink">
            {label}
          </label>
          {multiline ? (
            <Textarea
              id={`${id}-edit`}
              rows={rows}
              value={draft}
              onChange={(event) => onDraft(event.currentTarget.value)}
            />
          ) : (
            <Input
              id={`${id}-edit`}
              value={draft}
              onChange={(event) => onDraft(event.currentTarget.value)}
            />
          )}
          {note === undefined ? null : (
            <p className={cn("m-0 text-small", note.warn ? "text-danger" : "text-ink-2")}>
              {note.text}
            </p>
          )}
          <HelpLine>Saved as your own text: writing the description again keeps it.</HelpLine>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="small"
              disabled={disabled}
              onClick={() => {
                onSave(draft);
                onDraft(undefined);
              }}
            >
              {`Save ${lower}`}
            </Button>
            <Button type="button" size="small" onClick={() => onDraft(undefined)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : value.edited ? (
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-small text-ink-2">
          {`${label}: your own text, kept when the description is written again.`}
          {value.pending === undefined ? (
            <Button
              type="button"
              variant="quiet"
              size="small"
              disabled={disabled}
              onClick={onUseGenerated}
            >
              {`Use the written ${lower}`}
            </Button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

// The text with its placeholders filled: a filled one shows its link, marked so it reads as
// filled in; one without a link stays as typed and is highlighted.
export function Filled({
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

export function splitTags(text: string): readonly string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

// The tags as the chips they become on YouTube. Copy still copies them exactly as written,
// commas and all, for YouTube's Tags field.
export function TagChips({
  text,
  links,
}: {
  readonly text: string;
  readonly links: readonly ChannelLink[];
}): ReactElement {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0 whitespace-normal">
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
