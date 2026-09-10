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
        Format
      </Label>
      <ToggleGroup
        type="single"
        value={value}
        aria-labelledby={id}
        className="w-full"
        onValueChange={(next) => {
          if (next === "16:9" || next === "9:16") onPick(next);
        }}
      >
        {(["16:9", "9:16"] as const).map((format) => (
          <ToggleGroupItem
            key={format}
            value={format}
            aria-label={format}
            className="flex h-24 min-w-0 flex-1 flex-col items-center justify-center gap-2 py-2"
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
            <span>{format}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
