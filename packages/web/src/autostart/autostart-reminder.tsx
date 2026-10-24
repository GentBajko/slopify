import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { onboardingKey, readFirstRun } from "@/onboarding/api";
import { noticeQuery } from "@/queries";
import { useAutostart } from "./autostart-settings.js";

// "Start Slopify when I log in", asked once of someone who updated rather than installed: they
// never see the first-run screen, and an update started without a terminal couldn't ask them
// either. A fresh install never meets it: leaving the first-run screen (Skip, Done, the first
// short or a project made elsewhere) answers it as No on the server, and while a project made
// elsewhere is still being settled (`settle`) it waits. Shown only while the question is open
// (`offer`), after the usage-stats notice. No thanks is where focus starts, since the other
// answer changes the computer; either answer, or closing it, ends it for good.
export function AutostartReminder(): ReactElement | null {
  const { api } = useApp();
  const pathname = useLocation({ select: (location) => location.pathname });
  const { view, turn, decline } = useAutostart();
  const notice = useQuery(noticeQuery(api));
  const firstRun = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const open =
    view.data?.offer === true &&
    notice.data?.seen === true &&
    firstRun.data?.show === false &&
    firstRun.data.settle === false &&
    pathname !== "/welcome";
  const busy = turn.isPending || decline.isPending;
  const error = turn.error ?? decline.error;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) decline.mutate();
      }}
      title="Start Slopify when you log in?"
      description="Slopify starts in the background when you log in, so your bookmark always opens it. Change it any time in Settings → General."
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => turn.mutate(true)}>
            Start when I log in
          </Button>
          <Button variant="secondary" autoFocus disabled={busy} onClick={() => decline.mutate()}>
            No thanks
          </Button>
        </>
      }
    >
      {error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {error.message}
        </p>
      )}
    </Dialog>
  );
}
