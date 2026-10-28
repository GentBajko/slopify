import { readinessIsUsable } from "@app/kernel/ports/model.js";
import type { ProviderDefaults } from "@app/slices/settings/first-run.js";
import type {
  ProviderFamily,
  ProviderId,
  ProviderStatus,
  Voice,
} from "@app/slices/settings/model.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ButtonLink } from "@/components/kit/link";
import { Status } from "@/components/kit/status";
import { type HealthRun, ProviderHealthCheck } from "@/components/provider-health";
import { firstRunQuery } from "@/components/provider-upkeep-api";
import { stageWords } from "@/lib/stage-words";
import { cn } from "@/lib/utils";
import { providersQuery, voicesQuery } from "@/queries";
import { backSearch, type SettingsBack } from "./settings-back";

// What each part of a video needs, said first on Keys & services, by the stage it serves: the
// article (and titles and descriptions) needs a writing service, the narration a voice service
// that can speak, the images an image service. A part with nothing usable says what the video
// will lack, in the state words the lists below and the welcome use, with its fix.
const families: readonly {
  readonly family: ProviderFamily;
  readonly label: string;
  // What the button says while the part has nothing usable.
  readonly setUp: string;
  readonly lacking: string;
}[] = [
  {
    family: "llm",
    label: stageWords.article,
    setUp: "Set up a writing service",
    lacking: "No writing service yet, so nothing can write the article, title or description.",
  },
  {
    family: "tts",
    label: stageWords.audio,
    setUp: "Set up a voice service",
    lacking: "No voice service yet, so videos have no narration.",
  },
  {
    family: "image",
    label: stageWords.images,
    setUp: "Set up an image service",
    lacking: "No image service yet, so videos have no pictures.",
  },
];

// The voice service whose key narrates at once: the first short saves its starter voice.
const keyNarrates: ProviderId = "openai-tts";

type ReadinessState = "ready" | "no-key" | "no-voice";

const stateWords: Readonly<Record<ReadinessState, string>> = {
  ready: "Ready",
  "no-key": "No key",
  "no-voice": "No voice saved",
};

interface ReadinessLine {
  readonly family: ProviderFamily;
  readonly label: string;
  readonly state: ReadinessState;
  readonly text: string;
  // The fix, while the part has none: open that kind's services, or (a voice service with a
  // key and no voice) the Voices page at that service. A ready line needs no button: its
  // services are listed right under it.
  readonly action?:
    | { readonly kind: "set-up"; readonly words: string }
    | { readonly kind: "voices"; readonly words: string; readonly provider: ProviderId };
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

// Whether a usable voice service can narrate: the computer's own voice and OpenAI (its key
// narrates with the voice the first short saves) at once, the others once a voice of theirs is
// saved. The welcome's checklist decides the same (`slices/onboarding/quick-short.ts`).
function narrates(provider: ProviderStatus, voices: readonly Voice[]): boolean {
  return (
    provider.readiness.kind === "local" ||
    provider.id === keyNarrates ||
    voices.some((voice) => voice.provider === provider.id)
  );
}

export function readinessLines(
  providers: readonly ProviderStatus[],
  defaults?: ProviderDefaults,
  voices: readonly Voice[] = [],
): readonly ReadinessLine[] {
  return families.map(({ family, label, setUp, lacking }) => {
    const usable = providers.filter(
      (provider) => provider.family === family && readinessIsUsable(provider.readiness),
    );
    const working =
      family === "tts" ? usable.filter((provider) => narrates(provider, voices)) : usable;
    if (working.length === 0) {
      const voiceless = family === "tts" ? usable : [];
      const first = voiceless[0];
      if (first !== undefined)
        return {
          family,
          label,
          state: "no-voice",
          text: `${voiceless.map((provider) => provider.displayName).join(", ")} ${voiceless.length === 1 ? "has" : "have"} a key but no voice saved yet, so videos have no narration.`,
          action: { kind: "voices", words: "Save a voice", provider: first.id },
        };
      return {
        family,
        label,
        state: "no-key",
        text: lacking,
        action: { kind: "set-up", words: setUp },
      };
    }
    const picked = pickedFor(family, working, defaults);
    // The one Create picks is named first and marked; the others follow.
    const names = [
      ...(picked === undefined ? [] : [`${picked} (Create picks it)`]),
      ...working.map((provider) => provider.displayName).filter((name) => name !== picked),
    ].join(", ");
    return { family, label, state: "ready", text: names };
  });
}

export function ConnectionReadiness({
  health,
  onShow,
  back,
}: {
  // Check every service, held by the page so its report stays while the person scrolls.
  readonly health?: HealthRun;
  // Opens and scrolls to that kind's services.
  readonly onShow?: (family: ProviderFamily) => void;
  // The screen the person came to Settings from, kept on the way to Voices.
  readonly back?: SettingsBack | undefined;
}): ReactElement | null {
  const { api } = useApp();
  const providers = useQuery(providersQuery(api));
  const voices = useQuery(voicesQuery(api));
  // The welcome's picks only add "(Create picks it)" to a line that keeps its one-line height,
  // so they are not waited for: they can take a moment while Slopify asks the tools.
  const firstRun = useQuery(firstRunQuery(api));
  // Drawn once the voices are in too, so a voice service never reads No voice saved for a
  // moment before its voices arrive. The lists below wait for the same answers before a link
  // scrolls to a service (`components/provider-keys.tsx`).
  if (providers.data === undefined || voices.isPending) return null;
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="What your videos have" className="sl-list m-0 list-none p-0">
        {readinessLines(
          providers.data.providers,
          firstRun.data?.defaults,
          voices.data?.voices ?? [],
        ).map((line) => (
          // On a phone each line is the part, its state and its button on one row (the button
          // drops under them when it can't fit), and the services' names stay for the wider
          // screen: the lists below say the same, and the key box comes into the first screen.
          <li
            key={line.family}
            className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 md:grid md:grid-cols-[88px_136px_minmax(0,1fr)_auto]"
          >
            <span className="w-[88px] shrink-0 font-semibold text-ink md:w-auto">{line.label}</span>
            <Status tone={line.state === "ready" ? "done" : "waiting"}>
              {stateWords[line.state]}
            </Status>
            {/* A ready line lists its services, and "(Create picks it)" arrives later: it keeps
                to one line so that answer never moves the page. A line still to set up says
                what the video lacks in full. */}
            <span
              className={cn(
                "min-w-0 text-small text-ink-2 max-md:hidden",
                line.state === "ready" && "truncate",
              )}
              title={line.state === "ready" ? line.text : undefined}
            >
              {line.text}
            </span>
            {line.action === undefined ? null : line.action.kind === "voices" ? (
              <ButtonLink
                size="small"
                className="justify-self-start max-md:ml-auto"
                to="/settings"
                search={{ section: "voices", provider: line.action.provider, ...backSearch(back) }}
              >
                {line.action.words}
              </ButtonLink>
            ) : onShow === undefined ? null : (
              <Button
                size="small"
                className="justify-self-start max-md:ml-auto"
                onClick={() => onShow(line.family)}
              >
                {line.action.words}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {health === undefined ? null : <ProviderHealthCheck run={health} />}
    </div>
  );
}
