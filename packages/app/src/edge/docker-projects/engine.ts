import { lstat, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type { HostSetupRunner } from "../../host-cli/install.js";
import {
  type Container,
  containerSchema,
  type DockerConfig,
  digestSchema,
  type Journal,
} from "./state.js";
import { contains, type Digest } from "./tree.js";

export interface Engine {
  context(uid: number, gid: number): Promise<{ daemon: string; user: string }>;
  image(ref: string): Promise<string>;
  version(image: string): Promise<string>;
  inspect(name: string): Promise<Container | null>;
  // `spared` names containers that may keep the volume mounted: rollbacks this installation
  // retained itself.
  claims(
    volume: string,
    permitted: readonly string[],
    spared?: (container: Container) => boolean,
  ): Promise<void>;
  writers(volume: string, paths: readonly string[], permitted: readonly string[]): Promise<void>;
  probe(c: DockerConfig, image: string, user: string, destination: string): Promise<void>;
  ensureVolume(volume: string): Promise<void>;
  volume(name: string): Promise<string | null>;
  projects(image: string, volume: string, bind: string | null): Promise<Digest | null>;
  copy(
    image: string,
    volume: string,
    bind: string | null,
    destination: string,
    id: string,
  ): Promise<void>;
  snapshot(j: Journal): Promise<Digest>;
  restore(j: Journal): Promise<void>;
  own(j: Journal): Promise<void>;
  stop(c: Container): Promise<void>;
  restart(c: Container): Promise<void>;
  start(c: DockerConfig, j: Journal, transactionDirectory: string): Promise<string>;
  health(id: string, token: string, expectedVersion: string): Promise<void>;
  command(args: readonly string[]): Promise<string>;
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
    return "The port Slopify wants is already in use by another program. Stop that program, or start Slopify on another port: npx @gentbajko/slopify --docker --port 7070";
  if (/no space left on device/i.test(detail))
    return "The disk Docker uses is full. Free up space (for example docker system prune) and try again.";
  const last = detail.split("\n").at(-1)?.trim().slice(0, 300);
  return `Docker command "docker ${args[0] ?? ""}" failed (exit code ${result.code}${last ? `: ${last}` : ""}). Check that Docker works (docker info) and run the launcher again. Nothing was deleted, and any backup Slopify made is kept.`;
}
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
    `type=${type},source=${source},target=${target}${readonly ? ",readonly" : ""}${type === "volume" ? ",volume-nocopy" : ""}`,
  ];
  const source = (volume: string, bind: string | null) => [
    ...mount("volume", volume, "/source", true),
    ...(bind === null ? [] : mount("bind", bind, "/source/projects", true)),
  ];
  const helper = async (image: string, args: readonly string[], operation: string, user = "0:0") =>
    JSON.parse(
      await command([
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--user",
        operation === "probe" ? user : "0:0",
        ...(args.some((a) => a.includes("target=/data,")) ? [] : ["--tmpfs", "/data"]),
        ...args,
        "--entrypoint",
        "node",
        image,
        "/opt/slopify/packages/app/dist/edge/docker-projects/volume.js",
        operation,
        user,
      ]),
    );
  async function inspect(name: string): Promise<Container | null> {
    const present = await run([
      "container",
      "ls",
      "-a",
      "--filter",
      `name=^/${name}$`,
      "--format",
      "{{.ID}}",
    ]);
    if (present.code !== 0) throw new Error(dockerFailure(["container", "ls"], present));
    if (!present.stdout.trim() && !/^[a-f0-9]{12,64}$/.test(name)) return null;
    const result = await run(["inspect", name]);
    if (result.code !== 0) {
      if (!present.stdout.trim()) return null;
      throw new Error(dockerFailure(["inspect", name], result));
    }
    const schema = z.array(
      z.object({
        Id: z.string(),
        Name: z.string(),
        Image: z.string(),
        Config: z.object({ User: z.string(), Labels: z.record(z.string(), z.string()).nullable() }),
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
            RW: z.boolean(),
          }),
        ),
        NetworkSettings: z.object({
          Ports: z.record(
            z.string(),
            z.array(z.object({ HostIp: z.string(), HostPort: z.string() })).nullable(),
          ),
        }),
      }),
    );
    const raw = schema.parse(JSON.parse(result.stdout))[0];
    if (!raw) throw new Error("Missing inspected container.");
    const port = raw.NetworkSettings.Ports["6969/tcp"]?.[0];
    return containerSchema.parse({
      id: raw.Id,
      name: raw.Name.replace(/^\//, ""),
      image: raw.Image,
      user: raw.Config.User,
      running: raw.State.Running,
      restart: raw.HostConfig.RestartPolicy,
      signature: raw.Config.Labels?.["io.slopify.launcher"] ?? null,
      installation: raw.Config.Labels?.["io.slopify.installation"] ?? null,
      mounts: raw.Mounts.map((m) => ({
        type: m.Type,
        name: m.Name ?? "",
        source: m.Source,
        destination: m.Destination,
        rw: m.RW,
      })),
      port: port ? `${port.HostIp}:${port.HostPort}` : null,
    });
  }
  async function claims(
    volume: string,
    permitted: readonly string[],
    spared: (container: Container) => boolean = () => false,
  ): Promise<void> {
    const ids = (await command(["container", "ls", "-a", "-q"])).split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const c = await inspect(id);
      if (!c)
        throw new Error(
          "Cannot verify volume claims: a Docker container disappeared while Slopify was checking. Run the launcher again.",
        );
      if (
        !permitted.includes(c.id) &&
        !spared(c) &&
        c.mounts.some((m) => m.type === "volume" && m.name === volume)
      )
        throw new Error(
          `The Docker volume ${volume} that holds Slopify's data is also used by the container ${c.name}. Remove that container if you no longer need it (docker rm ${c.name}), or give this Slopify its own volume with SLOPIFY_DOCKER_VOLUME=<name>, then try again.`,
        );
    }
  }
  async function writers(
    volume: string,
    paths: readonly string[],
    permitted: readonly string[],
  ): Promise<void> {
    const ids = (await command(["container", "ls", "-q"])).split(/\s+/).filter(Boolean);
    for (const id of ids) {
      const c = await inspect(id);
      if (!c || permitted.includes(c.id)) continue;
      if (
        c.mounts.some(
          (m) =>
            m.rw &&
            (m.name === volume ||
              (m.type === "bind" &&
                paths.some((p) => contains(p, m.source) || contains(m.source, p)))),
        )
      )
        throw new Error(
          `Another running container (${c.name}) is writing to Slopify's data or project folder. Stop it (docker stop ${c.name}) and try again.`,
        );
    }
  }
  async function recoveryLabel(j: Journal): Promise<void> {
    const label = await command([
      "volume",
      "inspect",
      "--format",
      '{{index .Labels "io.slopify.transaction"}}',
      j.backup,
    ]);
    if (label !== j.id) throw new Error("Recovery volume identity conflict.");
  }
  return {
    command,
    inspect,
    claims,
    writers,
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
          `The --docker launcher only works with Docker running on this machine, not a remote Docker (${endpoint ?? "unknown endpoint"}). Switch to the local one (unset DOCKER_HOST, or docker context use default) and try again.`,
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
          "Docker Desktop isn't supported by the --docker launcher because it can't give your project folder the right owner. Use Docker Engine on Linux (docker context use default), or run Slopify without Docker: npx @gentbajko/slopify",
        );
      const rootless = info.SecurityOptions.includes("name=rootless");
      if (!rootless && info.SecurityOptions.some((s) => s.startsWith("name=userns")))
        throw new Error(
          "Your Docker uses userns-remap, which the --docker launcher doesn't support. Use rootless Docker or a standard Docker Engine setup, or run Slopify without Docker: npx @gentbajko/slopify. Don't turn off Docker's isolation to get around this.",
        );
      return { daemon: info.ID, user: rootless ? "0:0" : `${uid}:${gid}` };
    },
    image: async (ref) => {
      if (ref === "ghcr.io/gentbajko/slopify:latest") {
        await command(["pull", ref]);
        return command(["image", "inspect", "--format", "{{.Id}}", ref]);
      }
      const found = await run(["image", "inspect", "--format", "{{.Id}}", ref]);
      if (found.code !== 0) await command(["pull", ref]);
      return command(["image", "inspect", "--format", "{{.Id}}", ref]);
    },
    version: async (image) =>
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
            image,
            "-p",
            "require('/opt/slopify/packages/app/package.json').version",
          ]),
        ),
    ensureVolume: async (volume) => {
      await command(["volume", "create", volume]);
    },
    volume: async (name) => {
      const names = (await command(["volume", "ls", "--format", "{{.Name}}"])).split(/\s+/);
      if (!names.includes(name)) return null;
      const v = z
        .object({
          Name: z.string(),
          CreatedAt: z.string(),
          Driver: z.literal("local"),
          Scope: z.literal("local"),
          Options: z.record(z.string(), z.string()).nullable(),
        })
        .parse(JSON.parse(await command(["volume", "inspect", "--format", "{{json .}}", name])));
      if (v.Name !== name || (v.Options && Object.keys(v.Options).length > 0))
        throw new Error(
          `The Docker volume ${name} uses a custom driver or options, which Slopify doesn't support. Give Slopify a plain local volume with SLOPIFY_DOCKER_VOLUME=<new name> and try again.`,
        );
      return JSON.stringify([v.Name, v.CreatedAt, v.Driver]);
    },
    probe: async (c, image, user, destination) => {
      const probe = await mkdtemp(join(dirname(destination), ".slopify-probe-"));
      try {
        await writeFile(join(probe, "host"), "host", { mode: 0o600 });
        await helper(image, mount("bind", probe, "/probe"), "probe", user);
        const s = await lstat(join(probe, "container"));
        if (
          !s.isFile() ||
          s.uid !== c.uid ||
          s.gid !== c.gid ||
          (s.mode & 0o077) !== 0 ||
          (await readFile(join(probe, "container"), "utf8")) !== "slopify ownership probe"
        )
          throw new Error(
            "Docker can't create files in your project folder as your user, so the files would end up with the wrong owner. Use a standard Docker Engine or rootless Docker setup, or run Slopify without Docker: npx @gentbajko/slopify",
          );
        await writeFile(join(probe, "container"), "host can write", { flag: "a" });
      } finally {
        await rm(probe, { recursive: true, force: true });
      }
    },
    projects: async (image, volume, bind) => {
      const value = z
        .discriminatedUnion("exists", [
          z.object({ exists: z.literal(false) }),
          z.object({ exists: z.literal(true), digest: digestSchema }),
        ])
        .parse(await helper(image, source(volume, bind), "projects"));
      return value.exists ? value.digest : null;
    },
    copy: async (image, volume, bind, destination, id) => {
      const name = `slopify-reader-${id}`;
      const reader = await command([
        "create",
        "--name",
        name,
        "--label",
        `io.slopify.reader=${id}`,
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/data",
        ...source(volume, bind),
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
    snapshot: async (j) => {
      const all = (await command(["volume", "ls", "--format", "{{.Name}}"])).split(/\s+/);
      if (all.includes(j.backup))
        throw new Error("Recovery volume already exists; reconcile the journal before retrying.");
      await command(["volume", "create", "--label", `io.slopify.transaction=${j.id}`, j.backup]);
      return digestSchema.parse(
        await helper(
          j.image,
          [...source(j.volume, null), ...mount("volume", j.backup, "/backup")],
          "snapshot",
        ),
      );
    },
    restore: async (j) => {
      if (!j.backupDigest)
        throw new Error("No verified private snapshot; automatic restore is unsafe.");
      await recoveryLabel(j);
      const found = digestSchema.parse(await helper(j.image, source(j.backup, null), "private"));
      if (found.hash !== j.backupDigest.hash)
        throw new Error("Recovery snapshot changed; automatic restore refused.");
      const result = digestSchema.parse(
        await helper(
          j.image,
          [...source(j.backup, null), ...mount("volume", j.volume, "/data")],
          "restore",
        ),
      );
      if (result.hash !== j.backupDigest.hash)
        throw new Error("Restored private data differs from its snapshot.");
    },
    own: async (j) => {
      await helper(j.image, mount("volume", j.volume, "/data"), "own", j.user);
    },
    stop: async (c) => {
      await command(["update", "--restart=no", c.id]);
      await command(["stop", c.id]);
    },
    restart: async (c) => {
      const current = await inspect(c.id);
      if (!current)
        throw new Error("Previous container is missing; use the retained recovery volume.");
      if (current.name !== c.name) await command(["rename", c.id, c.name]);
      const restart =
        c.restart.Name === "on-failure" && c.restart.MaximumRetryCount > 0
          ? `on-failure:${c.restart.MaximumRetryCount}`
          : c.restart.Name;
      await command(["update", `--restart=${restart}`, c.id]);
      if (c.running) await command(["start", c.id]);
    },
    start: async (c, j, transactionDirectory) => {
      const port = c.port === 0 ? "" : String(c.port);
      return command([
        "run",
        "-d",
        "--name",
        c.name,
        "--restart",
        "no",
        "--user",
        j.user,
        "--label",
        `io.slopify.launcher=${j.signature}`,
        "--label",
        `io.slopify.installation=${j.installation}`,
        "--label",
        `io.slopify.transaction=${j.id}`,
        "-p",
        `127.0.0.1:${port}:6969`,
        ...mount("volume", c.volume, "/data"),
        ...mount("bind", j.destination, "/data/projects"),
        ...mount("bind", transactionDirectory, "/opt/slopify-install", true),
        ...(c.bridge
          ? [
              ...mount("bind", c.bridge, "/opt/slopify-host", true),
              "--env",
              "SLOPIFY_HOST_CLI_DIR=/opt/slopify-host",
            ]
          : []),
        "--env",
        `SLOPIFY_DOCKER_PROJECTS_DIR=${j.destination}`,
        "--env",
        "SLOPIFY_DOCKER_INSTALL_STATE=/opt/slopify-install/activation.json",
        "--env",
        `SLOPIFY_UPDATE_TOKEN=${j.token}`,
        "--env",
        "SLOPIFY_UPDATE_PENDING=1",
        j.image,
      ]);
    },
    health: async (id, token, expectedVersion) => {
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        const remaining = deadline - Date.now();
        const probe = AbortSignal.any([
          signal,
          AbortSignal.timeout(Math.max(1, Math.min(2000, remaining))),
        ]);
        try {
          const result = await run(
            [
              "exec",
              id,
              "node",
              "-e",
              "const [token,expected]=process.argv.slice(1); Promise.all([fetch('http://127.0.0.1:6969/api/health'),fetch('http://127.0.0.1:6969/api/update/ready',{headers:{'X-Slopify-Update-Token':token}})]).then(async rs=>{for(const r of rs){const b=await r.json();if(!r.ok||b.status!=='ok'||b.version!==expected)process.exit(1)}}).catch(()=>process.exit(1))",
              token,
              expectedVersion,
            ],
            probe,
          );
          if (result.code === 0) {
            const running = await run(["inspect", "--format", "{{.State.Running}}", id], probe);
            if (running.code === 0 && running.stdout.trim() === "true") return;
          }
        } catch (error) {
          if (signal.aborted || !probe.aborted) throw error;
        }
        await delay(Math.min(250, Math.max(0, deadline - Date.now())), undefined, { signal });
      }
      throw new Error(
        `The new Slopify container did not start up within 2 minutes. See why with: docker logs ${id}`,
      );
    },
  };
}
