import type { SampleId } from "@app/slices/onboarding/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { AutostartOffer } from "@/autostart/autostart-settings";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageBar } from "@/components/kit/page-bar";
import { SectionHead } from "@/components/kit/section-head";
import { Lamp } from "@/components/kit/status";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { Rail, RailGroup } from "@/components/rail";
import { Input } from "@/components/ui/input";
import {
  dismissFirstRun,
  type FirstRunView,
  installPack,
  makeShort,
  onboardingKey,
  readFirstRun,
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

type Step = "found" | "style" | "make";
const steps: readonly { readonly id: Step; readonly label: string }[] = [
  { id: "found", label: "1 · What you have" },
  { id: "style", label: "2 · Pick a style" },
  { id: "make", label: "3 · Make your first short" },
];

// "the text, the images or the narration"
function keyless(parts: readonly string[]): string {
  return parts.length <= 2
    ? parts.join(" or ")
    : `${parts.slice(0, -1).join(", ")} or ${parts.at(-1) ?? ""}`;
}

// Who narrates, in one sentence, with the fix when nobody can.
function voiceLine(voice: FirstRunView["voice"] | undefined): {
  readonly ready: boolean;
  readonly text: string;
} {
  if (voice === undefined) return { ready: false, text: "Looking for a voice…" };
  if (voice.keyed !== null)
    return { ready: true, text: `Narration uses your ${voice.keyed} voice key.` };
  if (voice.system.available)
    return {
      ready: true,
      text: `Narration uses your computer's built-in voice${voice.system.engine === null ? "" : ` (${voice.system.engine})`}; add an ElevenLabs or OpenAI key later for a better one.`,
    };
  return {
    ready: false,
    text:
      voice.system.issue ??
      "No voice can narrate yet. Add an ElevenLabs or OpenAI key in Settings → Providers.",
  };
}

// The first run, as three steps that end with a real short being made: what this computer
// already has (the CLIs and a voice), a style, then a topic and Make. The samples and the
// start-at-login offer are there as extras once the short is on its way. Shown on a fresh
// install until it is skipped or a real project exists.
export function WelcomeRoute(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const view = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const [step, setStep] = useState<Step>("found");
  const [topic, setTopic] = useState("");
  const [pack, setPack] = useState("");
  const [made, setMade] = useState<string | undefined>(undefined);
  // One identity per press, kept across a retry of the same press.
  const request = useRef<string | undefined>(undefined);

  const skip = useMutation({
    mutationFn: () => dismissFirstRun(api),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: onboardingKey });
      await navigate({ to: "/" });
    },
  });
  const install = useMutation({
    mutationFn: (id: string) => installPack(api, id),
    onSettled: () => client.invalidateQueries({ queryKey: onboardingKey }),
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
    onSuccess: async ({ projectId }) => {
      request.current = undefined;
      setMade(projectId);
      await client.invalidateQueries({ queryKey: keys.projects });
      await client.invalidateQueries({ queryKey: keys.voices });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (topic.trim() !== "") short.mutate();
  };

  const data = view.data;
  const ready = data?.clis.filter((cli) => cli.ready) ?? [];
  const voice = voiceLine(data?.voice);
  const packName =
    pack === "" ? "General" : (data?.packs.find((one) => one.id === pack)?.name ?? pack);
  const status = short.error
    ? { tone: "error" as const, text: short.error.message }
    : install.error
      ? { tone: "error" as const, text: install.error.message }
      : skip.error
        ? { tone: "error" as const, text: skip.error.message }
        : short.isPending
          ? { tone: "info" as const, text: "Starting your short…" }
          : undefined;
  const at = steps.findIndex((one) => one.id === step);
  const next = steps[at + 1];
  const back = steps[at - 1];

  return (
    <div>
      <PageBar
        title="Welcome to Slopify"
        meta="Make a video from a topic, with the tools already on this computer."
        actions={
          <Button variant="quiet" disabled={skip.isPending} onClick={() => skip.mutate()}>
            {made === undefined ? "Skip" : "Done"}
          </Button>
        }
      />
      {view.error ? <p className="mb-3 text-body text-danger">{view.error.message}</p> : null}

      <Tabs
        items={steps.map((one) => ({ id: one.id, label: one.label }))}
        value={step}
        onChange={setStep}
        label="First-run steps"
        idPrefix="welcome"
        className="mb-6"
      />

      <TabPanel idPrefix="welcome" id="found" active={step === "found"}>
        <SectionHead title="Found on this computer" info="welcome.found" />
        <RailGroup className="mb-4">
          {(data?.clis ?? []).map((cli) => (
            <Rail key={cli.id}>
              <span className="min-w-0 flex-1 font-semibold">{cli.name}</span>
              <span className="text-small text-ink2">
                {cli.ready
                  ? `Ready${cli.version === null ? "" : ` · ${cli.version}`}${cli.draws ? " · writes and draws" : " · writes"}`
                  : cli.installed
                    ? (cli.issue ?? "Installed, not usable yet")
                    : "Not found"}
              </span>
            </Rail>
          ))}
          {data === undefined ? <Rail>Looking for installed tools…</Rail> : null}
        </RailGroup>
        {data !== undefined && ready.length > 0 ? (
          <p className="mb-6 text-small text-ink2">
            {`You can make a video now: no API keys are needed for ${keyless([
              "the text",
              ...(ready.some((cli) => cli.draws) ? ["the images"] : []),
              ...(voice.ready && data.voice.keyed === null ? ["the narration"] : []),
            ])}.`}
          </p>
        ) : null}
        {data !== undefined && ready.length === 0 ? (
          <Callout
            tone="waiting"
            className="mb-6"
            title="Nothing on this computer can write the script yet."
            actions={
              <Button asChild>
                <Link to="/settings" search={{ section: "providers" }}>
                  Open Settings → Providers
                </Link>
              </Button>
            }
          >
            Install Claude Code, Codex or Gemini CLI and sign in to it, then press Check again; or
            add an OpenRouter key in Settings → Providers.
          </Callout>
        ) : null}

        <SectionHead title="Narration voice" info="welcome.voice" />
        {data === undefined ? (
          <RailGroup className="mb-6">
            <Rail>Looking for a voice…</Rail>
          </RailGroup>
        ) : (
          <VoiceChoice
            voice={voice}
            checking={view.isFetching}
            onCheck={() => void view.refetch()}
          />
        )}
      </TabPanel>

      <TabPanel idPrefix="welcome" id="style" active={step === "style"}>
        <SectionHead title="Pick a style" info="welcome.pack" />
        <RailGroup className="mb-3">
          {[
            {
              id: "",
              name: "General",
              summary: "A neutral explainer style.",
              installed: false,
              library: false,
            },
            ...(data?.packs ?? []).map((one) => ({ ...one, library: true })),
          ].map((one) => (
            <Rail key={one.id === "" ? "general" : one.id} className="flex-wrap">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{one.name}</span>
                <span className="text-small text-ink2">{one.summary}</span>
              </span>
              {one.library ? (
                <Button
                  variant="quiet"
                  disabled={one.installed || install.isPending}
                  aria-label={
                    one.installed ? `${one.name} is in your library` : `Add ${one.name} to library`
                  }
                  onClick={() => install.mutate(one.id)}
                >
                  {one.installed ? "In your library" : "Add to library"}
                </Button>
              ) : null}
              <Button
                variant={pack === one.id ? "primary" : "secondary"}
                aria-pressed={pack === one.id}
                aria-label={`Use ${one.name}`}
                onClick={() => setPack(one.id)}
              >
                {pack === one.id ? "Picked" : "Use this style"}
              </Button>
            </Rail>
          ))}
        </RailGroup>
        <p className="mb-6 flex items-center gap-1 text-small text-ink2" {...helpScope}>
          Add to library keeps a pack's prompts and Play template for later videos.
          <InfoTip id="welcome.packs" className="-my-1" />
        </p>
      </TabPanel>

      <TabPanel idPrefix="welcome" id="make" active={step === "make"}>
        {made === undefined ? (
          <>
            <SectionHead title="Make a 60-second short" info="welcome.short" />
            <p className="mb-3 text-small text-ink2">
              {`Style: ${packName}. `}
              {voice.text}
            </p>
            {voice.ready || data === undefined ? null : (
              <div className="mb-4">
                <VoiceChoice
                  voice={voice}
                  checking={view.isFetching}
                  onCheck={() => void view.refetch()}
                />
              </div>
            )}
            <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3">
              <div className="flex min-w-[240px] flex-1 flex-col gap-1" {...helpScope}>
                <span className="flex items-center gap-1">
                  <label htmlFor="welcome-topic" className="text-label text-ink2">
                    Topic
                  </label>
                  <InfoTip id="welcome.topic" className="-my-1" />
                </span>
                <Input
                  id="welcome-topic"
                  value={topic}
                  maxLength={200}
                  placeholder="Why the sea glows at night"
                  onChange={(event) => setTopic(event.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={topic.trim() === "" || short.isPending}
                disabledReason="Type a topic first."
              >
                Make a 60-second short
              </Button>
            </form>
          </>
        ) : (
          <Callout
            tone="info"
            className="mb-6"
            title="Your short is being made."
            actions={
              <Button asChild variant="primary">
                <Link to="/projects/$projectId" params={{ projectId: made }}>
                  Watch it being made
                </Link>
              </Button>
            }
          >
            It usually takes about five minutes. The live view shows each step as it runs; while you
            wait, look at a sample or set Slopify to start when you log in.
          </Callout>
        )}

        <SectionHead title="While you wait: the samples" info="welcome.samples" />
        <RailGroup className="mb-6">
          {samples.map((one) => {
            const projectId = data?.samples[one.id] ?? null;
            return (
              <Rail key={one.id}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{one.name}</span>
                  <span className="text-small text-ink2">{one.summary}</span>
                </span>
                {projectId === null ? (
                  <Button asChild variant="quiet">
                    <Link to="/settings" search={{ section: "storage" }}>
                      Restore samples in Settings
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/projects/$projectId" params={{ projectId }}>
                      {one.action}
                    </Link>
                  </Button>
                )}
              </Rail>
            );
          })}
        </RailGroup>

        <AutostartOffer />
      </TabPanel>

      <ActionBar status={<StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>}>
        <Button asChild variant="quiet">
          <Link to="/play">Set up a long video instead</Link>
        </Button>
        {back === undefined ? null : <Button onClick={() => setStep(back.id)}>Back</Button>}
        {next === undefined ? null : (
          <Button variant="primary" onClick={() => setStep(next.id)}>
            {`Next: ${next.label.replace(/^\d · /, "")}`}
          </Button>
        )}
      </ActionBar>
    </div>
  );
}

// The voice that will narrate, or, when none can, the two ways to get one: a key, or a speech
// program installed and checked again.
function VoiceChoice({
  voice,
  checking,
  onCheck,
}: {
  readonly voice: { readonly ready: boolean; readonly text: string };
  readonly checking: boolean;
  readonly onCheck: () => void;
}): ReactElement {
  if (voice.ready)
    return (
      <RailGroup className="mb-6">
        <Rail className="flex-wrap">
          <Lamp tone="done" />
          <span className="min-w-0 flex-1 text-small">{voice.text}</span>
          <Button asChild variant="quiet">
            <Link to="/settings" search={{ section: "providers" }}>
              Add a voice key
            </Link>
          </Button>
        </Rail>
      </RailGroup>
    );
  return (
    <Callout
      tone="waiting"
      className="mb-6"
      title="No voice can narrate the short yet."
      actions={
        <>
          <Button asChild variant="primary">
            <Link to="/settings" search={{ section: "providers" }}>
              Add a voice key
            </Link>
          </Button>
          <Button disabled={checking} onClick={onCheck}>
            {checking ? "Checking…" : "Check again"}
          </Button>
        </>
      }
    >
      {voice.text}
    </Callout>
  );
}
