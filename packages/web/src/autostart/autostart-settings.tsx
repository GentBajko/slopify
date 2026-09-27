import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { helpScope } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import {
  type AutostartView,
  answerAutostart,
  autostartKey,
  readAutostart,
  setAutostart,
} from "./api.js";

const title = "Start Slopify when I log in";

function checkedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

// The switch and what it says, shared by Settings → General and the first-run offer.
function useAutostart() {
  const { api } = useApp();
  const client = useQueryClient();
  const view = useQuery({ queryKey: autostartKey, queryFn: () => readAutostart(api) });
  const turn = useMutation({
    mutationFn: (enabled: boolean) => setAutostart(api, enabled),
    onSuccess: (next) => client.setQueryData(autostartKey, next),
  });
  const decline = useMutation({
    mutationFn: () => answerAutostart(api),
    onSuccess: (next) => client.setQueryData(autostartKey, next),
  });
  return { view, turn, decline };
}

// Settings → General: one switch for native installs; in Docker, whether Docker starts at
// login and where to change that, since Slopify never changes Docker's own settings.
export function AutostartSettings(): ReactElement {
  const { view, turn } = useAutostart();
  const data = view.data;
  return (
    // The heading's info button explains the switch below it.
    <div {...helpScope}>
      <SectionHead title={title} info="settings.autostart" />
      {view.error === null ? null : (
        <p role="alert" className="m-0 mb-3 text-body text-danger">
          Starting at login couldn't be checked: {view.error.message}
        </p>
      )}
      {data === undefined ? (
        view.error === null ? (
          <p role="status" className="m-0 text-ink-2">
            Checking…
          </p>
        ) : null
      ) : data.kind === "docker" ? (
        <DockerStatus view={data} />
      ) : (
        <div className="flex flex-col gap-2">
          <Switch
            label={title}
            checked={data.enabled === true}
            disabled={!data.available || turn.isPending}
            describedBy="autostart-summary"
            onChange={(next) => turn.mutate(next)}
          />
          <p id="autostart-summary" className="m-0 text-small text-ink-2">
            {data.summary}
            {data.enabled === true && data.where !== null ? ` Login entry: ${data.where}` : ""}
          </p>
          {turn.error === null ? null : (
            <p role="alert" className="m-0 text-small text-danger">
              {turn.error.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DockerStatus({ view }: { readonly view: AutostartView }): ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-body">
        <span className="font-semibold">
          {view.enabled === true
            ? "Starts with Docker: yes"
            : view.enabled === false
              ? "Starts with Docker: no"
              : "Starts with Docker: unknown"}
        </span>
      </p>
      <p className="m-0 text-small text-ink-2">{view.summary}</p>
      {view.howTo === null ? null : <p className="m-0 text-small text-ink-2">{view.howTo}</p>}
      {view.checkedAt === null ? null : (
        <p className="m-0 text-small text-ink-2">
          Checked by the installer on {checkedAt(view.checkedAt)}.
        </p>
      )}
    </div>
  );
}

// The first-run screen asks once. Either answer, here, in Settings or in the terminal, ends it.
export function AutostartOffer(): ReactElement | null {
  const { view, turn, decline } = useAutostart();
  if (turn.isSuccess && view.data?.enabled === true)
    return (
      <p role="status" className="m-0 text-small text-ink-2">
        Slopify now starts when you log in. Change it any time in Settings → General.
      </p>
    );
  if (view.data?.offer !== true) return null;
  const error = turn.error ?? decline.error;
  // A section of its own, separated by space: never a box inside the page's surface.
  return (
    <section>
      <SectionHead title={title} info="settings.autostart" />
      <p className="m-0 mb-3 text-small text-ink-2">
        Have Slopify ready whenever you open your bookmark, without starting it from a terminal.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={turn.isPending || decline.isPending}
          onClick={() => turn.mutate(true)}
        >
          Start when I log in
        </Button>
        <Button
          variant="quiet"
          disabled={turn.isPending || decline.isPending}
          onClick={() => decline.mutate()}
        >
          No thanks
        </Button>
      </div>
      {error === null ? null : (
        <p role="alert" className="m-0 mt-3 text-small text-danger">
          {error.message}
        </p>
      )}
    </section>
  );
}
