import type { ShownNotice, ShownTopicsNotice } from "./watcher.js";

// The browser half of run notifications: the per-browser toggle, the permission, the one-tab
// claim and the Notification itself. Storage can be missing or throw (private windows, blocked
// site data), and every read and write here survives that.

const preferenceKey = "slopify.notifications.browser";
const claimsKey = "slopify.notifications.sent";
// Every open tab hears the same event within a moment; a minute covers a slow project fetch.
const claimWindowMs = 60_000;

const listeners = new Set<() => void>();

export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

export function browserNotificationsOn(): boolean {
  try {
    return window.localStorage.getItem(preferenceKey) === "on";
  } catch {
    return false;
  }
}

export function setBrowserNotifications(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(preferenceKey, "on");
    else window.localStorage.removeItem(preferenceKey);
  } catch {
    // Without storage the choice can't be kept; the toggle reads back off and says so.
  }
  for (const listener of listeners) listener();
}

// Fires on this tab's own changes and on another tab's (the `storage` event).
export function onBrowserNotificationsChange(listener: () => void): () => void {
  listeners.add(listener);
  const fromOtherTab = (event: StorageEvent): void => {
    if (event.key === preferenceKey) listener();
  };
  window.addEventListener("storage", fromOtherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", fromOtherTab);
  };
}

export function browserNotificationsReady(): boolean {
  return browserNotificationsOn() && notificationPermission() === "granted";
}

// The sentence the Settings screen shows when the browser won't let the page notify.
export function permissionProblem(
  permission: NotificationPermission | "unsupported",
): string | undefined {
  if (permission === "unsupported")
    return "This browser can't show notifications. Use a current Chrome, Edge, Firefox or Safari, or set a Notification URL below instead.";
  if (permission === "denied")
    return "Notifications are blocked for this site. Allow them in your browser's site settings (the icon left of the address bar), reload, then turn Browser notifications on again.";
  return undefined;
}

// Asked only from the toggle's own click: browsers refuse (or silently deny) a prompt that
// no gesture led to, and nobody should meet one on page load.
export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return await Notification.requestPermission();
}

// One tab per transition. The Web Locks API makes the read-then-write atomic across tabs;
// without it the write still stops every tab that looks a moment later.
export async function claimOnce(key: string, now: () => number = Date.now): Promise<boolean> {
  const attempt = (): boolean => {
    let claims: Record<string, number> = {};
    try {
      const stored: unknown = JSON.parse(window.localStorage.getItem(claimsKey) ?? "{}");
      if (typeof stored === "object" && stored !== null)
        claims = Object.fromEntries(
          Object.entries(stored).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === "number" && now() - entry[1] < claimWindowMs,
          ),
        );
    } catch {
      // Unreadable storage or a damaged value: start from nothing.
    }
    if (claims[key] !== undefined) return false;
    try {
      window.localStorage.setItem(claimsKey, JSON.stringify({ ...claims, [key]: now() }));
    } catch {
      // Without storage each tab decides alone; the notification's tag still folds repeats.
    }
    return true;
  };
  try {
    if (typeof navigator !== "undefined" && navigator.locks !== undefined)
      return await navigator.locks.request("slopify-run-notification", attempt);
  } catch {
    // A lock manager that refuses falls through to the unlocked check.
  }
  return attempt();
}

export function showBrowserNotification(
  notice: Pick<ShownNotice, "projectId" | "text">,
  open: (projectId: string) => void,
): void {
  // The tag makes a second notification for the same project replace the first rather than
  // stack beside it, whatever the claim above missed.
  const shown = new Notification(notice.text.headline, {
    body: notice.text.detail,
    tag: `slopify-run-${notice.projectId}`,
  });
  shown.onclick = () => {
    window.focus();
    open(notice.projectId);
    shown.close();
  };
}

// The same notification for a schedule's suggested topics; clicking it opens the calendar,
// where they wait in Suggested topics.
export function showTopicsNotification(notice: ShownTopicsNotice, open: () => void): void {
  const shown = new Notification(notice.text.headline, {
    body: notice.text.detail,
    tag: `slopify-topics-${notice.scheduleId}`,
  });
  shown.onclick = () => {
    window.focus();
    open();
    shown.close();
  };
}
