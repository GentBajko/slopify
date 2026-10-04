import { type ComponentProps, type ReactElement, useRef } from "react";
import { Input } from "@/components/kit/field";
import { parseHex } from "@/lib/hex-colour";
import { cn } from "@/lib/utils";

// A hex box with a swatch that opens the system colour picker. What is typed stays as typed;
// while it is not a whole colour the swatch keeps showing the last whole one, dimmed, and never
// jumps to black. An empty box shows an empty swatch.
export function ColourInput({
  value,
  onChange,
  pickerLabel,
  className,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type"> & {
  readonly value: string;
  readonly onChange: (value: string) => void;
  // The swatch's name: "Caption colour picker".
  readonly pickerLabel: string;
}): ReactElement {
  const whole = parseHex(value);
  const last = useRef<string | undefined>(whole);
  if (whole !== undefined) last.current = whole;
  if (value.trim() === "") last.current = undefined;
  const shown = whole ?? last.current;
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <span
        data-partial={whole === undefined && shown !== undefined ? "" : undefined}
        className="relative size-8 shrink-0 overflow-hidden rounded-control border border-line-strong data-[partial]:opacity-40"
        style={{
          background:
            shown ??
            "repeating-linear-gradient(45deg, transparent 0 4px, var(--color-line) 4px 5px)",
        }}
      >
        <input
          type="color"
          aria-label={pickerLabel}
          value={shown ?? "#ffffff"}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onChange={(event) => onChange(event.target.value)}
        />
      </span>
      <Input
        {...props}
        className="w-28 font-mono"
        spellCheck={false}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  );
}
