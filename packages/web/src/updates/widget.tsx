import { CircleArrowUpIcon } from "lucide-react";
import { type ReactElement, useEffect, useRef } from "react";
import { useToast } from "@/components/kit/toast";
import { cn } from "@/lib/utils";
import type { UpdateInfo } from "./api.js";
import type { UpdateView } from "./use-update.js";

// Slopify's own updates, in words. The rail and the phone's top bar carry one button of their
// own for them, always there rather than inside Help, because "is there a new version" is a
// question people ask of the app itself and not of its help. The button says which version this
// is, turns while it looks, and names a waiting one in the accent's ink. Installing restarts
// Slopify, so the press that does it is never unexplained: the state stands in a sentence on the
// button and in the live region beside it.

export interface UpdateWords {
  // Shown without opening a menu.
  readonly news: boolean;
  // The rail item's words: the state, short.
  readonly state: string;
  // The menu row's words, named for what a press does.
  readonly action: string;
  // The whole state in a sentence: under the row, and in the live region.
  readonly sentence: string;
  // A press does nothing now (checking, installing).
  readonly busy: boolean;
}

export function updateWords(update: UpdateView): UpdateWords {
  const { info, updating, installing, reconnecting, checking, error } = update;
  const available = info?.available === true;
  const newest = info?.latestVersion ?? "the new version";
  if (reconnecting)
    return {
      news: true,
      state: "Updating…",
      action: "Updating…",
      sentence: "Reconnecting after the update…",
      busy: true,
    };
  if (updating || installing)
    return {
      news: true,
      state: "Updating…",
      action: "Updating…",
      sentence: `Updating to ${newest}. Slopify restarts, then this page reloads.`,
      busy: true,
    };
  if (info?.status === "waiting")
    return {
      news: true,
      state: "Update waiting",
      action: "Cancel the update",
      sentence: waitingSentence(info),
      busy: false,
    };
  if (checking)
    return {
      news: available,
      state: "Update ready",
      action: "Checking for updates…",
      sentence: "Checking for updates…",
      busy: true,
    };
  const installable =
    info?.available === true && info.canUpdate && info.blockedReason === undefined;
  const versions =
    info === undefined
      ? undefined
      : available
        ? `Your version: ${info.currentVersion} · Newest: ${newest}.`
        : `You have Slopify ${info.currentVersion}.`;
  const next = installable
    ? "Installing restarts Slopify; anything running finishes first."
    : info?.blockedReason;
  return {
    news: available,
    state: available && error !== undefined ? "Update failed" : "Update ready",
    action: installable ? `Install update ${newest}` : "Check for updates",
    sentence: error ?? [versions, next].filter((part) => part !== undefined).join(" "),
    busy: false,
  };
}

// What a press does: cancel a waiting update, install a ready one, or look again.
function pressUpdate(update: UpdateView): void {
  const { info } = update;
  if (info === undefined) update.refresh();
  else if (info.status === "waiting") update.cancel();
  else if (info.available && info.canUpdate && info.blockedReason === undefined) update.install();
  else update.refresh();
}

// The button itself: one press away from checking, from installing a version that is ready, or
// from calling off one that is waiting — whichever the state makes it. `words.action` names the
// press, so the accessible name is always what pressing does and never the bare word on it.
//
// `versions` is false where there is no room for the lines under it (the phone's top bar), which
// leaves the icon and the same accessible name.
export function UpdateButton({
  update,
  className,
  versions = true,
}: {
  readonly update: UpdateView;
  readonly className?: string;
  readonly versions?: boolean;
}): ReactElement {
  const words = updateWords(update);
  const info = update.info;
  const ready = words.news && info?.available === true;
  return (
    <button
      type="button"
      className={cn(className, words.news && "sl-navrail__item--news")}
      // The whole state, for a mouse: the live region in `UpdateWidget` says the same thing to a
      // reader, so the title never has to be found to be understood.
      title={words.sentence === "" ? undefined : words.sentence}
      aria-label={words.action}
      disabled={words.busy}
      onClick={() => pressUpdate(update)}
    >
      <CircleArrowUpIcon
        aria-hidden="true"
        strokeWidth={1.75}
        // Turning while it looks or installs: the press has to show it landed, and this is the
        // only moving part the rail gets. Stilled where motion is unwelcome.
        className={cn(words.busy && "animate-spin motion-reduce:animate-none")}
      />
      <span>Update</span>
      {versions && info?.currentVersion !== undefined ? (
        <span aria-hidden="true" className="sl-navrail__version">
          {info.currentVersion}
        </span>
      ) : null}
      {versions && ready && info?.latestVersion !== undefined ? (
        <span aria-hidden="true" className="sl-navrail__next">
          {`→ ${info.latestVersion}`}
        </span>
      ) : null}
    </button>
  );
}

// The live region that goes with the button, always mounted, so a failure or a wait is announced
// wherever the person is, and the toast that says an update started waiting.
export function UpdateWidget({ update }: { readonly update: UpdateView }): ReactElement {
  const words = updateWords(update);
  // Said once when the update starts waiting; the item keeps saying it after.
  const notify = useToast();
  const told = useRef(false);
  const waiting = update.info?.status === "waiting" ? waitingSentence(update.info) : undefined;
  useEffect(() => {
    if (waiting === undefined) told.current = false;
    else if (!told.current) {
      told.current = true;
      notify(waiting, "info");
    }
  }, [waiting, notify]);
  return (
    <span className="sr-only" role={update.error === undefined ? "status" : "alert"}>
      {words.sentence}
    </span>
  );
}

// "Update to 2.6.0 will install when 'Cleopatra' finishes."
export function waitingSentence(info: UpdateInfo | undefined): string {
  const version = info?.pendingVersion ?? info?.latestVersion ?? "the new version";
  return info?.waitingFor === undefined
    ? `Update to ${version} will install when the running work finishes.`
    : `Update to ${version} will install when '${info.waitingFor}' finishes.`;
}
