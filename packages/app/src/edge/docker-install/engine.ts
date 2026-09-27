import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { HostSetupRunner } from "../../host-cli/install.js";
import type { Digest } from "./tree.js";

/** One container as the installer needs to see it. */
export interface Container {
  readonly id: string;
  readonly name: string;
  readonly image: string;
  readonly user: string;
  readonly running: boolean;
  readonly restart: string;
  /** The compose project that owns it, or null for a container made with docker run. */
  readonly project: string | null;
  readonly launcher: boolean;
  readonly mounts: readonly {
    readonly type: string;
    readonly name: string;
    readonly source: string;
    readonly destination: string;
  }[];
  readonly port: number | null;
}
export interface RecoveryVolume {
  readonly name: string;
  readonly transaction: string | null;
  readonly container: string | null;
}
/** Everything the installer asks Docker to do; tests replace it with a fake. */
export interface Engine {
  context(uid: number, gid: number): Promise<{ daemon: string; user: string }>;
  image(ref: string): Promise<void>;
  imageVersion(ref: string): Promise<string>;
  inspect(name: string): Promise<Container | null>;
  /** Stopped containers the 2.5.0 launcher kept as `<name>-previous-<uuid>`. */
  legacyPrevious(name: string): Promise<readonly Container[]>;
  volumeExists(name: string): Promise<boolean>;
  createVolume(name: string): Promise<void>;
  /** Digest of project files kept inside the data volume (plain docker run installs), or null. */
  volumeProjects(image: string, volume: string): Promise<Digest | null>;
  copyVolumeProjects(image: string, volume: string, destination: string, id: string): Promise<void>;
  snapshot(
    image: string,
    volume: string,
    backup: string,
    labels: Readonly<Record<string, string>>,
  ): Promise<Digest>;
  restore(image: string, backup: string, volume: string, expected: Digest): Promise<void>;
  own(image: string, volume: string, user: string): Promise<void>;
  recoveryVolumes(volume: string): Promise<readonly RecoveryVolume[]>;
  removeVolume(name: string): Promise<void>;
  removeContainer(id: string): Promise<void>;
  stop(id: string): Promise<void>;
  start(id: string): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  restartPolicy(id: string, policy: string): Promise<void>;
  /** Runs `docker compose` for the installation folder (compose.yaml and .env). */
  compose(directory: string, name: string, args: readonly string[]): Promise<void>;
  /**
   * Waits until the container answers. With a token it must be the candidate holding it and
   * report `version`; without one any healthy answer counts (used when putting the old one back).
   */
  ready(id: string, check: { token: string; version: string } | null): Promise<void>;
  /** The app's update gate: true while projects are generating, null when it doesn't answer. */
  busy(id: string): Promise<boolean | null>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The id a recovery volume of `volume` carries in its name, or null for any other volume. */
export function recoveryId(volume: string, name: string): string | null {
  const prefix = `${volume}-recovery-`;
  if (!name.startsWith(prefix)) return null;
  const id = name.slice(prefix.length);
  return uuid.test(id) ? id : null;
}

// Docker's exit code alone says nothing, so its last error line decides the advice: the daemon
// being stopped and the socket being off-limits are by far the most common first-run failures.
export function dockerFailure(
  args: readonly string[],
  result: { code: number; stderr?: string },
): string {
  const detail = (result.stderr ?? "").trim();
  if (/permission denied[^\n]*docker\.sock|docker\.sock[^\n]*permission denied/i.test(detail))
    return "Your user isn't allowed to use Docker. Give it access with sudo usermod -aG docker $USER, then log out and back in (or run newgrp docker) and try again.";
  if (
    /cannot connect to the docker daemon|is the docker daemon running|error during connect/i.test(
      detail,
    )
  )
    return "Docker is installed but not running. Start it (sudo systemctl start docker, or systemctl --user start docker for rootless Docker) and try again.";
  if (/port is already allocated|address already in use/i.test(detail))
    return "The port Slopify wants is already in use by another program. Stop that program, or install on another port: npx @gentbajko/slopify --docker --port 7070";
  if (/no space left on device/i.test(detail))
    return "The disk Docker uses is full. Free up space (for example docker system prune) and try again.";
  if (args[0] === "compose" && /is not a docker command|unknown command/i.test(detail))
    return "Docker Compose isn't installed. Install the Docker Compose plugin (for example sudo apt install docker-compose-plugin, or sudo pacman -S docker-compose), check that docker compose version works, and try again.";
  const last = detail.split("\n").at(-1)?.trim().slice(0, 300);
  return `Docker command "docker ${args[0] ?? ""}" failed (exit code ${result.code}${last ? `: ${last}` : ""}). Check that Docker works (docker info) and run the command again.`;
}

const helperEntry = "/opt/slopify/packages/app/dist/edge/docker-install/volume.js";
const inspectSchema = z.array(
  z.object({
    Id: z.string(),
    Name: z.string(),
    Config: z.object({
      Image: z.string(),
      User: z.string(),
      Labels: z.record(z.string(), z.string()).nullable(),
    }),
    State: z.object({ Running: z.boolean() }),
    HostConfig: z.object({
      RestartPolicy: z.object({ Name: z.string(), MaximumRetryCount: z.number() }),
    }),
    Mounts: z.array(
      z.object({
        Type: z.string(),
        Name: z.string().optional(),
        Source: z.string(),
        Destination: z.string(),
      }),
    ),
    NetworkSettings: z.object({
      Ports: z
        .record(
          z.string(),
          z.array(z.object({ HostIp: z.string(), HostPort: z.string() })).nullable(),
        )
        .nullable(),
    }),
  }),
);

export function dockerEngine(
  runner: HostSetupRunner,
  signal: AbortSignal,
  env: Readonly<NodeJS.ProcessEnv>,
): Engine {
  const run = (args: readonly string[], localSignal = signal) =>
    runner.exec("docker", args, localSignal);
  async function command(args: readonly string[], localSignal = signal): Promise<string> {
    const r = await run(args, localSignal);
    if (r.code !== 0) throw new Error(dockerFailure(args, r));
    return r.stdout.trim();
  }
  const mount = (type: string, source: string, target: string, readonly = false) => [
    "--mount",
    `type=${type},source=${source},target=${target}${readonly ? ",readonly" : ""}`,
  ];
  // Fixed file operations inside the image being installed, as root, without network.
  const helper = async (image: string, args: readonly string[], operation: string, user = "0:0") =>
    JSON.parse(
      await command([
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--user",
        "0:0",
        ...(args.some((a) => a.includes("target=/data")) ? [] : ["--tmpfs", "/data"]),
        ...args,
        "--entrypoint",
        "node",
        image,
        helperEntry,
        operation,
        user,
      ]),
    );
  async function inspect(name: string): Promise<Container | null> {
    const result = await run(["container", "inspect", name]);
    if (result.code !== 0) {
      if (/no such (container|object)/i.test(result.stderr ?? "")) return null;
      throw new Error(dockerFailure(["container", "inspect"], result));
    }
    const raw = inspectSchema.parse(JSON.parse(result.stdout))[0];
    if (!raw) return null;
    const binding = raw.NetworkSettings.Ports?.["6969/tcp"]?.[0];
    const restart = raw.HostConfig.RestartPolicy;
    return {
      id: raw.Id,
      name: raw.Name.replace(/^\//, ""),
      image: raw.Config.Image,
      user: raw.Config.User,
      running: raw.State.Running,
      restart:
        restart.Name === "on-failure" && restart.MaximumRetryCount > 0
          ? `on-failure:${restart.MaximumRetryCount}`
          : restart.Name || "no",
      project: raw.Config.Labels?.["com.docker.compose.project"] ?? null,
      launcher: raw.Config.Labels?.["io.slopify.launcher"] !== undefined,
      mounts: raw.Mounts.map((m) => ({
        type: m.Type,
        name: m.Name ?? "",
        source: m.Source,
        destination: m.Destination,
      })),
      port: binding ? Number(binding.HostPort) : null,
    };
  }
  return {
    context: async (uid, gid) => {
      let endpoint = env.DOCKER_HOST;
      if (env.DOCKER_CONTEXT || !endpoint) {
        const raw = JSON.parse(
          await command([
            "context",
            "inspect",
            ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : []),
          ]),
        );
        endpoint = z
          .array(z.object({ Endpoints: z.object({ docker: z.object({ Host: z.string() }) }) }))
          .parse(raw)[0]?.Endpoints.docker.Host;
      }
      if (!endpoint?.startsWith("unix://"))
        throw new Error(
          `The --docker install only works with Docker running on this machine, not a remote Docker (${endpoint ?? "unknown endpoint"}). Switch to the local one (unset DOCKER_HOST, or docker context use default) and try again.`,
        );
      const rawInfo: unknown = JSON.parse(await command(["info", "--format", "{{json .}}"]));
      // Some Docker versions print the daemon's absence inside the JSON instead of failing.
      const serverErrors = z.object({ ServerErrors: z.array(z.string()) }).safeParse(rawInfo)
        .data?.ServerErrors;
      if (serverErrors !== undefined && serverErrors.length > 0)
        throw new Error(dockerFailure(["info"], { code: 1, stderr: serverErrors.join("\n") }));
      const info = z
        .object({
          ID: z.string(),
          OSType: z.literal("linux"),
          OperatingSystem: z.string(),
          SecurityOptions: z.array(z.string()),
        })
        .parse(rawInfo);
      if (/docker desktop/i.test(info.OperatingSystem))
        throw new Error(
          "Docker Desktop isn't supported by the --docker install because it can't give your project folder the right owner. Use Docker Engine on Linux (docker context use default), or run Slopify without Docker: npx @gentbajko/slopify",
        );
      const rootless = info.SecurityOptions.includes("name=rootless");
      if (!rootless && info.SecurityOptions.some((s) => s.startsWith("name=userns")))
        throw new Error(
          "Your Docker uses userns-remap, which the --docker install doesn't support. Use rootless Docker or a standard Docker Engine setup, or run Slopify without Docker: npx @gentbajko/slopify. Don't turn off Docker's isolation to get around this.",
        );
      await command(["compose", "version", "--short"]);
      return { daemon: info.ID, user: rootless ? "0:0" : `${uid}:${gid}` };
    },
    image: async (ref) => {
      const found = await run(["image", "inspect", "--format", "{{.Id}}", ref]);
      if (found.code !== 0 || ref.endsWith(":latest")) {
        const pulled = await run(["pull", ref]);
        if (pulled.code !== 0)
          throw new Error(
            `Could not download the Slopify Docker image ${ref}. Check your internet connection and that Docker is running (docker info), then try again. Nothing was changed. ${dockerFailure(["pull"], pulled)}`,
          );
      }
    },
    imageVersion: async (ref) =>
      z
        .string()
        .regex(/^\d+\.\d+\.\d+$/)
        .parse(
          await command([
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--tmpfs",
            "/data",
            "--entrypoint",
            "node",
            ref,
            "-p",
            "require('/opt/slopify/packages/app/package.json').version",
          ]),
        ),
    inspect,
    legacyPrevious: async (name) => {
      const ids = (
        await command([
          "container",
          "ls",
          "-a",
          "--filter",
          `name=^/${name}-previous-`,
          "--format",
          "{{.ID}}",
        ])
      )
        .split(/\s+/)
        .filter(Boolean);
      const found: Container[] = [];
      for (const id of ids) {
        const c = await inspect(id);
        if (c && recoveryLikeName(name, c.name)) found.push(c);
      }
      return found;
    },
    volumeExists: async (name) =>
      (await command(["volume", "ls", "--format", "{{.Name}}"])).split(/\s+/).includes(name),
    createVolume: async (name) => {
      await command(["volume", "create", name]);
    },
    volumeProjects: async (image, volume) => {
      const value = z
        .discriminatedUnion("exists", [
          z.object({ exists: z.literal(false) }),
          z.object({
            exists: z.literal(true),
            digest: z.object({ hash: z.string(), files: z.number(), bytes: z.number() }),
          }),
        ])
        .parse(await helper(image, mount("volume", volume, "/source", true), "projects"));
      return value.exists ? value.digest : null;
    },
    copyVolumeProjects: async (image, volume, destination, id) => {
      const reader = await command([
        "create",
        "--name",
        `slopify-reader-${id}`,
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/data",
        ...mount("volume", volume, "/source", true),
        "--entrypoint",
        "true",
        image,
      ]);
      try {
        await command(["cp", `${reader}:/source/projects/.`, destination]);
      } finally {
        await command(["rm", reader], AbortSignal.timeout(10_000));
      }
    },
    snapshot: async (image, volume, backup, labels) => {
      await command([
        "volume",
        "create",
        ...Object.entries(labels).flatMap(([key, value]) => ["--label", `${key}=${value}`]),
        backup,
      ]);
      return helper(
        image,
        [...mount("volume", volume, "/source", true), ...mount("volume", backup, "/backup")],
        "snapshot",
      );
    },
    restore: async (image, backup, volume, expected) => {
      const found = await helper(image, mount("volume", backup, "/source", true), "private");
      if (found.hash !== expected.hash)
        throw new Error(
          `The recovery volume ${backup} changed after it was made, so Slopify did not copy it back.`,
        );
      const restored = await helper(
        image,
        [...mount("volume", backup, "/source", true), ...mount("volume", volume, "/data")],
        "restore",
      );
      if (restored.hash !== expected.hash)
        throw new Error(`The data copied back from ${backup} differs from the recovery volume.`);
    },
    own: async (image, volume, user) => {
      await helper(image, mount("volume", volume, "/data"), "own", user);
    },
    recoveryVolumes: async (volume) => {
      const names = (
        await command([
          "volume",
          "ls",
          "--filter",
          "label=io.slopify.transaction",
          "--format",
          "{{.Name}}",
        ])
      )
        .split(/\s+/)
        .filter((name) => recoveryId(volume, name) !== null);
      const found: RecoveryVolume[] = [];
      for (const name of names) {
        const labels = z
          .record(z.string(), z.string())
          .nullable()
          .parse(
            JSON.parse(await command(["volume", "inspect", "--format", "{{json .Labels}}", name])),
          );
        found.push({
          name,
          transaction: labels?.["io.slopify.transaction"] ?? null,
          container: labels?.["io.slopify.container"] ?? null,
        });
      }
      return found;
    },
    // Never forced: Docker refuses a volume a container still mounts, and that refusal stands.
    removeVolume: async (name) => {
      await command(["volume", "rm", name]);
    },
    removeContainer: async (id) => {
      await command(["rm", "-f", id]);
    },
    stop: async (id) => {
      await command(["stop", id]);
    },
    start: async (id) => {
      await command(["start", id]);
    },
    rename: async (id, name) => {
      await command(["rename", id, name]);
    },
    restartPolicy: async (id, policy) => {
      await command(["update", `--restart=${policy}`, id]);
    },
    compose: async (directory, name, args) => {
      await command([
        "compose",
        "--project-directory",
        directory,
        "--file",
        join(directory, "compose.yaml"),
        "--env-file",
        join(directory, ".env"),
        "--project-name",
        name,
        ...args,
      ]);
    },
    ready: async (id, check) => {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        const probe = AbortSignal.any([
          signal,
          AbortSignal.timeout(Math.max(1, Math.min(3000, deadline - Date.now()))),
        ]);
        try {
          const result = await run(
            [
              "exec",
              id,
              "node",
              "-e",
              "const [token,expected]=process.argv.slice(1); const get=(p,h)=>fetch('http://127.0.0.1:6969'+p,{headers:h}).then(async r=>{const b=await r.json(); if(!r.ok||b.status!=='ok'||(expected&&b.version!==expected)) process.exit(1)}); Promise.all([get('/api/health',{}), ...(token?[get('/api/update/ready',{'X-Slopify-Update-Token':token})]:[])]).catch(()=>process.exit(1))",
              check?.token ?? "",
              check?.version ?? "",
            ],
            probe,
          );
          if (result.code === 0) return;
        } catch (error) {
          if (signal.aborted || !probe.aborted) throw error;
        }
        await delay(500, undefined, { signal });
      }
      throw new Error(
        `The Slopify container did not answer within 2 minutes. See why with: docker logs ${id}`,
      );
    },
    busy: async (id) => {
      const result = await run(
        [
          "exec",
          id,
          "node",
          "-e",
          "fetch('http://127.0.0.1:6969/api/update').then(r=>r.json()).then(b=>process.stdout.write(String(b.busy===true))).catch(()=>process.exit(1))",
        ],
        AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      ).catch(() => undefined);
      if (result === undefined || result.code !== 0) return null;
      return result.stdout.trim() === "true";
    },
  };
}

function recoveryLikeName(name: string, candidate: string): boolean {
  const prefix = `${name}-previous-`;
  return candidate.startsWith(prefix) && uuid.test(candidate.slice(prefix.length));
}
