import type { Format } from "@app/kernel/pipeline.js";
import { type ReactElement, useId } from "react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export function FormatPicker({
  value,
  onPick,
}: {
  readonly value: Format;
  readonly onPick: (format: Format) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className="w-full">
      <Label id={id} className="mb-2">
        Frame format
      </Label>
      <ToggleGroup
        type="single"
        value={value}
        aria-labelledby={id}
        className="w-full max-w-[400px] gap-3 overflow-visible border-0"
        onValueChange={(next) => {
          if (next === "16:9" || next === "9:16") onPick(next);
        }}
      >
        {(["16:9", "9:16"] as const).map((format) => (
          <ToggleGroupItem
            key={format}
            value={format}
            data-play-field={value === format ? "format" : undefined}
            aria-label={format}
            className="flex h-28 min-w-0 flex-1 items-center justify-center gap-4 rounded-control border border-line2 bg-panel p-3 last:border-r data-[state=on]:border-accent data-[state=on]:shadow-none"
          >
            <span className="flex h-12 items-center justify-center" aria-hidden="true">
              <span
                data-format-shape={format}
                className="block rounded-[2px] border-2 border-current"
                style={{
                  width: format === "16:9" ? 64 : 27,
                  aspectRatio: format === "16:9" ? "16 / 9" : "9 / 16",
                }}
              />
            </span>
            <span className="text-left">
              <span className="block text-body font-semibold">{format}</span>
              <span className="text-label text-ink3">
                {format === "16:9" ? "Landscape" : "Portrait"}
              </span>
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
