// Where a project was opened from, so its page's way back returns there: Projects with the
// filter and search that were on, Home, the calendar, or the channel's page. The shell records
// each list it shows; a project page (any of its sections) keeps the last one, and any other
// screen forgets it, so the way back never points somewhere unrelated.

export interface Origin {
  readonly to: string;
  readonly search: Readonly<Record<string, unknown>>;
  readonly label: string;
}

let origin: Origin | undefined;

const projectPage = /^\/projects\/[^/]+/;
const channelPage = /^\/channels\/([^/]+)$/;

export function recordLocation(
  pathname: string,
  search: Readonly<Record<string, unknown>>,
  channelName: (id: string) => string | undefined,
): void {
  if (projectPage.test(pathname)) return;
  if (pathname === "/projects") origin = { to: "/projects", search, label: "Projects" };
  else if (pathname === "/") origin = { to: "/", search: {}, label: "Home" };
  else if (pathname === "/calendar") origin = { to: "/calendar", search, label: "Calendar" };
  else {
    const channel = channelPage.exec(pathname)?.[1];
    origin =
      channel === undefined
        ? undefined
        : {
            to: pathname,
            search,
            label: channelName(decodeURIComponent(channel)) ?? "Channel",
          };
  }
}

const projects: Origin = { to: "/projects", search: {}, label: "Projects" };

export function cameFrom(): Origin {
  return origin ?? projects;
}

// For tests: forget the recorded origin.
export function forgetOrigin(): void {
  origin = undefined;
}
