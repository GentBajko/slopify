import { readinessIsUsable } from "@app/kernel/ports/model.js";
import type { ProviderDefaults } from "@app/slices/settings/first-run.js";
import type { ProviderFamily, ProviderStatus } from "@app/slices/settings/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Status } from "@/components/kit/status";
import { type HealthRun, ProviderHealthCheck } from "@/components/provider-health";
import { readFirstRun, upkeepKeys } from "@/components/provider-upkeep-api";
import { stageWords } from "@/lib/stage-words";
import { providersQuery } from "@/queries";

// What each part of a video needs, said first on Keys & services, by the stage it serves: the
// article (and titles and descriptions) needs a writing service, the narration a voice service,
// the images an image service. A part with nothing usable says what the video will lack; each
// line's button opens that kind's list below.
const families: readonly {
  readonly family: ProviderFamily;
  readonly label: string;
  // What the button says while the part has nothing usable, and once it has.
  readonly setUp: string;
  readonly show: string;
  readonly lacking: string;
}[] = [
  {
    family: "llm",
    label: stageWords.article,
    setUp: "Set up a writing service",
    show: "Show writing services",
    lacking: "No writing service yet, so nothing can write the article, title or description.",
  },
  {
    family: "tts",
    label: stageWords.audio,
    setUp: "Set up a voice service",
    show: "Show voice services",
    lacking: "No voice service yet, so videos have no narration.",
  },
  {
    family: "image",
    label: stageWords.images,
    setUp: "Set up an image service",
    show: "Show image services",
    lacking: "No image service yet, so videos have no pictures.",
  },
];

interface ReadinessLine {
  readonly family: ProviderFamily;
  readonly label: string;
  readonly ready: boolean;
  readonly text: string;
  readonly action: string;
}

// The one the welcome picked for Create from what it found on this computer, when it is still
// usable: "Create picks Claude Code CLI".
function pickedFor(
  family: ProviderFamily,
  usable: readonly ProviderStatus[],
  defaults: ProviderDefaults | undefined,
): string | undefined {
  const choice =
    family === "llm" ? defaults?.llm : family === "image" ? defaults?.images : undefined;
  return usable.find((provider) => provider.id === choice?.provider)?.displayName;
}

export function readinessLines(
  providers: readonly ProviderStatus[],
  defaults?: ProviderDefaults,
): readonly ReadinessLine[] {
  return families.map(({ family, label, setUp, show, lacking }) => {
    const usable = providers.filter(
      (provider) => provider.family === family && readinessIsUsable(provider.readiness),
    );
    const picked = pickedFor(family, usable, defaults);
    // The one Create picks is named first and marked; the others follow.
    const names = [
      ...(picked === undefined ? [] : [`${picked} (Create picks it)`]),
      ...usable.map((provider) => provider.displayName).filter((name) => name !== picked),
    ].join(", ");
    return {
      family,
      label,
      ready: usable.length > 0,
      text: usable.length === 0 ? lacking : names,
      action: usable.length === 0 ? setUp : show,
    };
  });
}

export function ConnectionReadiness({
  health,
  onShow,
}: {
  // Check every service, held by the page so its report stays while the person scrolls.
  readonly health?: HealthRun;
  // Opens and scrolls to that kind's services.
  readonly onShow?: (family: ProviderFamily) => void;
}): ReactElement | null {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const firstRun = useQuery({
    queryKey: upkeepKeys.firstRun,
    queryFn: () => readFirstRun(api),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (providers.data === undefined) return null;
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="What your videos have" className="sl-list m-0 list-none p-0">
        {readinessLines(providers.data.providers, firstRun.data?.defaults).map((line) => (
          <li
            key={line.family}
            className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-x-3 gap-y-1 border-b border-line py-2 md:grid-cols-[88px_112px_minmax(0,1fr)_auto]"
          >
            <span className="font-semibold text-ink">{line.label}</span>
            <Status tone={line.ready ? "done" : "waiting"}>
              {line.ready ? "Ready" : "Needs setup"}
            </Status>
            <span className="min-w-0 text-small text-ink-2 max-md:col-span-2">{line.text}</span>
            {onShow === undefined ? null : (
              <Button
                size="small"
                variant={line.ready ? "quiet" : "secondary"}
                className="justify-self-start max-md:col-span-2"
                onClick={() => onShow(line.family)}
              >
                {line.action}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {health === undefined ? null : <ProviderHealthCheck run={health} />}
    </div>
  );
}
