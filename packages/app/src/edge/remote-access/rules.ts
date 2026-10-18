import { z } from "zod";
import type { TailscaleResult } from "./cli.js";
import { httpsPortChoices, type RemoteAccessState } from "./model.js";

export const installLink = "https://tailscale.com/download";
export const dnsAdminLink = "https://login.tailscale.com/admin/dns";

export interface Problem {
  readonly state: RemoteAccessState;
  readonly summary: string;
  readonly fix: string;
  readonly link: string | null;
}

export interface Machine {
  // cachyhome.tail1234.ts.net, without the trailing dot.
  readonly dnsName: string;
}

const statusShape = z
  .object({
    BackendState: z.string(),
    Self: z.object({ DNSName: z.string().optional() }).loose().optional(),
    CertDomains: z.array(z.string()).nullable().optional(),
  })
  .loose();

const handlerShape = z.object({ Proxy: z.string().optional() }).loose();
const webShape = z.object({ Handlers: z.record(z.string(), handlerShape).optional() }).loose();
const tcpShape = z.object({ HTTPS: z.boolean().optional(), HTTP: z.boolean().optional() }).loose();
const configShape = z
  .object({
    TCP: z.record(z.string(), tcpShape).nullable().optional(),
    Web: z.record(z.string(), webShape).nullable().optional(),
    AllowFunnel: z.record(z.string(), z.boolean()).nullable().optional(),
  })
  .loose();
export type ServeConfig = z.infer<typeof configShape>;
const serveShape = configShape
  .extend({ Foreground: z.record(z.string(), configShape).nullable().optional() })
  .loose();
export type ServeStatus = z.infer<typeof serveShape>;

const deniedPattern = /access denied|permission denied|operator|must be root|not permitted/iu;
const notRunningPattern =
  /failed to connect|doesn't appear to be running|is tailscaled running|connection refused|no such file or directory|cannot connect/iu;

// A failed command's own reason, in the person's words.
export function problemOf(result: TailscaleResult, platform: NodeJS.Platform): Problem {
  if (result.missing)
    return {
      state: "not-installed",
      summary:
        "Tailscale isn't installed on this computer, so Slopify can't open it on your other devices.",
      fix: "Install Tailscale from tailscale.com/download, sign in, then press Check again.",
      link: installLink,
    };
  if (result.timedOut)
    return {
      state: "failed",
      summary: "Tailscale didn't answer within 10 seconds.",
      fix: "Make sure the Tailscale app or service is running (open the Tailscale app, or run tailscale status in a terminal), then press Check again.",
      link: null,
    };
  const text = `${result.stderr}\n${result.stdout}`.trim();
  if (deniedPattern.test(text)) return deniedProblem(platform);
  if (notRunningPattern.test(text)) return notRunningProblem();
  return {
    state: "failed",
    summary: `Tailscale refused: ${firstLine(text) || `it stopped with code ${result.code}`}.`,
    fix: "Run tailscale status in a terminal to see what Tailscale reports, fix that, then press Check again.",
    link: null,
  };
}

export function deniedProblem(platform: NodeJS.Platform): Problem {
  return {
    state: "denied",
    summary: "Tailscale won't let your user change its serve settings.",
    fix:
      platform === "linux"
        ? "On Linux, allow your user once: run sudo tailscale set --operator=$USER in a terminal, then press Check again."
        : "Open the Tailscale app as the user who signed in to it, then press Check again.",
    link: null,
  };
}

function notRunningProblem(): Problem {
  return {
    state: "not-running",
    summary: "Tailscale is installed but not running.",
    fix: "Open the Tailscale app and connect, or run tailscale up in a terminal, then press Check again.",
    link: null,
  };
}

function firstLine(text: string): string {
  return (text.split("\n").find((line) => line.trim() !== "") ?? "").trim().replace(/\.$/u, "");
}

// Which machine this is, or why Tailscale can't serve it yet.
export function machineOf(stdout: string): Machine | Problem {
  let parsed: z.infer<typeof statusShape>;
  try {
    parsed = statusShape.parse(JSON.parse(stdout));
  } catch {
    return {
      state: "failed",
      summary: "Slopify couldn't read tailscale status --json.",
      fix: "Update Tailscale to a current version (tailscale.com/download), then press Check again.",
      link: installLink,
    };
  }
  if (parsed.BackendState === "NeedsLogin" || parsed.BackendState === "NeedsMachineAuth")
    return {
      state: "signed-out",
      summary:
        parsed.BackendState === "NeedsMachineAuth"
          ? "This computer is waiting for approval in your tailnet."
          : "Tailscale is signed out on this computer.",
      fix:
        parsed.BackendState === "NeedsMachineAuth"
          ? "Approve this computer in the Tailscale admin console (login.tailscale.com/admin/machines), then press Check again."
          : "Open the Tailscale app and sign in, or run tailscale up in a terminal, then press Check again.",
      link: null,
    };
  if (parsed.BackendState !== "Running") return notRunningProblem();
  const dnsName = (parsed.Self?.DNSName ?? "").replace(/\.$/u, "");
  const certs = parsed.CertDomains ?? [];
  if (dnsName === "" || !certs.includes(dnsName))
    return {
      state: "https-off",
      summary:
        "Your tailnet has no HTTPS certificates, so Tailscale can't give Slopify an https address.",
      fix: "In the Tailscale admin console open DNS (login.tailscale.com/admin/dns), turn on MagicDNS if it is off, then under HTTPS Certificates press Enable HTTPS. Then press Check again.",
      link: dnsAdminLink,
    };
  return { dnsName };
}

