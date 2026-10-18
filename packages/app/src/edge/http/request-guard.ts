import { isIP } from "node:net";
import { hostname } from "node:os";
import type { MiddlewareHandler } from "hono";
import { actorOf } from "./actor.js";
import { problem } from "./problem.js";
import { forwardedHost, fromSlopifyPage, type RemoteHost } from "./same-page.js";

// Slopify has no login, so what a request may do rests on where it came from. A web page the
// person happens to have open must not reach it:
// - by DNS rebinding: a name the page controls pointed at 127.0.0.1, so the browser treats
//   Slopify as that page's own site. Every request must be addressed to a name Slopify
//   answers to: loopback, an IP address, the address it listens on, a Tailscale address,
//   this computer's own name, or a name the person lists in SLOPIFY_ALLOWED_HOSTS.
//   Behind a proxy on this computer the name the browser used is its X-Forwarded-Host, which
//   must pass the same check.
// - by a cross-site request: a form or no-cors fetch a browser sends without asking. A change
//   that carries an Origin must come from Slopify's own page, at the very host:port the
//   browser addressed (`same-page.ts`), so any proxy the person put in front keeps working;
//   a body a form could send (text, url-encoded, multipart) without an Origin needs
//   X-Slopify-Client.
// Not checked here: agents' and the assistant's in-process calls (no network request can make
// one), and the paired Studio extension's routes, which carry its token and answer its origin.

export interface HostRules {
  readonly listenHost: string | undefined;
  readonly remoteHost: string | undefined;
  readonly extraHosts: readonly string[];
}

const nameOf = (host: string): string => {
  const trimmed = host.trim().toLowerCase();
  if (trimmed.startsWith("[")) return trimmed.slice(1, trimmed.indexOf("]"));
  const colon = trimmed.indexOf(":");
  return colon === trimmed.lastIndexOf(":") && colon >= 0 ? trimmed.slice(0, colon) : trimmed;
};

const ownNames = (): readonly string[] => {
  const own = hostname().toLowerCase();
  return own === "" ? [] : [own, `${own}.local`];
};

export function hostAllowed(host: string | undefined, rules: HostRules): boolean {
  // An in-process request, or an HTTP/1.0 client, names no host.
  if (host === undefined) return true;
  const name = nameOf(host);
  if (name === "") return false;
  if (isIP(name) !== 0) return true;
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  // This computer's tailnet name, also when the person serves Slopify through Tailscale
  // themselves: a ts.net name only resolves inside a tailnet, never to someone's loopback.
  if (name.endsWith(".ts.net")) return true;
  const named = [
    rules.listenHost,
    rules.remoteHost === undefined ? undefined : nameOf(rules.remoteHost),
    ...rules.extraHosts,
    ...ownNames(),
  ].flatMap((one) => (one === undefined || one.trim() === "" ? [] : [one.trim().toLowerCase()]));
  return named.includes(name);
}

const formTypes = ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"];
const safeMethods = ["GET", "HEAD", "OPTIONS"];
// The paired extension's own routes: token-checked, with CORS for its origin alone.
const extensionRoutes = /^\/api\/(?:studio|social)\/ext(?:\/|$)/;

export function requestGuard(deps: {
  readonly listenHost: string | undefined;
  readonly remoteHost: RemoteHost | undefined;
  readonly extraHosts: readonly string[];
}): MiddlewareHandler {
  return async (c, next) => {
    if (actorOf(c) !== "person") return next();
    const rules: HostRules = {
      listenHost: deps.listenHost,
      remoteHost: deps.remoteHost?.(),
      extraHosts: deps.extraHosts,
    };
    const host = c.req.header("host");
    const forwarded = forwardedHost(c);
    const refused = !hostAllowed(host, rules)
      ? (host ?? "")
      : forwarded !== undefined && !hostAllowed(forwarded, rules)
        ? forwarded
        : undefined;
    if (refused !== undefined) {
      const shown = refused.replace(/[^\w.:[\]-]/g, "").slice(0, 100);
      return problem(c, {
        status: 403,
        detail: `Slopify refused this request: it was addressed to ${shown}, a name this Slopify doesn't answer to, which is how a web page could reach it through your browser. Open Slopify at http://127.0.0.1 and its port. If you reach it by this name on purpose, start Slopify with SLOPIFY_ALLOWED_HOSTS=${nameOf(shown)}.`,
        extensions: { reason: "foreign-host" },
      });
    }
    if (
      safeMethods.includes(c.req.method) ||
      !c.req.path.startsWith("/api/") ||
      extensionRoutes.test(c.req.path)
    )
      return next();
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      if (fromSlopifyPage(c, deps.remoteHost)) return next();
      return problem(c, {
        status: 403,
        detail: `Slopify refused this request: it came from a web page at another address (${origin.slice(0, 100)}). Changes are made only from Slopify's own page; open Slopify and try again there.`,
        extensions: { reason: "foreign-origin" },
      });
    }
    const type = (c.req.header("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
    if (formTypes.includes(type) && c.req.header("x-slopify-client") === undefined)
      return problem(c, {
        status: 403,
        detail:
          "Slopify refused this request: it looks like a form another web page sent. Slopify's page sends its changes itself; open Slopify and try again there. A script on this computer can send the header X-Slopify-Client: script.",
        extensions: { reason: "form-request" },
      });
    return next();
  };
}
