import { RefreshCw } from "lucide-react";
import { type ReactElement, useEffect, useRef } from "react";
import { useToast } from "@/components/kit/toast";
import { cn } from "@/lib/utils";
import type { UpdateInfo } from "./api.js";
import { useUpdate } from "./use-update.js";

export function UpdateWidget({ reload }: { readonly reload: () => void }): ReactElement {
  const update = useUpdate(reload);
  const { info, updating, installing, reconnecting, checking, error } = update;
  const active = updating || installing;
  const waiting = info?.status === "waiting";
  const blocked = waiting ? undefined : info?.blockedReason;
  // Said once when the update starts waiting; the button's label keeps saying it after.
  const notify = useToast();
  const told = useRef(false);
  const sentence = waiting ? waitingSentence(info) : undefined;
  useEffect(() => {
    if (sentence === undefined) told.current = false;
    else if (!told.current) {
      told.current = true;
      notify(sentence, "info");
    }
  }, [sentence, notify]);
  const versions = info
    ? info.available
      ? `Your version: ${info.currentVersion} · Newest: ${info.latestVersion}`
      : `Slopify ${info.currentVersion}`
    : "Slopify";
  const action =
    sentence !== undefined
      ? `${sentence} Click to cancel the update.`
      : reconnecting
        ? "Reconnecting after update…"
        : active
          ? "Updating…"
          : checking
            ? "Checking for updates…"
            : (error ??
              blocked ??
              (info?.available
                ? "Click to download and install the update."
                : "Click to check for updates."));
  const label = `Slopify updates: ${versions}. ${action}`;
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={active || checking}
        onClick={() => {
          if (waiting) update.cancel();
          else if (info?.available && info.canUpdate && !blocked) update.install();
          else update.refresh();
        }}
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-control bg-transparent text-ink-2 hover:bg-raised hover:text-ink",
          error && "text-waiting",
        )}
      >
        <RefreshCw
          aria-hidden="true"
          size={16}
          className={cn((active || checking) && "animate-spin motion-reduce:animate-none")}
        />
        {info?.available && !active && !waiting ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-2 rounded-full bg-accent"
          />
        ) : null}
      </button>
      <span className="sr-only" role={error ? "alert" : "status"}>
        {label}
      </span>
    </>
  );
}

// "Update to 2.6.0 will install when 'Tiamat' finishes."
export function waitingSentence(info: UpdateInfo | undefined): string {
  const version = info?.pendingVersion ?? info?.latestVersion ?? "the new version";
  return info?.waitingFor === undefined
    ? `Update to ${version} will install when the running work finishes.`
    : `Update to ${version} will install when '${info.waitingFor}' finishes.`;
}
