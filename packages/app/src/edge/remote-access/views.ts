import type { RemoteAccessView } from "./model.js";
import { addressOf, type Problem } from "./rules.js";
import type { Saved } from "./store.js";

// The views Settings → Remote access shows, each one plain sentence and its fix.

export interface RemoteAccessViews {
  // Where Slopify answers on this computer, and where Tailscale serve forwards to.
  readonly loopbackTarget: () => string;
  readonly base: (
    state: RemoteAccessView["state"],
    summary: string,
    rest?: Partial<RemoteAccessView>,
  ) => RemoteAccessView;
  readonly fromProblem: (problem: Problem, rest?: Partial<RemoteAccessView>) => RemoteAccessView;
  readonly dockerView: () => RemoteAccessView;
  readonly offView: () => RemoteAccessView;
  readonly funnelProblem: (httpsPort: number) => Problem;
  readonly onView: (dnsName: string, httpsPort: number) => RemoteAccessView;
}

export function remoteAccessViews(
  deps: {
    readonly container: boolean;
    readonly listenHost: string;
    readonly port: () => number;
  },
  saved: () => Saved,
): RemoteAccessViews {
  const loopbackTarget = (): string => {
    const host = deps.listenHost;
    const name =
      host === "" || host === "0.0.0.0" || host === "localhost" || host === "127.0.0.1"
        ? "127.0.0.1"
        : host === "::" || host === "::1"
          ? "[::1]"
          : host.includes(":")
            ? `[${host}]`
            : host;
    return `http://${name}:${deps.port()}`;
  };
  const local = (): string => loopbackTarget();

  const base = (
    state: RemoteAccessView["state"],
    summary: string,
    rest: Partial<RemoteAccessView> = {},
  ): RemoteAccessView => ({
    available: !deps.container,
    enabled: saved().enabled,
    state,
    address: null,
    httpsPort: saved().httpsPort,
    suggestedPort: null,
    summary,
    fix: null,
    link: null,
    local: local(),
    changeable: !deps.container,
    ...rest,
  });
  const fromProblem = (problem: Problem, rest: Partial<RemoteAccessView> = {}) =>
    base(problem.state, problem.summary, { fix: problem.fix, link: problem.link, ...rest });

  const dockerView = (): RemoteAccessView =>
    base(
      "docker",
      "Slopify runs in Docker here, so it can't set up Tailscale on the computer itself.",
      {
        enabled: false,
        fix: "Remote access needs Slopify started on the computer itself (npx @gentbajko/slopify). Or set Tailscale up yourself on the host: tailscale serve --bg --https=443 http://127.0.0.1:<Slopify's port>.",
      },
    );
  const offView = (): RemoteAccessView =>
    base("off", `Off: Slopify answers only on this computer, at ${local()}.`);

  const funnelProblem = (httpsPort: number): Problem => ({
    state: "funnel",
    summary:
      "Tailscale Funnel was on for Slopify's address, which would put Slopify on the public internet. Slopify removed its address and refuses every request that comes through Funnel.",
    fix: `Turn Funnel off with tailscale funnel --https=${httpsPort} off, then press Check again.`,
    link: null,
  });

  const onView = (dnsName: string, httpsPort: number): RemoteAccessView =>
    base(
      "on",
      "On: any device in your tailnet can open this address, never the public internet. It works while Slopify runs: Slopify removes it when it stops and adds it back when it starts.",
      { address: addressOf(dnsName, httpsPort) },
    );

  return { loopbackTarget, base, fromProblem, dockerView, offView, funnelProblem, onView };
}
