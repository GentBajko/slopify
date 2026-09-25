import { cp, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readVersion } from "../../kernel/version.js";
import type { Engine } from "./engine.js";
import { type Container, dockerConfig, type Journal } from "./state.js";
import { isMissing, treeDigest } from "./tree.js";

export async function installationFixture(): Promise<{
  root: string;
  volume: string;
  config: ReturnType<typeof dockerConfig>;
  engine: Engine;
  calls: string[];
  containers: Map<string, Container>;
  failures: Set<string>;
  close: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "slopify-install-"));
  const volume = join(root, "volume");
  await mkdir(volume);
  const config = dockerConfig(
    { SLOPIFY_DOCKER_NAME: "fixture", SLOPIFY_DOCKER_VOLUME: "fixture-data" },
    root,
    root,
    process.getuid?.() ?? 1000,
    process.getgid?.() ?? 1000,
  );
  const calls: string[] = [];
  const failures = new Set<string>();
  const containers = new Map<string, Container>();
  let serial = 0;
  function point(name: string) {
    calls.push(name);
    if (failures.has(name)) throw new Error(`Fixture failure: ${name}`);
  }
  const source = (bind: string | null) => bind ?? join(volume, "projects");
  const find = (id: string) =>
    [...containers.values()].find((c) => c.id === id || c.name === id) ?? null;
  async function privateCopy(from: string, to: string) {
    for (const name of await readdir(to))
      if (name !== "projects") await rm(join(to, name), { recursive: true, force: true });
    for (const name of await readdir(from))
      if (name !== "projects")
        await cp(join(from, name), join(to, name), { recursive: true, preserveTimestamps: true });
  }
  const engine: Engine = {
    context: async () => {
      point("context");
      return { daemon: "fixture-daemon", user: `${config.uid}:${config.gid}` };
    },
    image: async () => {
      point("image");
      return "sha256:fixture-image";
    },
    version: async () => readVersion(),
    inspect: async (id) => find(id),
    claims: async (volumeName, permitted) => {
      point("claims");
      if (
        [...containers.values()].some(
          (c) =>
            !permitted.includes(c.id) &&
            c.mounts.some((m) => m.type === "volume" && m.name === volumeName),
        )
      )
        throw new Error("Named volume is claimed by another container.");
    },
    writers: async (_v, _paths, allowed) => {
      point("writers");
      if ([...containers.values()].some((c) => c.running && !allowed.includes(c.id)))
        throw new Error("Another running container writes installation storage");
    },
    probe: async () => {
      point("probe");
    },
    ensureVolume: async () => {
      point("volume");
    },
    volume: async (name) => `fixture-created:${name}`,
    projects: async (_image, _volume, bind) => {
      point("digest");
      return treeDigest(source(bind)).catch((e: unknown) => {
        if (isMissing(e)) return null;
        throw e;
      });
    },
    copy: async (_image, _volume, bind, destination) => {
      point("copy");
      for (const name of await readdir(source(bind)))
        await cp(join(source(bind), name), join(destination, name), {
          recursive: true,
          force: false,
          errorOnExist: true,
        });
    },
    snapshot: async (j) => {
      point("snapshot");
      const backup = join(root, j.backup);
      await cp(volume, backup, { recursive: true });
      return treeDigest(backup, true, true);
    },
    restore: async (j) => {
      point("restore");
      await privateCopy(join(root, j.backup), volume);
    },
    own: async () => {
      point("own");
    },
    stop: async (c) => {
      point("stop");
      containers.set(c.id, { ...c, running: false, restart: { Name: "no", MaximumRetryCount: 0 } });
    },
    restart: async (c) => {
      point("restart");
      containers.set(c.id, c);
    },
    start: async (c, j, transactionDirectory) => {
      point("start");
      const id = `candidate-${++serial}`;
      containers.set(id, {
        id,
        name: c.name,
        image: j.image,
        user: j.user,
        running: true,
        restart: { Name: "no", MaximumRetryCount: 0 },
        signature: j.signature,
        installation: j.installation,
        mounts: [
          { type: "volume", name: c.volume, source: volume, destination: "/data", rw: true },
          {
            type: "bind",
            name: "",
            source: j.destination,
            destination: "/data/projects",
            rw: true,
          },
          {
            type: "bind",
            name: "",
            source: transactionDirectory,
            destination: "/opt/slopify-install",
            rw: false,
          },
        ],
        port: "127.0.0.1:6969",
      });
      return id;
    },
    health: async () => {
      point("health");
    },
    command: async (args) => {
      point(args[0] ?? "command");
      const id = args.at(-1);
      const c = id ? find(id) : null;
      if (args[0] === "rename") {
        const old = args[1] ? find(args[1]) : null;
        const name = args[2];
        if (!old || !name) throw new Error("Missing fake rename target");
        containers.set(old.id, { ...old, name });
        return "";
      }
      if (args[0] === "update" && c) {
        containers.set(c.id, { ...c, restart: { Name: "always", MaximumRetryCount: 0 } });
        return "";
      }
      if (args[0] === "start" && c) {
        containers.set(c.id, { ...c, running: true });
        return "";
      }
      if (args[0] === "inspect" && args.includes("--format")) {
        const j = JSON.parse(
          await (await import("node:fs/promises")).readFile(
            join(config.directory, "journal.json"),
            "utf8",
          ),
        ) as Journal;
        return j.id;
      }
      throw new Error(`Unexpected fake Docker command ${args[0]}`);
    },
  };
  return {
    root,
    volume,
    config,
    engine,
    calls,
    containers,
    failures,
    close: () => rm(root, { recursive: true, force: true }),
  };
}
