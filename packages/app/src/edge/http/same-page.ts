import type { Context } from "hono";

// The Host a request through Slopify's own Tailscale serve handler carries, or undefined while
// remote access is off (`edge/remote-access/service.ts`).
export type RemoteHost = () => string | undefined;

// The address of what connected to this server: the browser, or a proxy in front of it.
// Undefined for an in-process request, which has no socket.
export function peerAddress(c: Context): string | undefined {
  const env: unknown = c.env;
  if (typeof env !== "object" || env === null || !("incoming" in env)) return undefined;
  const incoming: unknown = env.incoming;
  if (typeof incoming !== "object" || incoming === null || !("socket" in incoming))
    return undefined;
  const socket: unknown = incoming.socket;
  if (typeof socket !== "object" || socket === null || !("remoteAddress" in socket))
    return undefined;
  return typeof socket.remoteAddress === "string" ? socket.remoteAddress : undefined;
}

const loopbackPeer = (address: string | undefined): boolean =>
  address !== undefined &&
  (address === "::1" || /^(?:::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(address));

// The name the browser used, as a proxy on this computer passes it on in X-Forwarded-Host
// (its first value). Only trusted from a loopback peer: anyone else could write the header.
export function forwardedHost(c: Context): string | undefined {
  if (!loopbackPeer(peerAddress(c))) return undefined;
  const first = c.req.header("x-forwarded-host")?.split(",")[0]?.trim();
  return first === undefined || first === "" ? undefined : first;
}

// host[:port] with the scheme's default port left out, as an Origin's own host has it.
function hostOf(host: string, scheme: string): string {
  const lower = host.trim().toLowerCase();
  const fallback = scheme === "https:" ? ":443" : scheme === "http:" ? ":80" : undefined;
  return fallback !== undefined && lower.endsWith(fallback)
    ? lower.slice(0, -fallback.length)
    : lower;
}

// Standard same-origin protection: a browser's Origin names the page that sent the request,
// and a page at the very host:port the browser addressed is Slopify's own, whatever proxy
// (Slopify's remote access, a `tailscale serve` set up by hand, Caddy, nginx) stands in front.
// A cross-site page names its own host, so it never matches; which names may reach Slopify at
// all is `request-guard.ts`'s Host check.
function sameHost(c: Context, origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.host === "") return false;
  const own = url.host.toLowerCase();
  return [c.req.header("host"), forwardedHost(c)].some(
    (host) => host !== undefined && hostOf(host, url.protocol) === own,
  );
}

// Whether a request with an Origin comes from the Slopify page itself: the page this server
// serves, the page at the address the browser used for this request (through any proxy), or
// the same page at the exact https address Slopify set up in Tailscale.
export function fromSlopifyPage(c: Context, remoteHost: RemoteHost | undefined): boolean {
  const origin = c.req.header("origin");
  if (origin === undefined || origin === new URL(c.req.url).origin) return true;
  if (sameHost(c, origin)) return true;
  const remote = remoteHost?.();
  return (
    remote !== undefined &&
    origin === `https://${remote}` &&
    (c.req.header("x-forwarded-host") ?? c.req.header("host")) === remote
  );
}

// A request that reached Slopify through a forwarding proxy, Tailscale serve included: it sets
// X-Forwarded-For on every request and keeps the ts.net Host. Agents' endpoints answer only
// requests made on this computer.
export function viaProxy(headers: Headers): boolean {
  if (headers.has("x-forwarded-for") || headers.has("x-forwarded-host")) return true;
  if (headers.has("tailscale-user-login") || headers.has("tailscale-funnel-request")) return true;
  const host = headers.get("host") ?? "";
  const name = host.replace(/:\d+$/u, "").toLowerCase();
  return name.endsWith(".ts.net");
}

// Tailscale marks every request that came through Funnel, from the public internet.
export function viaFunnel(headers: Headers): boolean {
  return headers.has("tailscale-funnel-request");
}
