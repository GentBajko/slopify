import { readinessIsUsable } from "@app/kernel/ports/model.js";
import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Status } from "@/components/kit/status";
import { providersQuery } from "@/queries";

// What each kind of work needs connected, said first on Connections: text for articles and
// scripts, a voice for narration, an image provider for pictures. A family with nothing usable
// says which kind of work waits on it; work that doesn't use it is never held up by it.
const families: readonly {
  readonly family: ProviderFamily;
  readonly label: string;
  readonly needed: string;
}[] = [
  { family: "llm", label: "Text", needed: "articles, scripts and descriptions" },
  { family: "tts", label: "Voice", needed: "narration, audiobooks and podcasts" },
  { family: "image", label: "Images", needed: "images and videos" },
];

export function readinessLines(
  providers: readonly ProviderStatus[],
): readonly { readonly label: string; readonly ready: boolean; readonly text: string }[] {
  return families.map(({ family, label, needed }) => {
    const usable = providers.filter(
      (provider) => provider.family === family && readinessIsUsable(provider.readiness),
    );
    return {
      label,
      ready: usable.length > 0,
      text:
        usable.length > 0
          ? usable.map((provider) => provider.displayName).join(", ")
          : `Not connected: needed for ${needed}. Set one up below.`,
    };
  });
}

export function ConnectionReadiness(): ReactElement | null {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  if (providers.data === undefined) return null;
  return (
    <ul aria-label="What is connected" className="m-0 flex list-none flex-col gap-1 p-0">
      {readinessLines(providers.data.providers).map((line) => (
        <li key={line.label} className="flex min-w-0 flex-wrap items-baseline gap-x-3 text-small">
          <span className="w-16 shrink-0 font-semibold text-ink">{line.label}</span>
          <Status tone={line.ready ? "done" : "waiting"}>
            {line.ready ? "Ready" : "Needs setup"}
          </Status>
          <span className="min-w-0 text-ink-2">{line.text}</span>
        </li>
      ))}
    </ul>
  );
}
