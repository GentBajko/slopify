import type { MiddlewareHandler } from "hono";
import type { RemoteAccessService } from "../remote-access/service.js";
import { problem } from "./problem.js";
import { viaProxy } from "./same-page.js";

// Remote access opens Slopify's page on the person's other devices, and only for them: a
// request through Tailscale from any other account is refused, and what sets up the computer
// itself (keys, a CLI's path that is later run, imports, updates, start at login, folders and
// clean-ups that can't be undone) is done only on the computer Slopify runs on.

interface HostOnly {
  readonly method: string;
  readonly path: RegExp;
  // What it is and where it is done, for the refusal.
  readonly what: string;
}

const id = "[^/]+";
export const hostOnlyWrites: readonly HostOnly[] = [
  {
    method: "PUT|DELETE",
    path: new RegExp(`^/api/providers/${id}/key/?$`),
    what: "Provider keys are saved and removed (Settings → Providers)",
  },
  {
    method: "PUT",
    path: new RegExp(`^/api/providers/${id}/path/?$`),
    what: "A CLI's path is set (Settings → Providers)",
  },
  {
    method: "PUT",
    path: /^\/api\/storage\/import\/?$/,
    what: "A backup is imported (Settings → Backup & storage)",
  },
  {
    method: "POST",
    path: new RegExp(
      `^/api/storage/(?:cleanup|old-versions/delete|projects/${id}/(?:old-versions/delete|keep-outputs))/?$`,
    ),
    what: "Clean-ups that delete files are run (Settings → Backup & storage)",
  },
  {
    method: "POST",
    path: /^\/api\/storage\/files\/move\/?$/,
    what: "The Files folder is moved (Settings → Backup & storage)",
  },
  {
    method: "PUT",
    path: /^\/api\/backups\/?$/,
    what: "The backup folder is set (Settings → Backup & storage)",
  },
  {
    method: "POST|DELETE",
    path: /^\/api\/update(?:\/activate)?\/?$/,
    what: "Updates are installed (Settings → About)",
  },
  {
    method: "PUT",
    path: /^\/api\/settings\/autostart\/?$/,
    what: "Start with this computer is turned on or off (Settings → General)",
  },
];

export const otherAccount =
  "Slopify refused this request: over remote access it answers only the Tailscale account that turned remote access on. Sign in to Tailscale on this device with that account, or open Slopify on the computer it runs on.";

export const hostOnlySentence = (what: string): string =>
  `${what} only on the computer Slopify runs on, not over remote access: open Slopify there, at http://127.0.0.1 and Slopify's port, and do it there.`;

export function remoteGuard(remoteAccess: RemoteAccessService | undefined): MiddlewareHandler {
  return async (c, next) => {
    const headers = c.req.raw.headers;
    // The agents' endpoints refuse every proxied request themselves, with their own sentence.
    if (!viaProxy(headers) || /^\/mcp(?:\/|$)/.test(c.req.path)) return next();
    const owner = remoteAccess?.owner();
    const remote = remoteAccess?.remoteHost();
    const throughServe =
      headers.has("tailscale-user-login") ||
      (remote !== undefined &&
        (headers.get("x-forwarded-host") === remote || headers.get("host") === remote));
    if (owner !== undefined && throughServe && headers.get("tailscale-user-login") !== owner)
      return problem(c, { status: 403, detail: otherAccount });
    const path = c.req.path;
    const write = hostOnlyWrites.find(
      (rule) => rule.method.split("|").includes(c.req.method) && rule.path.test(path),
    );
    if (write !== undefined)
      return problem(c, {
        status: 403,
        detail: hostOnlySentence(write.what),
        extensions: { reason: "host-only" },
      });
    return next();
  };
}
