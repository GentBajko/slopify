import { useRouter } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { type ButtonVariant, buttonClass } from "@/components/kit/button";

// Where a person came to Settings from, to add a key on the way: the welcome (at a step) or
// Create. While it is set, Settings offers the way back (`?return=welcome&step=make`).
export interface SettingsBack {
  readonly to: "welcome" | "play";
  readonly step?: string | undefined;
}

export function backHref(back: SettingsBack): string {
  if (back.to === "play") return "/play";
  return back.step === undefined ? "/welcome" : `/welcome?step=${encodeURIComponent(back.step)}`;
}

// "the welcome", "Create": the screen the way back leads to, as a button says it.
export function backPlace(back: SettingsBack): string {
  return back.to === "play" ? "Create" : "the welcome";
}

// The way back as a button-looking link. It goes by address rather than by route, since the
// step it returns to is the welcome's own business; the router still moves without a reload.
export function BackLink({
  back,
  variant = "secondary",
  children,
}: {
  readonly back: SettingsBack;
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}): ReactElement {
  const router = useRouter();
  const href = backHref(back);
  return (
    <a
      href={href}
      data-slot="button-link"
      className={buttonClass({ variant })}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void router.navigate({ href });
      }}
    >
      {children}
    </a>
  );
}
