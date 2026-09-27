import { PencilIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { Button, IconButton } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { RowSelect } from "@/components/kit/list-row";
import { useToast } from "@/components/kit/toast";
import type { HelpId } from "@/help/catalog";

// The sentence for a rename the server refused, from the fields it named (a name already taken
// in this kind, one too long).
export function refusedName(fields: readonly { readonly message: string }[]): string {
  const said = fields.map((field) => field.message).join(" ");
  return `The name wasn't saved. ${said === "" ? "Pick another name and press Save name again." : said}`;
}

// The name cell of a Library row (prompts, intros and outros, templates), renamed where it is
// shown instead of in the full editor: Rename turns the name into a field, Enter or Save name
// saves it, Escape or Cancel leaves it. The toast after a rename carries Undo.
export function InlineName({
  name,
  onSelect,
  onRename,
  tip = "library.inline-rename",
  maxLength = 200,
}: {
  readonly name: string;
  // Picks the row for the detail beside the list, as the plain title would.
  readonly onSelect?: (() => void) | undefined;
  // Saves the new name. Resolves to null when saved, else the plain sentence to show.
  readonly onRename: (next: string) => Promise<string | null>;
  readonly tip?: HelpId;
  readonly maxLength?: number;
}): ReactElement {
  const notify = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  const run = async (next: string): Promise<string | null> => {
    try {
      return await onRename(next);
    } catch (cause) {
      return `The name wasn't saved: ${cause instanceof Error ? cause.message : "Slopify didn't answer."} Check that Slopify is running, then press Save name again.`;
    }
  };
  const save = async (): Promise<void> => {
    const next = value.trim();
    if (next === name) {
      setEditing(false);
      setError(null);
      return;
    }
    if (next === "") {
      setError("Write a name first, or press Cancel to keep the old one.");
      return;
    }
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const refused = await run(next);
    inFlight.current = false;
    setSaving(false);
    if (refused !== null) {
      setError(refused);
      return;
    }
    setEditing(false);
    setError(null);
    notify(`Renamed “${name}” to “${next}”.`, "success", {
      label: "Undo",
      run: () =>
        void run(name).then((undoRefused) => {
          if (undoRefused === null) notify(`Renamed back to “${name}”.`, "success");
          else notify(undoRefused, "error");
        }),
    });
  };
  const cancel = (): void => {
    setEditing(false);
    setValue(name);
    setError(null);
  };

  if (!editing)
    return (
      <span className="inline-flex min-w-0 items-center gap-1">
        {onSelect === undefined ? (
          <span className="min-w-0 break-words">{name}</span>
        ) : (
          <RowSelect onSelect={onSelect} className="min-w-0">
            {name}
          </RowSelect>
        )}
        <IconButton
          size="small"
          label={`Rename ${name}`}
          onClick={() => {
            setValue(name);
            setEditing(true);
          }}
        >
          <PencilIcon aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
      </span>
    );
  return (
    <span className="flex min-w-0 flex-col gap-1" {...helpScope}>
      <span className="flex min-w-0 flex-wrap items-center gap-1">
        <Input
          autoFocus
          aria-label={`New name for ${name}`}
          aria-invalid={error !== null}
          maxLength={maxLength}
          value={value}
          className="min-w-0 flex-1"
          onChange={(event) => {
            setValue(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            } else if (event.key === "Escape") {
              event.preventDefault();
              cancel();
            }
          }}
        />
        <Button size="small" variant="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save name"}
        </Button>
        <Button size="small" variant="quiet" disabled={saving} onClick={cancel}>
          Cancel
        </Button>
        <InfoTip id={tip} label="Rename" />
      </span>
      {error === null ? null : (
        <span role="alert" className="text-small font-normal text-danger">
          {error}
        </span>
      )}
    </span>
  );
}
