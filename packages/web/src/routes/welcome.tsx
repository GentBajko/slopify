import type { SampleId } from "@app/slices/onboarding/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { type FormEvent, type ReactElement, type ReactNode, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { AutostartOffer } from "@/autostart/autostart-settings";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input } from "@/components/kit/field";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { hitTarget, List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { SetupChecklist } from "@/components/welcome";
import {
  dismissFirstRun,
  type FirstRunView,
  makeShort,
  onboardingKey,
  readFirstRun,
  type ShortGap,
} from "@/onboarding/api";
import { keys } from "@/queries";

// The bundled samples, each with what it shows and the button that opens it.
const samples: readonly {
  readonly id: SampleId;
  readonly name: string;
  readonly summary: string;
  readonly action: string;
}[] = [
  {
    id: "library",
    name: "The Library of Alexandria",
    summary: "A narrated video with its two shorts, article, PDF, description and images.",
    action: "Explore the sample",
  },
  {
    id: "audiobook",
    name: "The Wind in the Willows",
    summary:
      "An audiobook: a narrator and two character voices, captions tagged with who speaks, MP3 and M4B with chapters.",
    action: "See an audiobook",
  },
  {
    id: "podcast",
    name: "The Antikythera Mechanism",
    summary:
      "A two-host podcast with the speaker panel, name tags and portraits, and its MP3 and M4B.",
    action: "Hear a podcast",
  },
];

// The three steps, in order. The step is in the address (?step=style), so a detour to
// Settings for a key, or a reload, comes back to it.
export const welcomeSteps = ["found", "style", "make"] as const;
export type WelcomeStep = (typeof welcomeSteps)[number];
const stepNames: Readonly<Record<WelcomeStep, string>> = {
  found: "What a short needs",
  style: "Pick a style",
  make: "Make your first short",
};

// The topic and style typed so far live for the tab, so leaving for Settings keeps them.
const keep = {
  read(key: string): string {
    try {
      return window.sessionStorage.getItem(`slopify.welcome.${key}`) ?? "";
    } catch {
      return "";
    }
  },
  write(key: string, value: string): void {
    try {
      window.sessionStorage.setItem(`slopify.welcome.${key}`, value);
    } catch {
      // Storage blocked: the step still works, it just isn't kept across a detour.
    }
  },
};

function useKept(key: string): readonly [string, (next: string) => void] {
  const [value, setValue] = useState(() => keep.read(key));
  return [
    value,
    (next: string) => {
      setValue(next);
      keep.write(key, next);
    },
  ];
}

// One step's content; only the current one is in the page. It takes focus when the step
// changes, so a keyboard or screen-reader user lands at its start, without scrolling the
// page's title and Skip out of sight.
function StepPanel({
  id,
  at,
  children,
}: {
  readonly id: WelcomeStep;
  readonly at: WelcomeStep;
  readonly children: ReactNode;
}): ReactElement | null {
  if (id !== at) return null;
  const index = welcomeSteps.indexOf(id);
  return (
    <section
      id={`welcome-step-${id}`}
      aria-labelledby={`welcome-step-${id}-title`}
      tabIndex={-1}
      className="outline-none"
    >
      <SectionHead
        id={`welcome-step-${id}-title`}
        title={stepNames[id]}
        row
        meta={`Step ${String(index + 1)} of ${String(welcomeSteps.length)}`}
      />
      {children}
    </section>
  );
}

// "History style: Claude Code writes it, OpenAI reads it aloud, Codex makes the images. About
// five minutes."
function plan(packName: string, needs: FirstRunView["needs"] | undefined): string {
  const name = (part: { readonly by: string | null }) => (part.by ?? "").replace(/ CLI$/, "");
  const clauses = [
    needs?.text.by == null ? undefined : `${name(needs.text)} writes it`,
    needs?.voice.by == null
      ? undefined
      : needs.voice.how === "computer"
        ? "your computer's voice reads it aloud"
        : `${name(needs.voice)} reads it aloud`,
    needs?.images.by == null ? undefined : `${name(needs.images)} makes the images`,
  ].filter((clause) => clause !== undefined);
  return `${packName} style${clauses.length === 0 ? "" : `: ${clauses.join(", ")}`}. About five minutes.`;
}

