import type { SampleId } from "@app/slices/onboarding/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { AutostartOffer } from "@/autostart/autostart-settings";
import { ActionBar, StatusSlot } from "@/components/kit/action-bar";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageBar } from "@/components/kit/page-bar";
import { SectionHead } from "@/components/kit/section-head";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import {
  dismissFirstRun,
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

// The first-run screen: what this machine can already do, the one-minute short, the samples
// and the starter packs. Shown on a fresh install until it is skipped or a real project exists.
export function WelcomeRoute(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const view = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const [topic, setTopic] = useState("");
  const [pack, setPack] = useState("");
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
      await client.invalidateQueries({ queryKey: keys.projects });
      await client.invalidateQueries({ queryKey: onboardingKey });
      await navigate({ to: "/projects/$projectId", params: { projectId } });
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (topic.trim() !== "") short.mutate();
  };

  const data = view.data;
  const ready = data?.clis.filter((cli) => cli.ready) ?? [];
  const status = short.error
    ? { tone: "error" as const, text: short.error.message }
    : install.error
      ? { tone: "error" as const, text: install.error.message }
      : skip.error
        ? { tone: "error" as const, text: skip.error.message }
        : short.isPending
          ? { tone: "info" as const, text: "Starting your short…" }
          : undefined;

  return (
    <div>
      <PageBar
        title="Welcome to Slopify"
        meta="Make a video from a topic, with the tools already on this computer."
        actions={
          <Button variant="ghost" disabled={skip.isPending} onClick={() => skip.mutate()}>
            Skip
          </Button>
        }
      />
      {view.error ? <p className="mb-3 text-body text-danger">{view.error.message}</p> : null}

      <SectionHead title="Found on this computer" info="welcome.found" />
      <RailGroup className="mb-6">
        {(data?.clis ?? []).map((cli) => (
          <Rail key={cli.id}>
            <span className="min-w-0 flex-1 font-semibold">{cli.name}</span>
            <span className="text-small text-ink-2">
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
        <p className="-mt-4 mb-6 text-small text-ink-2">
          You can make a video now: no API keys are needed for the text
          {ready.some((cli) => cli.draws) ? " or the images" : ""}.
        </p>
      ) : null}

      <SectionHead title="Make a 60-second short" info="welcome.short" />
      <form onSubmit={submit} className="mb-6 flex flex-wrap items-end gap-3">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1" {...helpScope}>
          <span className="flex items-center gap-1">
            <label htmlFor="welcome-topic" className="text-label text-ink-2">
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
        <div className="flex flex-col gap-1" {...helpScope}>
          <span className="flex items-center gap-1">
            <label htmlFor="welcome-pack" className="text-label text-ink-2">
              Style
            </label>
            <InfoTip id="welcome.pack" className="-my-1" />
          </span>
          <Picker
            id="welcome-pack"
            aria-label="Starter pack"
            value={pack}
            onChange={(event) => setPack(event.target.value)}
          >
            <option value="">General</option>
            {(data?.packs ?? []).map((one) => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </Picker>
        </div>
        <Button type="submit" variant="primary" disabled={topic.trim() === "" || short.isPending}>
          Make a 60-second short
        </Button>
      </form>

      <SectionHead title="Explore the samples" info="welcome.samples" />
      <RailGroup className="mb-6">
        {samples.map((one) => {
          const projectId = data?.samples[one.id] ?? null;
          return (
            <Rail key={one.id}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{one.name}</span>
                <span className="text-small text-ink-2">{one.summary}</span>
              </span>
              {projectId === null ? (
                <Button asChild variant="ghost">
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

      <SectionHead title="Starter packs" info="welcome.packs" />
      <RailGroup>
        {(data?.packs ?? []).map((one) => (
          <Rail key={one.id}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">{one.name}</span>
              <span className="text-small text-ink-2">{one.summary}</span>
            </span>
            <Button
              disabled={one.installed || install.isPending}
              onClick={() => install.mutate(one.id)}
            >
              {one.installed ? "Added" : "Add pack"}
            </Button>
          </Rail>
        ))}
      </RailGroup>

      <ActionBar status={<StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>}>
        <Button asChild variant="ghost">
          <Link to="/play">Set up a long video instead</Link>
        </Button>
      </ActionBar>
    </div>
  );
}
