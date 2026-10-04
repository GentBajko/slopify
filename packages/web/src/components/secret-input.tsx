import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, type ReactElement, useState } from "react";
import { IconButton } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { cn } from "@/lib/utils";

// A key or token box: masked until Show is pressed, so a pasted key can be checked before it is
// saved without leaving it on screen by default. Hiding again is one press.
export function SecretInput({
  className,
  revealLabel = "key",
  ...props
}: Omit<ComponentProps<"input">, "type"> & {
  // What the toggle names: "Show key", "Hide token".
  readonly revealLabel?: string;
}): ReactElement {
  const [shown, setShown] = useState(false);
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      <Input {...props} type={shown ? "text" : "password"} className="min-w-0 flex-1" />
      <IconButton
        label={shown ? `Hide ${revealLabel}` : `Show ${revealLabel}`}
        aria-pressed={shown}
        onClick={() => setShown((now) => !now)}
      >
        {shown ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </IconButton>
    </span>
  );
}

// A token shown as text: masked dots until Show, with the same toggle.
export function SecretText({
  value,
  revealLabel = "token",
  className,
}: {
  readonly value: string | undefined;
  readonly revealLabel?: string;
  readonly className?: string;
}): ReactElement {
  const [shown, setShown] = useState(false);
  return (
    <span className={cn("flex min-w-0 items-center gap-1", className)}>
      <code className="sl-code min-w-0 flex-1 truncate py-2 select-all">
        {value === undefined ? "…" : shown ? value : "•".repeat(Math.min(value.length, 24))}
      </code>
      <IconButton
        label={shown ? `Hide ${revealLabel}` : `Show ${revealLabel}`}
        aria-pressed={shown}
        disabled={value === undefined}
        onClick={() => setShown((now) => !now)}
      >
        {shown ? <EyeOffIcon aria-hidden="true" /> : <EyeIcon aria-hidden="true" />}
      </IconButton>
    </span>
  );
}
