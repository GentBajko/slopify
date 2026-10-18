// What Settings → General → Remote access shows. The web client imports this file, so it stays
// free of Node imports.

export const remoteAccessStates = [
  // The switch is off: Slopify answers only on this computer.
  "off",
  // Tailscale serves Slopify's address on the tailnet.
  "on",
  // Slopify runs in Docker; the switch needs Slopify started on the computer itself.
  "docker",
  "not-installed",
  "not-running",
  "signed-out",
  // The tailnet has no HTTPS certificates (MagicDNS and HTTPS in the admin console).
  "https-off",
  // Tailscale refused this user (Linux: not the operator).
  "denied",
  // Another serve setting already uses the HTTPS port.
  "port-taken",
  // Tailscale Funnel was found on Slopify's address; Slopify removed its own setting.
  "funnel",
  // The switch is on, but Slopify's address isn't in Tailscale right now.
  "not-applied",
  "failed",
] as const;
export type RemoteAccessState = (typeof remoteAccessStates)[number];

export interface RemoteAccessView {
  // False only in Docker.
  readonly available: boolean;
  // The switch as saved: on means Slopify sets the address up at every start.
  readonly enabled: boolean;
  readonly state: RemoteAccessState;
  // https://<machine>.<tailnet>.ts.net[:port] while it is on.
  readonly address: string | null;
  readonly httpsPort: number;
  // port-taken: a free HTTPS port Slopify can use instead.
  readonly suggestedPort: number | null;
  // One plain sentence of the current state.
  readonly summary: string;
  // What to do about a problem, with the exact place or command; null when nothing is wrong.
  readonly fix: string | null;
  // A page the fix names (Tailscale's download page, the admin console's DNS page).
  readonly link: string | null;
  // The address on this computer, always reachable here.
  readonly local: string;
  // False on a page opened through the remote address: the switch is changed on this computer.
  readonly changeable: boolean;
}

export const defaultHttpsPort = 443;
// The ports Slopify offers when one is taken, in order. Any port works for Serve; these are the
// ones Tailscale's own documentation uses.
export const httpsPortChoices = [443, 8443, 10000] as const;

// Settings rows: the switch as the person set it, and the exact serve handler Slopify added
// (removed again only when it is still exactly that).
export const remoteAccessKey = "remote-access";
export const remoteAccessAppliedKey = "remote-access.applied";
