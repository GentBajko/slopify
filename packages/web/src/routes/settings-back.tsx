import type { ReactElement, ReactNode } from "react";
import { ButtonLink } from "@/components/kit/link";

// Where a person came to Settings from, to add a key on the way: the welcome (at a step) or
// Create. While it is set, Settings offers the way back (`?return=welcome&step=make`).
export interface SettingsBack {
  readonly to: "welcome" | "play";
  readonly step?: string | undefined;
}

// "the welcome", "Create": the screen the way back leads to, as a button says it.
export function backPlace(back: SettingsBack): string {
  return back.to === "play" ? "Create" : "the welcome";
}

// The part of a Settings address that keeps the way back while the person moves on to another
// Settings page (from a key to Voices, or from Voices to a key).
export function backSearch(back: SettingsBack | undefined): {
  readonly return?: SettingsBack["to"];
  readonly step?: string;
} {
  if (back === undefined) return {};
  return back.step === undefined ? { return: back.to } : { return: back.to, step: back.step };
}

// The welcome's own validator keeps a step it knows and drops any other, so the step goes back
// as Settings was given it rather than as the welcome's type.
function welcomeSearch(step: string | undefined): never {
  return (step === undefined ? {} : { step }) as never;
}

// The way back, as a link with a button's look.
export function BackLink({
  back,
  variant = "secondary",
  children,
}: {
  readonly back: SettingsBack;
  readonly variant?: "primary" | "secondary";
  readonly children: ReactNode;
}): ReactElement {
  return back.to === "play" ? (
    <ButtonLink variant={variant} to="/play">
      {children}
    </ButtonLink>
  ) : (
    <ButtonLink variant={variant} to="/welcome" search={welcomeSearch(back.step)}>
      {children}
    </ButtonLink>
  );
}
