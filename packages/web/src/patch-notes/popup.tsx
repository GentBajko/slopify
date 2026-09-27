import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { Drawer } from "@/components/kit/drawer";
import { noticeQuery } from "@/queries";
import { useTutorial } from "@/tutorial/context";
import { whatsNewQuery, whatsNewTours } from "@/whats-new/tour";
import { markPatchNotesSeen, type PatchNotesView, patchNotesKey, patchNotesQuery } from "./api.js";
import { PatchNoteReader } from "./reader.js";

// The running version's patch notes, opened by themselves once on the first start after an
// update (never on a fresh install; the server decides, see slices/patch-notes/seen.ts).
// One popup at a time: it waits for the first-run notice, the interactive tutorial and the
// What's new tour. On a major update the tour stands in for the notes (its last step links
// to them) and closing it records them as seen, so they do not follow it.
export function PatchNotesPopup(): ReactElement | null {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const tutorial = useTutorial();
  const notice = useQuery(noticeQuery(api));
  const noticeDone = notice.data?.seen === true;
  const tour = useQuery({ ...whatsNewQuery(api), enabled: noticeDone });
  const major = tour.data?.major;
  const tourShowing =
    tour.data?.show === true &&
    major !== undefined &&
    major !== null &&
    whatsNewTours[major] !== undefined;
  const status = useQuery({
    ...patchNotesQuery(api),
    enabled: noticeDone && tour.data !== undefined && !tourShowing,
  });
  const dismiss = useMutation({
    mutationFn: () => markPatchNotesSeen(api),
    onSuccess: () => {
      queryClient.setQueryData<PatchNotesView>(patchNotesKey, (old) =>
        old === undefined ? old : { ...old, due: null },
      );
    },
  });

  const due = status.data?.due ?? null;
  if (!noticeDone || tourShowing || tutorial?.active === true || due === null) return null;
  const note = status.data?.notes.find((item) => item.id === due);
  const close = () => {
    dismiss.mutate();
  };

  return (
    <Drawer
      open
      title={`What's new in ${status.data?.version ?? ""}`}
      onClose={close}
      footer={
        <>
          <Button asChild variant="quiet">
            <Link to="/settings" search={{ section: "patch-notes" }} onClick={close}>
              See all patch notes
            </Link>
          </Button>
          <span className="flex-1" />
          <Button variant="primary" disabled={dismiss.isPending} onClick={close}>
            Close notes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {note === undefined ? null : <p className="m-0 text-small text-ink-3">{note.title}</p>}
        <PatchNoteReader id={due} className="!grid-cols-1 [&>.sl-toc]:static" />
        {dismiss.error === null ? null : (
          <p role="alert" className="m-0 text-small text-danger">
            {`Slopify could not save that you closed these patch notes: ${dismiss.error.message} Press Close notes to try again.`}
          </p>
        )}
      </div>
    </Drawer>
  );
}

// Ctrl+K → Show patch notes: every release's notes, in Settings → Patch notes.
export function PatchNotesCommand(): null {
  const navigate = useNavigate();
  useCommand({
    id: "nav.patch-notes",
    title: "Show patch notes",
    group: "Go to",
    run: () => {
      void navigate({ to: "/settings", search: { section: "patch-notes" } });
    },
    keywords: ["what's new", "changelog", "release notes", "version"],
  });
  return null;
}