export function isProblem(value: Machine | Problem): value is Problem {
  return "state" in value;
}

export function parseServeStatus(stdout: string): ServeStatus | undefined {
  const text = stdout.trim();
  if (text === "") return {};
  try {
    return serveShape.parse(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export const hostPort = (dnsName: string, httpsPort: number): string => `${dnsName}:${httpsPort}`;

// The address a browser opens; 443 is https's own port, so it isn't written.
export function addressOf(dnsName: string, httpsPort: number): string {
  return httpsPort === 443 ? `https://${dnsName}` : `https://${dnsName}:${httpsPort}`;
}

const normal = (url: string): string => url.replace(/\/+$/u, "");

export type PortUse =
  | { readonly kind: "free" }
  // Exactly one handler, at /, proxying to `target`.
  | { readonly kind: "proxy"; readonly target: string; readonly funnel: boolean }
  | { readonly kind: "other"; readonly what: string };

function configsOf(status: ServeStatus): readonly ServeConfig[] {
  return [status, ...Object.values(status.Foreground ?? {})];
}

// What uses an HTTPS port on this machine now, in the background config or a foreground
// `tailscale serve` still running in someone's terminal.
export function portUse(status: ServeStatus, dnsName: string, httpsPort: number): PortUse {
  const key = hostPort(dnsName, httpsPort);
  const used = configsOf(status).filter(
    (config) => config.TCP?.[String(httpsPort)] !== undefined || config.Web?.[key] !== undefined,
  );
  const [only] = used;
  if (only === undefined) return { kind: "free" };
  const handlers = Object.entries(only.Web?.[key]?.Handlers ?? {});
  const [first] = handlers;
  if (
    used.length === 1 &&
    only.TCP?.[String(httpsPort)]?.HTTPS === true &&
    handlers.length === 1 &&
    first !== undefined &&
    first[0] === "/" &&
    first[1].Proxy !== undefined
  )
    return {
      kind: "proxy",
      target: normal(first[1].Proxy),
      funnel: configsOf(status).some((config) => config.AllowFunnel?.[key] === true),
    };
  return {
    kind: "other",
    what:
      handlers.length === 0
        ? "a TCP forwarder"
        : handlers
            .map(([path, handler]) => `${path} → ${handler.Proxy ?? "a file or text"}`)
            .join(", "),
  };
}

export function sameTarget(a: string, b: string): boolean {
  return normal(a) === normal(b);
}

export function freePort(status: ServeStatus, dnsName: string, except: number): number | null {
  return (
    httpsPortChoices.find(
      (port) => port !== except && portUse(status, dnsName, port).kind === "free",
    ) ?? null
  );
}

export function portTakenProblem(
  httpsPort: number,
  use: Exclude<PortUse, { kind: "free" }>,
  target: string,
  suggestedPort: number | null,
): Problem {
  const instead =
    suggestedPort === null
      ? "Choose another HTTPS port below"
      : `Press Use port ${suggestedPort} to give Slopify its own address`;
  const what = use.kind === "proxy" ? `a proxy to ${use.target}` : use.what;
  const yours =
    use.kind === "proxy" && sameTarget(use.target, target)
      ? " It already points at this Slopify, but you set it up outside Slopify, so Slopify leaves it alone."
      : "";
  return {
    state: "port-taken",
    summary: `HTTPS port ${httpsPort} on your tailnet address is already used by another Tailscale serve setting (${what}).${yours}`,
    fix: `${instead}, or remove the other setting with tailscale serve --https=${httpsPort} off and press Check again.`,
    link: null,
  };
}

export function serveRefusedProblem(result: TailscaleResult, platform: NodeJS.Platform): Problem {
  const text = `${result.stderr}\n${result.stdout}`;
  if (!result.missing && !result.timedOut && /https|cert/iu.test(text) && !deniedPattern.test(text))
    return {
      state: "https-off",
      summary: `Tailscale couldn't give Slopify an https address: ${firstLine(text)}.`,
      fix: "In the Tailscale admin console open DNS (login.tailscale.com/admin/dns), turn on MagicDNS if it is off, then under HTTPS Certificates press Enable HTTPS. Then press Check again.",
      link: dnsAdminLink,
    };
  return problemOf(result, platform);
}
