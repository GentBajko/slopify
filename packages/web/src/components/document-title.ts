import { useEffect } from "react";

// The browser tab says where you are: "Cleopatra · Images · Slopify", "Settings · Trash ·
// Slopify". The shell names the destination from the address; a screen that knows more (the
// project's title, the channel's name) says so while it is mounted, and the innermost wins.

const app = "Slopify";
let fallback: string | undefined;
const named: { readonly title: string }[] = [];

function apply(): void {
  if (typeof document === "undefined") return;
  const title = named.at(-1)?.title ?? fallback;
  document.title = title === undefined || title === "" ? app : `${title} · ${app}`;
}

// The shell's name for the destination, used while no screen names itself.
export function setFallbackTitle(title: string | undefined): void {
  fallback = title;
  apply();
}

export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title === undefined || title === "") return;
    const entry = { title };
    named.push(entry);
    apply();
    return () => {
      named.splice(named.indexOf(entry), 1);
      apply();
    };
  }, [title]);
}

// The destination's name from the address, for the shell.
export function titleForPath(pathname: string): string | undefined {
  const rules: readonly (readonly [RegExp, string])[] = [
    [/^\/$/, "Home"],
    [/^\/projects\/?$/, "Projects"],
    [/^\/projects\/[^/]+/, "Project"],
    [/^\/play/, "Create"],
    [/^\/calendar/, "Calendar"],
    [/^\/schedules/, "Calendar"],
    [/^\/channels\/?$/, "Channels"],
    [/^\/channels\/[^/]+/, "Channel"],
    [/^\/prompts/, "Prompts"],
    [/^\/entries/, "Prompts · Intros and outros"],
    [/^\/templates\/[^/]+/, "Edit template"],
    [/^\/templates/, "Templates"],
    [/^\/designs\/?$/, "Templates · Designs"],
    [/^\/designs\/[^/]+/, "Design"],
    [/^\/design-templates\/[^/]+/, "Design template"],
    [/^\/document-themes/, "PDF looks"],
    [/^\/narration-aliases/, "Pronunciation"],
    [/^\/ab-results/, "What worked on YouTube"],
    [/^\/settings/, "Settings"],
    [/^\/help/, "Help · Tutorials"],
    [/^\/welcome/, "Welcome"],
  ];
  return rules.find(([pattern]) => pattern.test(pathname))?.[1];
}
