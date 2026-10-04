import type { ResolvedField } from "@app/slices/youtube/edits.js";
import { type ChannelLink, placeholderParts } from "@app/slices/youtube/placeholders.js";
import { PencilIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import { Button } from "@/components/kit/button";
import { Input, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import type { HelpId } from "@/help/catalog";
import { cn } from "@/lib/utils";
import { DiffColumns } from "@/library/diff-view";

// The YouTube part's fields: one text shown as it reads, with Edit, Your edit, Use generated
// and the waiting new version; the placeholders filled as links; the tags as chips.

// One field shown as text, with Edit to change it in place. The user's text is marked as theirs
// with a way back to the generated one, and a regenerated text the user has not seen yet waits
// beside it instead of replacing it.
export function EditableField({
  label,
  tip,
  value,
  draft,
  onDraft,
  note,
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
  readonly tip?: HelpId | undefined;
  // The text being typed, held by the section so its counts follow it; undefined when the
  // field is not open for editing.
  readonly draft: string | undefined;
  readonly onDraft: (draft: string | undefined) => void;
  // A line under the field about YouTube's rules for what is in it now, typed or saved.
  readonly note?: { readonly text: string; readonly warn: boolean } | undefined;
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
  const setDraft = onDraft;
  const [diff, setDiff] = useState(false);
  const editing = draft !== undefined;
  const lower = label.toLowerCase();
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
            size="small"
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
          size="small"
          disabled={disabled || editing}
          aria-label={`Edit ${lower}`}
          onClick={() => setDraft(value.text)}
        >
          <PencilIcon aria-hidden="true" strokeWidth={1.75} />
          Edit
        </Button>
      </div>
      {value.pending === undefined ? null : (
        <div className="flex flex-col gap-2 border-l-2 border-waiting pl-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-small text-ink">New generated version available.</p>
            <Button
              type="button"
              disabled={disabled || editing}
              disabledReason={`Save or cancel your ${lower} edit first, so your typing isn't lost.`}
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
          {note === undefined ? null : <FieldNote note={note} />}
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
            <Button type="button" variant="secondary" onClick={() => setDraft(undefined)}>
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
      {editing || note === undefined ? null : <FieldNote note={note} />}
    </div>
  );
}

function FieldNote({
  note,
}: {
  readonly note: { readonly text: string; readonly warn: boolean };
}): ReactElement {
  return (
    <p className={cn("m-0 text-small", note.warn ? "text-danger" : "text-ink-3")}>{note.text}</p>
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
