import type { NarrationAlias } from "@app/kernel/ports/narration-aliases.js";
import { type ReactElement, useId, useState } from "react";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";

export interface ParsedAliases {
  readonly aliases: readonly NarrationAlias[];
  // 1-based line numbers that were not "written = spoken".
  readonly skipped: readonly number[];
}

// One alias per line: "Dr. = Doctor". A tab works too, so two columns copied from a spreadsheet
// paste as they are. The first separator splits the line; blank lines are ignored.
export function parseAliasLines(text: string): ParsedAliases {
  const aliases: NarrationAlias[] = [];
  const skipped: number[] = [];
  for (const [index, line] of text.split(/\r?\n/u).entries()) {
    if (line.trim() === "") continue;
    const at = line.search(/[=\t]/u);
    const written = at < 0 ? "" : line.slice(0, at).trim();
    const spoken = at < 0 ? "" : line.slice(at + 1).trim();
    if (written === "" || spoken === "") {
      skipped.push(index + 1);
      continue;
    }
    aliases.push({ written, spoken, wholeWord: true, caseSensitive: false });
  }
  return { aliases, skipped };
}

// Folds pasted aliases into the list: a written form already in the list gets the new spoken
// form, anything else is added at the end.
export function mergeAliases<R extends NarrationAlias>(
  rows: readonly R[],
  pasted: readonly NarrationAlias[],
  make: (alias: NarrationAlias) => R,
): { readonly rows: readonly R[]; readonly added: number; readonly updated: number } {
  const next = [...rows];
  let added = 0;
  let updated = 0;
  for (const alias of pasted) {
    const at = next.findIndex((row) => row.written.trim() === alias.written);
    const existing = at < 0 ? undefined : next[at];
    if (existing === undefined) {
      next.push(make(alias));
      added += 1;
    } else if (existing.spoken.trim() !== alias.spoken) {
      next[at] = { ...existing, spoken: alias.spoken };
      updated += 1;
    }
  }
  return { rows: next, added, updated };
}

// Paste many: one alias per line, added to the list on screen (Save aliases keeps them).
export function PasteAliasesDialog({
  open,
  onClose,
  onAdd,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onAdd: (aliases: readonly NarrationAlias[]) => void;
}): ReactElement {
  const [text, setText] = useState("");
  const id = useId();
  const parsed = parseAliasLines(text);
  const close = () => {
    setText("");
    onClose();
  };
  const count = parsed.aliases.length;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Paste aliases"
      description="One alias per line, the written form, then = and how to say it. A tab between two columns works too."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={count === 0}
            disabledReason="Paste at least one line like Dr. = Doctor"
            onClick={() => {
              onAdd(parsed.aliases);
              close();
            }}
          >
            {count === 0
              ? "Add aliases"
              : `Add ${String(count)} ${count === 1 ? "alias" : "aliases"}`}
          </Button>
        </>
      }
    >
      <div className="grid gap-1" {...helpScope}>
        <span className="flex items-center gap-1 text-label text-ink-2">
          <label htmlFor={`${id}-lines`}>Aliases, one per line</label>
          <InfoTip id="library.aliases" />
        </span>
        <Textarea
          id={`${id}-lines`}
          rows={8}
          value={text}
          placeholder={"Dr. = Doctor\nSt. = Saint"}
          aria-describedby={parsed.skipped.length === 0 ? undefined : `${id}-skipped`}
          onChange={(event) => setText(event.target.value)}
        />
        <p id={`${id}-skipped`} className="m-0 min-h-5 text-small text-waiting" role="status">
          {parsed.skipped.length === 0
            ? ""
            : `${parsed.skipped.length === 1 ? "Line" : "Lines"} ${parsed.skipped.join(", ")} ${
                parsed.skipped.length === 1 ? "is" : "are"
              } skipped: write the word, then =, then how to say it.`}
        </p>
      </div>
    </Dialog>
  );
}
