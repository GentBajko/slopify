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
// either. Shown only while the question is open (`offer`), after the usage-stats notice and
// never over the first-run screen, which asks it itself. Either answer, or closing it, ends it
// for good, like the first-run notice.
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
      description="Have Slopify ready whenever you open your bookmark, without starting it from a terminal. Change it any time in Settings → General."
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={() => decline.mutate()}>
            No thanks
          </Button>
          <Button variant="primary" autoFocus disabled={busy} onClick={() => turn.mutate(true)}>
            Start when I log in
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
