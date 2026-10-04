import type { HeldTopic } from "@app/slices/schedules/schema.js";
import type { KeyboardEvent, ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { ListRow } from "@/components/kit/list-row";
import { RowCheck, type Selection } from "@/components/selection";

export interface Editing {
  readonly id: string;
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
}

// "Word Count: 12000 · Tone: calm": the keywords a held topic sets, under its title.
export function heldValuesLine(values: Readonly<Record<string, string>>): string | undefined {
  const set = Object.entries(values);
  return set.length === 0 ? undefined : set.map(([name, value]) => `${name}: ${value}`).join(" · ");
}

// One topic waiting for approval: its checkbox, Approve, Edit and Reject. Edit opens the title
// (focused) and the keywords it may set; Enter saves, Esc cancels.
export function HeldTopicRow({
  topic,
  editing,
  keywords,
  everyRun,
  busy,
  selection,
  onEdit,
  onSave,
  onCancel,
  onApprove,
  onReject,
}: {
  readonly topic: HeldTopic;
  // This row's edit in progress, else undefined.
  readonly editing: Editing | undefined;
  readonly keywords: readonly string[];
  readonly everyRun: (name: string) => string;
  readonly busy: boolean;
  readonly selection: Selection<string>;
  readonly onEdit: (next: Editing) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly onApprove: () => void;
  readonly onReject: () => void;
}): ReactElement {
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (!busy && editing !== undefined && editing.title.trim() !== "") onSave();
    } else if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
  };
  return (
    <ListRow
      lead={<RowCheck selection={selection} value={topic.id} label={topic.title} />}
      title={
        editing === undefined ? (
          topic.title
        ) : (
          <div className="flex min-w-0 flex-col gap-2">
            <Input
              aria-label={`Edit ${topic.title}`}
              className="w-full"
              maxLength={200}
              autoFocus
              value={editing.title}
              onKeyDown={keys}
              onChange={(event) => onEdit({ ...editing, title: event.target.value })}
            />
            {keywords.length === 0 ? null : (
              <div className="grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
                {keywords.map((name) => (
                  <Field key={name} label={name} tip="planning.schedule.held-keywords">
                    <Input
                      maxLength={2000}
                      placeholder={everyRun(name) || "Not set"}
                      value={editing.values[name] ?? ""}
                      onKeyDown={keys}
                      onChange={(event) =>
                        onEdit({
                          ...editing,
                          values: { ...editing.values, [name]: event.target.value },
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            )}
          </div>
        )
      }
      meta={editing === undefined ? heldValuesLine(topic.values) : undefined}
      actions={
        editing !== undefined ? (
          <>
            <Button
              size="small"
              disabled={busy || editing.title.trim() === ""}
              disabledReason={busy ? "Saving" : "Write a title first"}
              onClick={onSave}
            >
              Save
            </Button>
            <Button variant="quiet" size="small" onClick={onCancel}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="small" disabled={busy} onClick={onApprove}>
              Approve
            </Button>
            <Button
              variant="quiet"
              size="small"
              disabled={busy}
              onClick={() => onEdit({ id: topic.id, title: topic.title, values: topic.values })}
            >
              Edit
            </Button>
            <Button variant="quiet" size="small" disabled={busy} onClick={onReject}>
              Reject
            </Button>
          </>
        )
      }
    />
  );
}
