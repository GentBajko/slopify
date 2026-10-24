import { type Format, formats } from "@app/kernel/pipeline.js";
import { type ReactElement, useId } from "react";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

// Each shape said by what it is for, so the first question ("is it for YouTube or for
// phones?") is answered by the tile itself.
const shapes: Readonly<Record<Format, { readonly name: string; readonly use: string }>> = {
  "16:9": { name: "Landscape", use: "YouTube and screens" },
  "9:16": { name: "Portrait", use: "Shorts and phones" },
  "1:1": { name: "Square", use: "Feeds" },
};

export function FormatPicker({
  value,
  onPick,
}: {
  readonly value: Format;
  readonly onPick: (format: Format) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className="flex w-full flex-col gap-2" {...helpScope}>
      <span id={id} className="sl-field__label block">
        Frame format
      </span>
      <ToggleGroup
        type="single"
        value={value}
        aria-labelledby={id}
        // As many tiles to a line as fit, so a narrow column stacks them rather than cutting
        // their words.
        className="grid w-full max-w-[720px] grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-3 overflow-visible border-0"
        onValueChange={(next) => {
          const picked = formats.find((format) => format === next);
          if (picked !== undefined) onPick(picked);
        }}
      >
        {formats.map((format) => (
          <ToggleGroupItem
            key={format}
            value={format}
            data-play-field={value === format ? "format" : undefined}
            aria-label={`${format} ${shapes[format].name}`}
            className="flex min-h-16 min-w-0 items-center justify-start gap-3 rounded-control border border-line-strong bg-surface px-3 py-2 last:border-r data-[state=on]:border-focus data-[state=on]:shadow-none"
          >
            <span
              className="flex h-10 w-12 shrink-0 items-center justify-center"
              aria-hidden="true"
            >
              <span
                data-format-shape={format}
                className="block rounded-[2px] border-2 border-current"
                style={{
                  width: format === "16:9" ? 44 : format === "1:1" ? 28 : 20,
                  aspectRatio: format.replace(":", " / "),
                }}
              />
            </span>
            <span className="min-w-0 text-left">
              <span className="block text-body font-semibold">{shapes[format].name}</span>
              <span className="block text-label text-ink-2">
                {format} · {shapes[format].use}
              </span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <HelpLine>The images are drawn in this shape. Shorts are always portrait.</HelpLine>
    </div>
  );
}
