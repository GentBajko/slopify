import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { stageWords } from "@/lib/stage-words";
import { cn } from "@/lib/utils";
import {
  checkFirstRun,
  type FirstRunView,
  onboardingKey,
  readFirstRun,
  type ShortGap,
} from "@/onboarding/api";

// Where a fix in Settings was opened from, so Settings can offer the way back ("Back to the
// welcome") and the welcome reopens at the same step.
export interface ChecklistBack {
  readonly return: "welcome";
  readonly step: string;
}

type Need = ShortGap["need"];
// The parts by their stage names, as Settings' readiness lines name the same parts.
const needNames: Readonly<Record<Need, string>> = {
  text: stageWords.article,
  voice: stageWords.audio,
  images: stageWords.images,
};

// "Claude Code CLI" is "Claude Code" to a person: the tool, not how Slopify talks to it.
export const plainName = (name: string): string => name.replace(/ CLI$/, "");

// Who does a part that is ready, in a sentence.
function readyLine(need: Need, part: FirstRunView["needs"]["text"]): string {
  const by = plainName(part.by ?? "");
  const means = part.how === "sign-in" ? "your sign-in" : "your key";
  if (need === "text") return `${by} writes it with ${means}.`;
  if (need === "images") return `${by} makes the images with ${means}.`;
  return part.how === "computer"
    ? `Your computer's own voice (${by}) reads it aloud, for free. A voice key sounds better.`
    : `${by} reads it aloud with ${means}.`;
}

// The one button that fixes a gap: a key for that part, opened at its service in Settings
// (OpenAI first for the voice: the voices Slopify sets up are OpenAI's, so its key works at
// once), or the Voices page when a voice service has a key but no voice saved.
function FixLink({
  need,
  fix,
  back,
  variant = "secondary",
}: {
  readonly need: Need;
  readonly fix: ShortGap["fix"];
  readonly back: ChecklistBack | undefined;
  readonly variant?: "secondary" | "quiet";
}): ReactElement {
  const from = back ?? {};
  if (fix === "saved-voice")
    return (
      <ButtonLink variant={variant} to="/settings" search={{ section: "voices", ...from }}>
        Save a voice
      </ButtonLink>
    );
  const where = {
    text: { family: "llm", provider: "openrouter", words: "Add a key for writing" },
    voice: { family: "tts", provider: "openai-tts", words: "Add a voice key" },
    images: { family: "image", provider: "openai-image", words: "Add an image key" },
  } as const;
  const { family, provider, words } = where[need];
  return (
    <ButtonLink
      variant={variant}
      to="/settings"
      search={{ section: "providers", family, provider, ...from }}
    >
      {words}
    </ButtonLink>
  );
}

// How to install the computer's own free voice from a terminal, folded: most people add a key
// instead, and the commands are for the few who want neither.
function InstallFold({ install }: { readonly install: NonNullable<ShortGap["install"]> }) {
  return (
    <Fold summary="Use your computer's free voice instead" className="mt-1">
      <p className="m-0 text-small text-ink-2">{install.text}</p>
      <pre className="my-2 overflow-x-auto rounded-sm bg-sunken px-3 py-2 font-mono text-small text-ink">
        {install.commands.join("\n")}
      </pre>
      <p className="m-0 text-small text-ink-2">Then press Check again.</p>
    </Fold>
  );
}

// One gap as its own line: the part, what is missing and the button that fixes it.
function GapRow({
  gap,
  back,
}: {
  readonly gap: ShortGap;
  readonly back?: ChecklistBack | undefined;
}): ReactElement {
  return (
    <NeedRow
      need={gap.need}
      status={
        <Status tone="waiting">
          {gap.fix === "saved-voice" ? "No voice saved" : "Needs setup"}
        </Status>
      }
      line={gap.message}
      action={<FixLink need={gap.need} fix={gap.fix} back={back} />}
      more={gap.install === undefined ? undefined : <InstallFold install={gap.install} />}
    />
  );
}

function NeedRow({
  need,
  status,
  line,
  action,
  more,
}: {
  readonly need: Need;
  readonly status: ReactNode;
  readonly line: string;
  readonly action?: ReactNode;
  readonly more?: ReactNode;
}): ReactElement {
  return (
    <ListRow
      title={
        <span className="flex items-center gap-3">
          <span className="w-20 shrink-0">{needNames[need]}</span>
          {status}
        </span>
      }
      meta={<span className="block pl-19 max-sm:pl-0">{line}</span>}
      actions={action}
    >
      {more === undefined ? null : <div className="pl-19 max-sm:pl-0">{more}</div>}
    </ListRow>
  );
}

// What a 60-second short needs, the script, a voice and the images, each with who does it or
// the one button that fixes it. The server's view says it, from the same check that refuses
// the short, so this list and a refusal never disagree. Self-contained: the welcome's first
// step and Home on a fresh install both render it as it is.
export function SetupChecklist({
  back,
  className,
}: {
  // Set on the welcome, so its fixes lead back to the step they left.
  readonly back?: ChecklistBack;
  readonly className?: string;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const view = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const check = useMutation({
    mutationFn: () => checkFirstRun(api),
    onSuccess: (next) => client.setQueryData(onboardingKey, next),
  });
  const needs = view.data?.needs;
  if (needs === undefined)
    return view.error === null ? (
      <List label="What a short needs" className={cn(className)}>
        <ListRow title="Checking this computer…" />
      </List>
    ) : (
      <p role="alert" className={cn("m-0 text-small text-danger", className)}>
        {`Slopify couldn't check this computer: ${view.error.message}`}
      </p>
    );
  const missing = needs.gaps.length > 0;
  return (
    <div className={className}>
      <List label="What a short needs" className="sl-list--wrap-meta">
        {(["text", "voice", "images"] as const).map((need) => {
          const gap = needs.gaps.find((one) => one.need === need);
          const part = needs[need];
          if (gap !== undefined) return <GapRow key={need} gap={gap} back={back} />;
          return (
            <NeedRow
              key={need}
              need={need}
              status={<Status tone="done">Ready</Status>}
              line={readyLine(need, part)}
              action={
                need === "voice" && part.how === "computer" ? (
                  <FixLink need="voice" fix="key" back={back} variant="quiet" />
                ) : undefined
              }
            />
          );
        })}
      </List>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {missing ? (
          <Button size="small" disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? "Checking…" : "Check again"}
          </Button>
        ) : null}
        <TextLink to="/settings" search={{ section: "providers", ...(back ?? {}) }}>
          Other tools and services Slopify can use
        </TextLink>
      </div>
      {check.error === null ? null : (
        <p role="alert" className="m-0 mt-2 text-small text-danger">
          {check.error.message}
        </p>
      )}
    </div>
  );
}
