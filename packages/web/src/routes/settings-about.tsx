import { DownloadIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { FileLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { helpEntry } from "@/help/catalog";
import { useUpdate } from "@/updates/use-update";

// A lore channel run on Slopify, start to finish: the one link About keeps. The support links
// (GitHub, Patreon, Buy Me a Coffee) live in the rail's Support menu.
export const channelStoryUrl = "https://slopify.stream/channel.html";

// The browser's own download of the diagnostics file, the same one About's button saves.
export function downloadDiagnostics(origin: string): void {
  const link = document.createElement("a");
  link.href = `${origin}/api/diagnostics`;
  link.download = "slopify-diagnostics.json";
  document.body.append(link);
  link.click();
  link.remove();
}

// What a person opens About for: which version this is and whether there is a newer one (the
// button checks, and installs one that is ready), what changed, and, when something is wrong,
// the file to attach to a bug report.
export function AboutSettings({
  onWhatsNew,
}: {
  // Opens this version's notes on What's new; the button is left out without it.
  readonly onWhatsNew?: () => void;
}): ReactElement {
  const { api, version } = useApp();
  const update = useUpdate(() => window.location.reload());
  const info = update.info;
  const current = info?.currentVersion ?? version.loadedAt();
  const waiting = info?.status === "waiting";
  const busy = update.updating || update.installing;
  const blocked = waiting ? undefined : info?.blockedReason;
  const state = busy
    ? { tone: "running" as const, word: "Updating…" }
    : update.checking
      ? { tone: "running" as const, word: "Checking for updates…" }
      : info === undefined
        ? undefined
        : info.available
          ? { tone: "info" as const, word: `Version ${info.latestVersion ?? ""} is ready` }
          : { tone: "done" as const, word: "Up to date" };
  return (
    <div className="flex max-w-prose flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="m-0 text-title-3 font-semibold text-ink">
            {current === undefined ? "Slopify" : `Slopify ${current}`}
          </p>
          {state === undefined ? null : <Status tone={state.tone}>{state.word}</Status>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {info?.available === true && info.canUpdate && !waiting ? (
            <Button
              variant="primary"
              disabled={busy || blocked !== undefined}
              disabledReason={blocked}
              onClick={() => update.install()}
            >
              {`Update to ${info.latestVersion ?? "the new version"}`}
            </Button>
          ) : waiting ? (
            <Button onClick={() => update.cancel()}>Cancel the update</Button>
          ) : (
            <Button disabled={busy || update.checking} onClick={() => update.refresh()}>
              Check for updates
            </Button>
          )}
          {onWhatsNew === undefined ? null : <Button onClick={onWhatsNew}>Read what's new</Button>}
        </div>
        {update.error === undefined && blocked === undefined ? null : (
          <p role="alert" className="m-0 text-small text-waiting">
            {update.error ?? blocked}
          </p>
        )}
        {waiting ? (
          <p className="m-0 text-small text-ink-2">
            The update installs once the video being made finishes; Slopify then restarts and this
            page reconnects.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="m-0 font-semibold text-ink">Free. Your keys, your machine.</p>
        <p className="m-0 text-small text-ink-2">
          Made by Gent Bajko. Apache License 2.0: anyone who redistributes Slopify or builds on it
          keeps this credit.
        </p>
        <p className="m-0 text-small">
          <a href={channelStoryUrl} target="_blank" rel="noreferrer" className="sl-link">
            How I run a channel with it ↗
          </a>
        </p>
      </div>

      <div>
        <SectionHead title="Something wrong?" size="small" className="pb-2">
          <FileLink
            variant="secondary"
            href={`${api.origin}/api/diagnostics`}
            download="slopify-diagnostics.json"
          >
            <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
            Download diagnostics
          </FileLink>
        </SectionHead>
        <p className="m-0 text-small text-ink-2">{helpEntry("settings.diagnostics").body}</p>
      </div>
    </div>
  );
}
