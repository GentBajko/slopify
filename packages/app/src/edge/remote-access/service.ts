import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { deleteSetting, readSetting, writeSetting } from "../../slices/settings/repo.js";
import { type TailscaleRun, tailscaleCommands } from "./cli.js";
import {
  defaultHttpsPort,
  type RemoteAccessView,
  remoteAccessAppliedKey,
  remoteAccessKey,
} from "./model.js";
import {
  addressOf,
  freePort,
  isProblem,
  type Machine,
  machineOf,
  type Problem,
  parseServeStatus,
  portTakenProblem,
  portUse,
  problemOf,
  type ServeStatus,
  sameTarget,
  serveRefusedProblem,
} from "./rules.js";

export interface RemoteAccessDeps {
  readonly db: DatabaseSync;
  readonly run: TailscaleRun;
  readonly platform: NodeJS.Platform;
  // Slopify runs in a container: the tailscale command, if any, is the host's.
  readonly container: boolean;
  // The address Slopify listens on (`--host`) and the port it really got.
  readonly listenHost: string;
  readonly port: () => number;
  readonly log: Log;
  readonly now: () => number;
}

export interface RemoteAccessService {
  view(): Promise<RemoteAccessView>;
  // Saves the switch and sets Slopify's address up in Tailscale or removes it. A problem is
  // the view's own state and sentences, never a throw.
  set(enabled: boolean, httpsPort?: number): Promise<RemoteAccessView>;
  // At start: the address again when the switch is on, or a handler a crash left behind removed.
  start(): Promise<void>;
  // At shutdown: Slopify's handler removed, the switch kept, so nothing proxies to a port that
  // another program could take while Slopify is stopped.
  stop(): Promise<void>;
  // The Host a request through Slopify's own serve handler carries (name[:port]), or undefined.
  remoteHost(): string | undefined;
}

const savedShape = z.object({
  enabled: z.boolean(),
  httpsPort: z.number().int().min(1).max(65535),
});
type Saved = z.infer<typeof savedShape>;
const appliedShape = z.object({
  dnsName: z.string(),
  httpsPort: z.number().int(),
  target: z.string(),
});
type Applied = z.infer<typeof appliedShape>;

