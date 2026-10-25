import type { ProviderFamily } from "@app/slices/settings/model.js";
import { useRouterState } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { ButtonLink, TextLink } from "@/components/kit/link";
import type { SettingsSection } from "./settings-sections";

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

// What a link into Settings adds so Settings offers the way back: `return=play` from Create,
// where the setup being made waits as a draft. The pickers that link to Settings are shared
// with Edit template, the cast editor and a project's settings, which keep no such way back,
// so the page the link sits on decides.
function useSettingsReturn(): { readonly return?: "play" } {
  const onCreate = useRouterState({ select: (state) => state.location.pathname === "/play" });
  return onCreate ? { return: "play" } : {};
}

// A link into Settings from a control several screens share: on Create it carries the way
// back, so Settings offers "Back to Create" and a saved key "Done · back to Create".
export function SettingsLink({
  search,
  children,
}: {
  readonly search: {
    readonly section: SettingsSection;
    readonly family?: ProviderFamily;
    readonly provider?: string;
  };
  readonly children: ReactNode;
}): ReactElement {
  const back = useSettingsReturn();
  return (
    <TextLink to="/settings" search={{ ...search, ...back }}>
      {children}
    </TextLink>
  );
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
