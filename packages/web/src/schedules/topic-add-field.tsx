import { PlusIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { cn } from "@/lib/utils";
import { topicLines } from "./topic-rows";

// The field that adds topics to a queue: Enter adds what is typed, and pasting several lines
// adds one topic per line in one save. Esc empties it, or closes it when it was opened for one
// place in the list (Insert below).
export function TopicAddField({
  label,
  placeholder,
  buttonLabel,
  disabled,
  disabledReason,
  autoFocus = false,
  className,
  onAdd,
  onCancel,
}: {
  readonly label: string;
  readonly placeholder: string;
  readonly buttonLabel: string;
  readonly disabled: boolean;
  readonly disabledReason: string;
  readonly autoFocus?: boolean;
  readonly className?: string;
  // Resolves true once saved, which empties the field.
  readonly onAdd: (titles: readonly string[]) => Promise<boolean>;
  readonly onCancel?: () => void;
}): ReactElement {
  const [draft, setDraft] = useState("");
  const submit = async (titles: readonly string[]): Promise<void> => {
    if (await onAdd(titles)) setDraft("");
  };
  return (
    <form
      className={cn("flex flex-wrap items-center gap-2", className)}
      onSubmit={(event) => {
        event.preventDefault();
        void submit(topicLines(draft));
      }}
    >
      <Input
        aria-label={label}
        placeholder={placeholder}
        maxLength={200}
        value={draft}
        autoFocus={autoFocus}
        className="min-w-0 flex-1"
        onChange={(event) => setDraft(event.target.value)}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text");
          if (!/\r?\n/.test(text.trim())) return;
          event.preventDefault();
          void submit(topicLines(`${draft}${text}`));
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          if (onCancel !== undefined) {
            event.preventDefault();
            onCancel();
          } else if (draft !== "") {
            event.preventDefault();
            setDraft("");
          }
        }}
      />
      <Button type="submit" size="small" disabled={disabled} disabledReason={disabledReason}>
        <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {buttonLabel}
      </Button>
      {onCancel === undefined ? null : (
        <Button variant="quiet" size="small" onClick={onCancel}>
          Cancel
        </Button>
      )}
    </form>
  );
}