function readJson<T>(db: DatabaseSync, key: string, shape: z.ZodType<T>): T | undefined {
  const raw = readSetting(db, key);
  if (raw === undefined) return undefined;
  try {
    const parsed = shape.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// ceiling: a view is a few CLI calls; an open Settings tab and agents reading it together
// share one answer for this long.
const cacheMs = 5_000;

export function createRemoteAccessService(deps: RemoteAccessDeps): RemoteAccessService {
  const saved = (): Saved =>
    readJson(deps.db, remoteAccessKey, savedShape) ?? {
      enabled: false,
      httpsPort: defaultHttpsPort,
    };
  let applied: Applied | undefined = readJson(deps.db, remoteAccessAppliedKey, appliedShape);
  const record = (next: Applied | undefined): void => {
    applied = next;
    if (next === undefined) deleteSetting(deps.db, remoteAccessAppliedKey);
    else writeSetting(deps.db, remoteAccessAppliedKey, JSON.stringify(next));
  };

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

  type Ready = { readonly machine: Machine; readonly serve: ServeStatus };
  const diagnose = async (): Promise<Ready | Problem> => {
    const status = await deps.run(tailscaleCommands.status());
    // `status --json` exits 1 while signed out but still prints the state.
    const machine =
      status.stdout.trim().startsWith("{") && !status.missing
        ? machineOf(status.stdout)
        : problemOf(status, deps.platform);
    if (isProblem(machine)) return machine;
    const serveStatus = await deps.run(tailscaleCommands.serveStatus());
    if (serveStatus.code !== 0) return problemOf(serveStatus, deps.platform);
    const serve = parseServeStatus(serveStatus.stdout);
    if (serve === undefined)
      return {
        state: "failed",
        summary: "Slopify couldn't read tailscale serve status --json.",
        fix: "Update Tailscale to a current version (tailscale.com/download), then press Check again.",
        link: "https://tailscale.com/download",
      };
    return { machine, serve };
  };
  const ready = (value: Ready | Problem): value is Ready => !("state" in value);

  // Removes the handler Slopify added, only while it is still exactly that.
  const removeOurs = async (now: Ready): Promise<Problem | undefined> => {
    const ours = applied;
    if (ours === undefined) return undefined;
    if (ours.dnsName === now.machine.dnsName) {
      const use = portUse(now.serve, ours.dnsName, ours.httpsPort);
      if (use.kind === "proxy" && sameTarget(use.target, ours.target)) {
        const off = await deps.run(tailscaleCommands.serveOff(ours.httpsPort));
        if (off.code !== 0) return problemOf(off, deps.platform);
      } else if (use.kind !== "free")
        deps.log.write("info", "remote-access.left", {
          detail: `port ${ours.httpsPort} was changed outside Slopify, so it is left as it is`,
        });
    }
    record(undefined);
    return undefined;
  };

  const onView = (dnsName: string, httpsPort: number): RemoteAccessView =>
    base(
      "on",
      "On: open this address on any device signed in to your tailnet. Only your tailnet can reach it; it is never on the public internet.",
      { address: addressOf(dnsName, httpsPort) },
    );

  const apply = async (): Promise<RemoteAccessView> => {
    const want = saved();
    const target = loopbackTarget();
    let now = await diagnose();
    if (!ready(now)) return fromProblem(now);
    const ours = applied;
    if (
      ours !== undefined &&
      (ours.httpsPort !== want.httpsPort ||
        !sameTarget(ours.target, target) ||
        ours.dnsName !== now.machine.dnsName)
    ) {
      const removed = await removeOurs(now);
      if (removed !== undefined) return fromProblem(removed);
      now = await diagnose();
      if (!ready(now)) return fromProblem(now);
    }
    const { dnsName } = now.machine;
    const use = portUse(now.serve, dnsName, want.httpsPort);
    const mine =
      applied !== undefined && use.kind === "proxy" && sameTarget(use.target, applied.target);
    if (!mine && use.kind !== "free")
      return fromProblem(
        portTakenProblem(want.httpsPort, use, target, freePort(now.serve, dnsName, want.httpsPort)),
        { suggestedPort: freePort(now.serve, dnsName, want.httpsPort) },
      );
    if (!mine) {
      const on = await deps.run(tailscaleCommands.serveOn(want.httpsPort, target));
      if (on.code !== 0) return fromProblem(serveRefusedProblem(on, deps.platform));
      record({ dnsName, httpsPort: want.httpsPort, target });
    }
    const after = await diagnose();
    if (!ready(after)) return fromProblem(after);
    const check = portUse(after.serve, dnsName, want.httpsPort);
    if (check.kind !== "proxy" || !sameTarget(check.target, target))
      return base(
        "not-applied",
        "Tailscale accepted the command, but Slopify's address isn't in its serve settings.",
        {
          fix: "Run tailscale serve status in a terminal to see what Tailscale has, then press Check again.",
        },
      );
    if (check.funnel) {
      await removeOurs(after);
      return fromProblem(funnelProblem(want.httpsPort));
    }
    return onView(dnsName, want.httpsPort);
  };

  // A read: what is true now, without changing Tailscale.
  const read = async (): Promise<RemoteAccessView> => {
    if (deps.container) return dockerView();
    const want = saved();
    if (!want.enabled) return offView();
    const now = await diagnose();
    if (!ready(now)) return fromProblem(now);
    const { dnsName } = now.machine;
    const use = portUse(now.serve, dnsName, want.httpsPort);
    if (
      applied !== undefined &&
      applied.httpsPort === want.httpsPort &&
      use.kind === "proxy" &&
      sameTarget(use.target, applied.target)
    )
      return use.funnel
        ? fromProblem(funnelProblem(want.httpsPort))
        : onView(dnsName, want.httpsPort);
    if (use.kind !== "free") {
      const suggested = freePort(now.serve, dnsName, want.httpsPort);
      return fromProblem(portTakenProblem(want.httpsPort, use, loopbackTarget(), suggested), {
        suggestedPort: suggested,
      });
    }
    return base(
      "not-applied",
      "The switch is on, but Slopify's address isn't in Tailscale right now.",
      {
        fix: "Press Check again to set it up again.",
      },
    );
  };

  // One change to Tailscale at a time.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work, work);
    queue = next.catch(() => undefined);
    return next;
  };
  let cached: { readonly at: number; readonly view: Promise<RemoteAccessView> } | undefined;
  const fresh = (view: Promise<RemoteAccessView>): Promise<RemoteAccessView> => {
    cached = { at: deps.now(), view };
    view.catch(() => {
      cached = undefined;
    });
    return view;
  };

  const turnOff = async (): Promise<RemoteAccessView> => {
    if (applied === undefined) return offView();
    const now = await diagnose();
    const problem = ready(now) ? await removeOurs(now) : now;
    if (problem === undefined) return offView();
    const port = applied?.httpsPort ?? saved().httpsPort;
    return fromProblem(problem, {
      state: problem.state,
      summary: `The switch is off, but Slopify couldn't remove its address from Tailscale yet: ${problem.summary} Slopify tries again at every start.`,
      fix: `${problem.fix} Or remove it yourself with tailscale serve --https=${port} off.`,
    });
  };

  return {
    view: () => {
      if (cached !== undefined && deps.now() - cached.at < cacheMs) return cached.view;
      return fresh(serial(read));
    },
    set: (enabled, httpsPort) =>
      fresh(
        serial(async () => {
          if (deps.container) return dockerView();
          writeSetting(
            deps.db,
            remoteAccessKey,
            JSON.stringify({ enabled, httpsPort: httpsPort ?? saved().httpsPort }),
          );
          return enabled ? apply() : turnOff();
        }),
      ),
    start: () =>
      serial(async () => {
        cached = undefined;
        if (deps.container) return;
        const view = saved().enabled ? await apply() : await turnOff();
        if (view.state !== "on" && view.state !== "off")
          deps.log.write("warn", "remote-access.start", {
            detail: `${view.summary} ${view.fix ?? ""}`,
          });
      }),
    stop: () =>
      serial(async () => {
        cached = undefined;
        if (deps.container || applied === undefined) return;
        const now = await diagnose();
        const problem = ready(now) ? await removeOurs(now) : now;
        if (problem !== undefined)
          deps.log.write("warn", "remote-access.stop", { detail: problem.summary });
      }),
    remoteHost: () =>
      applied === undefined
        ? undefined
        : applied.httpsPort === 443
          ? applied.dnsName
          : `${applied.dnsName}:${applied.httpsPort}`,
  };
}
