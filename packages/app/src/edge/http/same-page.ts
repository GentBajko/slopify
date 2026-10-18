import type { Context } from "hono";

// The Host a request through Slopify's own Tailscale serve handler carries, or undefined while
// remote access is off (`edge/remote-access/service.ts`).
export type RemoteHost = () => string | undefined;

function forwardedHost(c: Context): string | undefined {
  return c.req.header("x-forwarded-host") ?? c.req.header("host");
}

// Whether a request with an Origin comes from the Slopify page itself: the page this server
// serves, or the same page opened at the exact https address Slopify set up in Tailscale.
// Tailscale ends TLS and forwards plain http, so that page's Origin is https while this
// request's own URL is http; nothing broader than that one address is accepted.
export function fromSlopifyPage(c: Context, remoteHost: RemoteHost | undefined): boolean {
  const origin = c.req.header("origin");
  if (origin === undefined || origin === new URL(c.req.url).origin) return true;
  const remote = remoteHost?.();
  return remote !== undefined && origin === `https://${remote}` && forwardedHost(c) === remote;
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
