import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";

// The line under a number that has a default, once it was changed: what the default is, and a
// Reset that puts it back. Unchanged, there is no line: a lone "Default" under a box said nothing.
export function ResetToDefault({
  changed,
  defaultText,
  label,
  onReset,
}: {
  readonly changed: boolean;
  // The default as the field writes it, e.g. "-18 dB".
  readonly defaultText: string;
  // What is reset, for the button's accessible name, e.g. "ambient level".
  readonly label: string;
  readonly onReset: () => void;
}): ReactElement | null {
  if (!changed) return null;
  return (
    <span className="mt-1 flex min-h-7 items-center gap-2 text-label text-ink-2">
      <span>{`Changed · default ${defaultText}`}</span>
      <Button
        variant="quiet"
        size="small"
        aria-label={`Reset ${label} to ${defaultText}`}
        onClick={onReset}
      >
        Reset
      </Button>
    </span>
  );
}
