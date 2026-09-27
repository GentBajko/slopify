import type { WhatsNewView } from "@app/slices/settings/whats-new.js";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import type { Api } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { read } from "@/http";
import { type PatchNotesView, patchNotesKey, patchNotesQuery } from "@/patch-notes/api";
import { noticeQuery } from "@/queries";
import { useTutorial } from "@/tutorial/context";

// "What's new": a short tour on the first launch after a major update (never on a fresh
// install; the server decides, see slices/settings/whats-new.ts). It is a non-modal drawer, so
// "Open …" can take the person to the screen while the tour stays beside it. Closing it, from
// any step, is what records it as seen for this install.

export interface WhatsNewStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  // Where "Open …" goes: a route, not an element, so a redesigned screen does not break it.
  readonly to: string;
  readonly search?: Readonly<Record<string, string>>;
  readonly place: string;
}

// One tour per major version that has one. A major without an entry shows nothing.
export const whatsNewTours: Readonly<Record<number, readonly WhatsNewStep[]>> = {
  3: [
    {
      id: "home",
      title: "Home",
      body: "What is running and at which step, what is coming up, what needs you and what is ready to upload, on one screen.",
      to: "/",
      place: "Home",
    },
    {
      id: "play",
      title: "Play's one path",
      body: "Pick a template, type the topic, press Start. Everything else stays folded away until it needs you.",
      to: "/play",
      place: "Play",
    },
    {
      id: "reviews",
      title: "Automatic reviews",
      body: "A reviewer model checks the article, images, narration, thumbnail and shorts, and can send a failed item back to be made again. Turn it on in Play's Review step.",
      to: "/play",
      place: "Play",
    },
    {
      id: "channels",
      title: "Channels and cast",
      body: "A channel keeps its brand kit, series brief, templates and schedules, and a cast of characters and places that look the same in every video.",
      to: "/channels",
      place: "Channels",
    },
    {
      id: "memory",
      title: "Episodes that remember",
      body: "Each finished episode leaves a short summary on its channel's Episodes tab, and a new article reads the related ones. Add your existing video titles on Existing videos, and topic suggestions skip them too.",
      to: "/channels",
      place: "Channels",
    },
    {
      id: "calendar",
      title: "The calendar",
      body: "The coming weeks of uploads on one screen: what is ready, what needs you, and the topics still to come.",
      to: "/calendar",
      place: "Calendar",
    },
    {
      id: "run-cost",
      title: "What a run cost",
      body: "Every project has a Run cost tab with the real cost per stage and model. Totals for all projects are in Settings, Usage.",
      to: "/settings",
      search: { section: "usage" },
      place: "Usage",
    },
    {
      id: "studio",
      title: "YouTube Studio prep",
      body: "Slopify never uploads. Prepare upload on a finished project lists everything Studio asks for, and the browser extension can fill it in for you.",
      to: "/settings",
      search: { section: "studio" },
      place: "YouTube Studio settings",
    },
    {
      id: "voices",
      title: "Multiple voices",
      body: "Audiobooks, podcasts, radio drama and interviews, with a voice per speaker. Pick the format under Audio, Speakers on Play.",
      to: "/play",
      place: "Play",
    },
    {
      id: "long-videos",
      title: "Long videos stay watchable",
      body: "More images for long videos sets images per hour or one every few minutes, with pan and zoom variety. An ambient bed of rain, fire, wind or your own file can play under the narration. Both are on Play; a channel's brand kit can set the ambient sound for all its videos.",
      to: "/play",
      place: "Play",
    },
    {
      id: "languages",
      title: "Other languages",
      body: "A project can be made in another language: pick it on Play, and the article, narration and description are written in it.",
      to: "/play",
      place: "Play",
    },
    {
      id: "trash",
      title: "A trash bin",
      body: "Deleted projects, prompts, templates and schedules stay in Settings, Trash for 30 days, and Restore brings them back.",
      to: "/settings",
      search: { section: "trash" },
      place: "Trash",
    },
  ],
};

export const whatsNewKey = ["whats-new"] as const;

async function readWhatsNew(api: Api): Promise<WhatsNewView> {
  return read<WhatsNewView>(await api.client["whats-new"].$get());
}

// Shared with the patch notes popup, which waits for the tour.
export function whatsNewQuery(api: Api) {
  return queryOptions({
    queryKey: whatsNewKey,
    queryFn: () => readWhatsNew(api),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

async function markWhatsNewSeen(api: Api): Promise<WhatsNewView> {
  return read<WhatsNewView>(await api.client["whats-new"].seen.$post());
}

export function WhatsNewTour(): ReactElement | null {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const tutorial = useTutorial();
  const notice = useQuery(noticeQuery(api));
  // Asked only once the first-run notice is out of the way, so the two never stack.
  const status = useQuery({ ...whatsNewQuery(api), enabled: notice.data?.seen === true });
  const [at, setAt] = useState(0);
  const dismiss = useMutation({
    mutationFn: () => markWhatsNewSeen(api),
    onSuccess: (body) => {
      queryClient.setQueryData(whatsNewKey, body);
      // The server recorded this version's patch notes as seen too; a list read earlier
      // (Settings → Patch notes) must not open them now.
      queryClient.setQueryData<PatchNotesView>(patchNotesKey, (old) =>
        old === undefined ? old : { ...old, due: null },
      );
    },
  });

  const major = status.data?.major;
  const steps = major === undefined || major === null ? undefined : whatsNewTours[major];
  const lastStep = steps !== undefined && at >= steps.length - 1;
  // The last step links to this version's full patch notes.
  const notes = useQuery({
    ...patchNotesQuery(api),
    enabled: status.data?.show === true && lastStep,
  });
  const currentNote = notes.data?.current ?? undefined;
  // The interactive tutorial has the screen while it runs; the tour waits for it.
  if (status.data?.show !== true || steps === undefined || tutorial?.active === true) return null;
  const step = steps[Math.min(at, steps.length - 1)];
  if (step === undefined) return null;
  const index = steps.indexOf(step);
  const last = index === steps.length - 1;
  const close = () => {
    dismiss.mutate();
  };

  return (
    <Drawer
      open
      width="narrow"
      title={`What's new in ${String(major)}.0`}
      onClose={close}
      footer={
        <>
          <Button variant="quiet" disabled={dismiss.isPending} onClick={close}>
            Close tour
          </Button>
          <span className="flex-1" />
          <Button
            disabled={index === 0}
            disabledReason="This is the first step"
            onClick={() => {
              setAt(index - 1);
            }}
          >
            Back
          </Button>
          <Button
            variant="primary"
            disabled={dismiss.isPending}
            onClick={() => {
              if (last) close();
              else setAt(index + 1);
            }}
          >
            {last ? "Finish tour" : "Next"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-label text-ink-3">{`${String(index + 1)} of ${String(steps.length)}`}</p>
        <h3 className="m-0 text-title-3">{step.title}</h3>
        <p className="m-0 text-ink-2">{step.body}</p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={step.to} {...(step.search === undefined ? {} : { search: step.search })}>
            {`Open ${step.place}`}
          </ButtonLink>
          {last ? (
            <TextLink
              to="/settings"
              search={{
                section: "patch-notes",
                ...(currentNote === undefined ? {} : { note: currentNote }),
              }}
              onClick={close}
            >
              Read the full patch notes
            </TextLink>
          ) : null}
        </div>
        {dismiss.error === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {`Slopify could not save that you closed this tour: ${dismiss.error.message} Press Close tour to try again.`}
          </p>
        )}
      </div>
    </Drawer>
  );
}
