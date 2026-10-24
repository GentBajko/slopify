import { CircleArrowUpIcon } from "lucide-react";
import { type ReactElement, useEffect, useId, useRef } from "react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/kit/menu";
import { useToast } from "@/components/kit/toast";
import type { UpdateInfo } from "./api.js";
import type { UpdateView } from "./use-update.js";

// Slopify's own updates, in words. The rail (and the phone's top bar) shows an item only while
// there is something to see: a version ready to install, an update waiting for running work,
// one under way, or one that failed. It opens a menu with the state in a sentence and the one
// thing to do; installing restarts Slopify, so it is never a single unexplained press. The rest
// of the time the same rows sit at the foot of the Help menu as "Check for updates".

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

// The state in a sentence, then the one row that acts on it: the foot of the Help menu, and the
// whole of the rail item's menu.
export function UpdateMenuRows({ update }: { readonly update: UpdateView }): ReactElement {
  const words = updateWords(update);
  const sentenceId = useId();
  return (
    <>
      {words.sentence === "" ? null : (
        <MenuLabel
          id={sentenceId}
          className="max-w-[280px] font-normal text-small text-ink-2 whitespace-normal"
        >
          {words.sentence}
        </MenuLabel>
      )}
      <MenuItem
        disabled={words.busy}
        aria-describedby={words.sentence === "" ? undefined : sentenceId}
        onSelect={() => pressUpdate(update)}
      >
        <CircleArrowUpIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
        {words.action}
      </MenuItem>
    </>
  );
}

// The rail item that appears while there is news, with its live region (always mounted, so a
// failure or a wait is announced wherever the person is). On a phone (`item={false}`) the news
// stays in the Help menu, and only the live region and the toast are here.
export function UpdateWidget({
  update,
  className,
  item = true,
}: {
  readonly update: UpdateView;
  readonly className?: string;
  readonly item?: boolean;
}): ReactElement {
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
    <>
      {item && words.news ? (
        <Menu modal={false}>
          <MenuTrigger asChild>
            <button type="button" className={className}>
              <CircleArrowUpIcon aria-hidden="true" strokeWidth={1.75} />
              <span>{words.state}</span>
            </button>
          </MenuTrigger>
          <MenuContent side="right" align="end">
            <UpdateMenuRows update={update} />
          </MenuContent>
        </Menu>
      ) : null}
      <span className="sr-only" role={update.error === undefined ? "status" : "alert"}>
        {words.sentence}
      </span>
    </>
  );
}

// "Update to 2.6.0 will install when 'Cleopatra' finishes."
export function waitingSentence(info: UpdateInfo | undefined): string {
  const version = info?.pendingVersion ?? info?.latestVersion ?? "the new version";
  return info?.waitingFor === undefined
    ? `Update to ${version} will install when the running work finishes.`
    : `Update to ${version} will install when '${info.waitingFor}' finishes.`;
}
