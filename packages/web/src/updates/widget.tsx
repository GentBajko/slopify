import { RefreshCw, X } from "lucide-react";
import { Popover } from "radix-ui";
import type { ReactElement } from "react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUpdate } from "./use-update.js";

export function UpdateWidget({ reload }: { readonly reload: () => void }): ReactElement {
  const update = useUpdate(reload);
  const titleId = useId();
  const busyId = useId();
  const { info, updating, installing, reconnecting, checking, error } = update;
  const active = updating || installing;
  const label = active
    ? "Slopify updates: Updating Slopify"
    : error
      ? "Slopify updates: Update check failed"
      : info?.available
        ? `Slopify updates: version ${info.latestVersion ?? "new"} available`
        : "Slopify updates";
  const blockedReason =
    info?.blockedReason ??
    (info?.busy
      ? "Pause running projects and wait for their active work to stop before updating."
      : undefined);

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open) update.inspect();
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={label}
          title={label}
          className={cn(
            "fixed right-5 bottom-5 z-30 flex size-10 items-center justify-center rounded-full bg-transparent text-ink2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            error && "text-amber",
          )}
        >
          <RefreshCw
            aria-hidden="true"
            size={20}
            className={cn(active && "animate-spin motion-reduce:animate-none")}
          />
          {info?.available && !active ? (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 size-1.5 rounded-full bg-lamp-run"
            />
          ) : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          side="top"
          sideOffset={10}
          collisionPadding={16}
          aria-labelledby={titleId}
          className="z-50 w-[min(340px,calc(100vw-2rem))] rounded-panel border border-line bg-panel p-4 shadow-[0_8px_24px_var(--color-shadow)]"
        >
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id={titleId} className="text-row font-semibold text-ink">
              Slopify updates
            </h2>
            <Popover.Close asChild>
              <Button variant="ghost" aria-label="Close updates" className="size-8 p-0">
                <X aria-hidden="true" size={16} />
              </Button>
            </Popover.Close>
          </div>
          {info ? (
            <dl className="grid grid-cols-[1fr_auto] gap-x-5 gap-y-1 text-small">
              <dt className="text-ink3">Installed</dt>
              <dd className="text-ink">{info.currentVersion}</dd>
              <dt className="text-ink3">Latest release</dt>
              <dd className="text-ink">{info.latestVersion ?? "Not available"}</dd>
            </dl>
          ) : null}
          <p role="status" className="mt-3 text-small text-ink2">
            {reconnecting
              ? "Reconnecting to Slopify after the update… This tab will reload when it is ready."
              : active
                ? info?.status === "restarting"
                  ? "Restarting Slopify… This tab will reload when it is ready."
                  : "Installing Slopify… You can close this panel while it finishes."
                : checking
                  ? "Checking for updates…"
                  : error
                    ? "The update could not finish. You can check again."
                    : info?.available
                      ? "A new version is ready to install."
                      : info
                        ? "No newer release is available."
                        : "Check for the latest Slopify release."}
          </p>
          {error ? (
            <p role="alert" className="mt-2 break-words text-small text-red">
              {error}
            </p>
          ) : null}
          {blockedReason && !active ? (
            <p id={busyId} className="mt-2 text-small text-ink2">
              {blockedReason}
            </p>
          ) : null}
          {info?.available && !active && !blockedReason ? (
            <p className="mt-2 text-small text-ink3">
              Save any edits first. Updating restarts Slopify and reloads this tab.
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {info?.available || active ? (
              <Button
                variant="primary"
                disabled={!info?.canUpdate || info.busy || active || checking}
                aria-describedby={blockedReason && !active ? busyId : undefined}
                onClick={update.install}
              >
                {active ? "Updating…" : "Update Slopify"}
              </Button>
            ) : null}
            <Button variant="ghost" disabled={active || checking} onClick={update.refresh}>
              <RefreshCw aria-hidden="true" size={14} />
              Check again
            </Button>
          </div>
          <p className="mt-3 text-label text-ink3">
            Checks every 15 minutes. Installs only when you choose.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