// The first run, as three steps that end with a real short being made: what a short needs and
// what this computer already has for it, a style, then a topic and Make. Shown on a fresh
// install until it is skipped or a real project exists.
export function WelcomeRoute({
  step: shownStep,
  onStep,
}: {
  // The step in the address; without `onStep` the screen keeps its own.
  readonly step?: WelcomeStep;
  readonly onStep?: (step: WelcomeStep) => void;
} = {}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const view = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const [ownStep, setOwnStep] = useState<WelcomeStep>(shownStep ?? "found");
  const step = onStep === undefined ? ownStep : (shownStep ?? "found");
  const [topic, setTopic] = useKept("topic");
  const [pack, setPack] = useKept("pack");
  const [made, setMade] = useState<string | undefined>(undefined);
  const [refused, setRefused] = useState<readonly ShortGap[]>([]);
  const [empty, setEmpty] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // One identity per press, kept across a retry of the same press.
  const request = useRef<string | undefined>(undefined);

  const skip = useMutation({
    mutationFn: () => dismissFirstRun(api),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: onboardingKey });
      await navigate({ to: "/" });
    },
  });
  const short = useMutation({
    mutationFn: () => {
      request.current ??= crypto.randomUUID();
      return makeShort(api, {
        topic,
        requestId: request.current,
        ...(pack === "" ? {} : { packId: pack }),
      });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        // The same press again, once something is fixed, is the same request. The checklist
        // reads the same gaps afresh.
        setRefused(result.gaps);
        await client.invalidateQueries({ queryKey: onboardingKey });
        return;
      }
      request.current = undefined;
      setRefused([]);
      setMade(result.projectId);
      await client.invalidateQueries({ queryKey: keys.projects });
      await client.invalidateQueries({ queryKey: keys.voices });
    },
  });
  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (topic.trim() === "") {
      setEmpty(true);
      field.current?.focus();
      return;
    }
    setEmpty(false);
    short.mutate();
  };

  const data = view.data;
  const packName =
    pack === "" ? "General" : (data?.packs.find((one) => one.id === pack)?.name ?? pack);
  const missing = data?.needs.gaps ?? [];
  const status = short.error
    ? { tone: "error" as const, text: short.error.message }
    : skip.error
      ? { tone: "error" as const, text: skip.error.message }
      : short.isPending
        ? { tone: "info" as const, text: "Starting your short…" }
        : empty
          ? { tone: "error" as const, text: "Type a topic first." }
          : refused.length === 0
            ? undefined
            : {
                tone: "error" as const,
                // The checklist above names each gap with its fix; a gap it can't see (a
                // service that lists no model) is said here in the server's words.
                text:
                  missing.length > 0
                    ? "The short didn't start. Fix what is marked Not connected above, then press Make a 60-second short again."
                    : refused.map((gap) => gap.message).join(" "),
              };
  const at = welcomeSteps.indexOf(step);
  const go = (to: WelcomeStep): void => {
    if (onStep === undefined) setOwnStep(to);
    else onStep(to);
    requestAnimationFrame(() =>
      document.getElementById(`welcome-step-${to}`)?.focus({ preventScroll: true }),
    );
  };
  const next = welcomeSteps[at + 1];
  const back = welcomeSteps[at - 1];

  return (
    <>
      <PageHeader
        title="Welcome to Slopify"
        meta="Make a video from a topic, with the tools already on this computer."
        actions={
          <Button variant="quiet" disabled={skip.isPending} onClick={() => skip.mutate()}>
            {made === undefined ? "Skip" : "Done"}
          </Button>
        }
      />
      {view.error ? (
        <Callout tone="danger" title="Could not read what this computer has" className="mb-4">
          {view.error.message}
        </Callout>
      ) : null}

      <StepPanel id="found" at={step}>
        <SetupChecklist back={{ return: "welcome", step: "found" }} />
      </StepPanel>

      <StepPanel id="style" at={step}>
        <List label="Styles" className="sl-list--wrap-meta">
          {[
            { id: "", name: "General", summary: "A neutral explainer style." },
            ...(data?.packs ?? []),
          ].map((one) => {
            const picked = pack === one.id;
            return (
              <ListRow
                key={one.id === "" ? "general" : one.id}
                title={one.name}
                meta={one.summary}
                selected={picked}
                onSelect={() => setPack(one.id)}
                actions={
                  picked ? (
                    <span className="flex items-center gap-1 text-small font-semibold text-accent-ink">
                      <CheckIcon aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      Picked
                    </span>
                  ) : undefined
                }
              />
            );
          })}
        </List>
      </StepPanel>

      <StepPanel id="make" at={step}>
        {made === undefined ? (
          <>
            {missing.length === 0 ? null : (
              <>
                <p className="m-0 mb-2 text-small font-semibold text-waiting">
                  The short needs every line Ready before it can start.
                </p>
                <SetupChecklist back={{ return: "welcome", step: "make" }} className="mb-4" />
              </>
            )}
            <form id="welcome-short" onSubmit={submit} className="mb-4">
              <Field label="Topic" help={plan(packName, data?.needs)}>
                <Input
                  ref={field}
                  value={topic}
                  maxLength={200}
                  placeholder="For example: why the sea glows at night"
                  onChange={(event) => {
                    setTopic(event.target.value);
                    if (event.target.value.trim() !== "") setEmpty(false);
                  }}
                />
              </Field>
            </form>
          </>
        ) : (
          <Callout tone="info" className="mb-4" title="Your short is being made.">
            It usually takes about five minutes. Watch each step as it runs, or look at a sample
            while you wait.
          </Callout>
        )}

        <AutostartOffer />

        <SectionHead title="Finished samples" size="small" as="h3" className="mt-4" />
        <List label="Samples" className="mb-4 sl-list--wrap-meta">
          {samples.map((one) => {
            const projectId = data?.samples[one.id] ?? null;
            return (
              <ListRow
                key={one.id}
                title={one.name}
                meta={one.summary}
                actions={
                  projectId === null ? (
                    <TextLink to="/settings" search={{ section: "storage" }}>
                      Restore samples in Settings
                    </TextLink>
                  ) : (
                    <ButtonLink
                      variant="quiet"
                      to="/projects/$projectId"
                      params={{ projectId }}
                      className={hitTarget}
                    >
                      {one.action}
                    </ButtonLink>
                  )
                }
              />
            );
          })}
        </List>
      </StepPanel>

      <ActionBar
        status={
          <StatusSlot wrap tone={status?.tone ?? "info"}>
            {status?.text}
          </StatusSlot>
        }
      >
        {step === "make" ? null : <TextLink to="/play">Make a long video instead</TextLink>}
        {back === undefined ? null : <Button onClick={() => go(back)}>Back</Button>}
        {next !== undefined ? (
          <Button variant="primary" onClick={() => go(next)}>
            {`Next: ${stepNames[next]}`}
          </Button>
        ) : made === undefined ? (
          <Button type="submit" form="welcome-short" variant="primary" disabled={short.isPending}>
            Make a 60-second short
          </Button>
        ) : (
          <ButtonLink variant="primary" to="/projects/$projectId" params={{ projectId: made }}>
            Watch it being made
          </ButtonLink>
        )}
      </ActionBar>
    </>
  );
}
