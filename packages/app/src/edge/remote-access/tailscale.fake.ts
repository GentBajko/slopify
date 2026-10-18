import { assertServeOnly, type TailscaleResult, type TailscaleRun } from "./cli.js";
import type { ServeStatus } from "./rules.js";

export interface FakeTailscale {
  readonly run: TailscaleRun;
  readonly calls: string[][];
  // The background serve config, as `tailscale serve status --json` prints it.
  config: ServeStatus;
  installed: boolean;
  backend: "Running" | "Stopped" | "NeedsLogin" | "NeedsMachineAuth" | "down";
  https: boolean;
  denyServe: boolean;
  hang: boolean;
  // Someone turned Funnel on for every handler Slopify adds.
  funnelOnAdd: boolean;
}

export const fakeDns = "box.tail1234.ts.net";

const ok = (stdout: string): TailscaleResult => ({
  code: 0,
  stdout,
  stderr: "",
  missing: false,
  timedOut: false,
});
const fail = (stderr: string, code = 1): TailscaleResult => ({
  code,
  stdout: "",
  stderr,
  missing: false,
  timedOut: false,
});

// A tailscale command that keeps serve settings the way tailscaled does: per host:port, with
// `--https=N off` removing exactly that port. It refuses anything but status and serve.
export function fakeTailscale(start: ServeStatus = {}): FakeTailscale {
  const fake: FakeTailscale = {
    calls: [],
    config: structuredClone(start),
    installed: true,
    backend: "Running",
    https: true,
    denyServe: false,
    hang: false,
    funnelOnAdd: false,
    run: async (args) => {
      assertServeOnly(args);
      fake.calls.push([...args]);
      if (!fake.installed)
        return { code: 127, stdout: "", stderr: "", missing: true, timedOut: false };
      if (fake.hang) return { code: 1, stdout: "", stderr: "", missing: false, timedOut: true };
      if (fake.backend === "down")
        return fail(
          "failed to connect to local tailscaled; it doesn't appear to be running (sudo systemctl start tailscaled ?)",
        );
      const [command, ...rest] = args;
      if (command === "status")
        return {
          ...ok(
            JSON.stringify({
              BackendState: fake.backend,
              Self: { DNSName: `${fakeDns}.`, UserID: 7 },
              User: { "7": { ID: 7, LoginName: "ann@example.com" } },
              CertDomains: fake.https ? [fakeDns] : null,
            }),
          ),
          code: fake.backend === "Running" ? 0 : 1,
        };
      if (rest[0] === "status") return ok(JSON.stringify(fake.config, null, 2));
      if (fake.denyServe)
        return fail(
          "Access denied: serve config denied\n\nUse 'sudo tailscale serve --bg 6969'.\nTo not require root, use 'sudo tailscale set --operator=$USER' once.",
        );
      const httpsFlag = rest.find((arg) => arg.startsWith("--https="));
      if (httpsFlag === undefined) return fail("unsupported in this fake");
      const port = httpsFlag.slice("--https=".length);
      const key = `${fakeDns}:${port}`;
      if (rest.at(-1) === "off") {
        const tcp = { ...fake.config.TCP };
        const web = { ...fake.config.Web };
        const funnel = { ...fake.config.AllowFunnel };
        if (tcp[port] === undefined)
          return fail(`error: serve config does not exist for port ${port}`);
        delete tcp[port];
        delete web[key];
        delete funnel[key];
        fake.config = { ...fake.config, TCP: tcp, Web: web, AllowFunnel: funnel };
        return ok("");
      }
      const target = rest.at(-1) ?? "";
      fake.config = {
        ...fake.config,
        TCP: { ...fake.config.TCP, [port]: { HTTPS: true } },
        Web: { ...fake.config.Web, [key]: { Handlers: { "/": { Proxy: target } } } },
        ...(fake.funnelOnAdd ? { AllowFunnel: { ...fake.config.AllowFunnel, [key]: true } } : {}),
      };
      return ok(`Available within your tailnet:\n\nhttps://${fakeDns}/\n|-- proxy ${target}\n`);
    },
  };
  return fake;
}

// Someone's own serve setting on a port, made outside Slopify.
export function othersProxy(port: number, target: string): ServeStatus {
  return {
    TCP: { [String(port)]: { HTTPS: true } },
    Web: { [`${fakeDns}:${port}`]: { Handlers: { "/": { Proxy: target } } } },
  };
}
