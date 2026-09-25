import { RefreshCw } from "lucide-react";
import type { ReactElement } from "react";
import { cn } from "@/lib/utils";
import { useUpdate } from "./use-update.js";

export function UpdateWidget({ reload }: { readonly reload: () => void }): ReactElement {
  const update = useUpdate(reload);
  const { info, updating, installing, reconnecting, checking, error } = update;
  const active = updating || installing;
  const blocked =
    info?.blockedReason ?? (info?.busy ? "Pause running projects before updating." : undefined);
  const versions = info
    ? info.available
      ? `Your version: ${info.currentVersion} · Newest: ${info.latestVersion}`
      : `Slopify ${info.currentVersion}`
    : "Slopify";
  const action = reconnecting
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
          if (info?.available && info.canUpdate && !blocked) update.install();
          else update.refresh();
        }}
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-control bg-transparent text-ink2 hover:bg-panel2 hover:text-ink",
          error && "text-amber",
        )}
      >
        <RefreshCw
          aria-hidden="true"
          size={16}
          className={cn((active || checking) && "animate-spin motion-reduce:animate-none")}
        />
        {info?.available && !active ? (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 size-2 rounded-full bg-lamp-run"
          />
        ) : null}
      </button>
      <span className="sr-only" role={error ? "alert" : "status"}>
        {label}
      </span>
    </>
  );
}
