import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { type ApplyOptions, applyDocker, composeEnv } from "./apply.js";
import type { Container, Engine, RecoveryVolume } from "./engine.js";
import { writeState } from "./state.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const digest = { hash: "a".repeat(64), files: 1, bytes: 1 };
const uid = process.getuid?.() ?? 1000;
const gid = process.getgid?.() ?? 1000;

function container(over: Partial<Container> & { name: string }, projects: string): Container {
  return {
    id: `${over.name}-${Math.random().toString(16).slice(2)}`,
    image: "ghcr.io/gentbajko/slopify:2.5.0",
    user: `${uid}:${gid}`,
    running: true,
    restart: "always",
    project: null,
    launcher: true,
    port: 6969,
    mounts: [
      { type: "volume", name: "slopify-data", source: "", destination: "/data" },
      { type: "bind", name: "", source: projects, destination: "/data/projects" },
    ],
    ...over,
  };
}

function fakeEngine(projects: string) {
  const containers = new Map<string, Container>();
  const volumes = new Set<string>();
  const recovery: RecoveryVolume[] = [];
  const calls: string[] = [];
  const state = { busy: [] as boolean[], failReady: false, candidateImage: "" };
  const byId = (id: string) => [...containers.values()].find((c) => c.id === id);
  const e: Engine = {
    context: async () => ({ daemon: "daemon", user: `${uid}:${gid}` }),
    image: async (ref) => {
      calls.push(`image ${ref}`);
    },
    imageVersion: async (ref) => ref.split(":")[1] ?? "0.0.0",
    inspect: async (name) => containers.get(name) ?? byId(name) ?? null,
    legacyPrevious: async (name) =>
      [...containers.values()].filter((c) => c.name.startsWith(`${name}-previous-`)),
    volumeExists: async (name) => volumes.has(name),
    createVolume: async (name) => {
      calls.push(`volume create ${name}`);
      volumes.add(name);
    },
    volumeProjects: async () => null,
    copyVolumeProjects: async () => {},
    snapshot: async (_image, volume, backup, labels) => {
      calls.push(`snapshot ${volume} ${backup}`);
      volumes.add(backup);
      recovery.push({
        name: backup,
        transaction: labels["io.slopify.transaction"] ?? null,
        container: labels["io.slopify.container"] ?? null,
      });
      return digest;
    },
    restore: async (_image, backup, volume) => {
      calls.push(`restore ${backup} ${volume}`);
    },
    own: async (_image, volume, user) => {
      calls.push(`own ${volume} ${user}`);
    },
    recoveryVolumes: async () => recovery.filter((v) => volumes.has(v.name)),
    removeVolume: async (name) => {
      calls.push(`volume rm ${name}`);
      volumes.delete(name);
    },
    removeContainer: async (id) => {
      const c = byId(id);
      calls.push(`rm ${c?.name}`);
      if (c) containers.delete(c.name);
    },
    stop: async (id) => {
      const c = byId(id);
      calls.push(`stop ${c?.name}`);
      if (c) containers.set(c.name, { ...c, running: false });
    },
    start: async (id) => {
      const c = byId(id);
      calls.push(`start ${c?.name}`);
      if (c) containers.set(c.name, { ...c, running: true });
    },
    rename: async (id, name) => {
      const c = byId(id);
      if (!c) throw new Error("missing");
      calls.push(`rename ${c.name} ${name}`);
      containers.delete(c.name);
      containers.set(name, { ...c, name });
    },
    restartPolicy: async (id, policy) => {
      const c = byId(id);
      calls.push(`restart ${c?.name} ${policy}`);
      if (c) containers.set(c.name, { ...c, restart: policy });
    },
    compose: async (directory, name, args) => {
      calls.push(`compose ${args[0]}`);
      if (args[0] === "stop") {
        const c = containers.get(name);
        if (c) containers.set(name, { ...c, running: false });
        return;
      }
      const env = await readFile(join(directory, ".env"), "utf8");
      const image = /SLOPIFY_IMAGE='([^']*)'/.exec(env)?.[1] ?? "";
      state.candidateImage = image;
      const existing = containers.get(name);
      if (existing && existing.project !== name) throw new Error("name conflict");
      containers.set(
        name,
        container(
          { name, project: name, image, launcher: false, restart: "unless-stopped" },
          projects,
        ),
      );
    },
    ready: async (id, check) => {
      calls.push(`ready ${byId(id)?.image}${check ? " candidate" : ""}`);
      if (check && state.failReady) throw new Error("The new container did not answer.");
    },
    busy: async () => state.busy.shift() ?? false,
  };
  return { e, containers, volumes, recovery, calls, state };
}

async function setup() {
  const home = await mkdtemp(join(tmpdir(), "slopify-apply-"));
  roots.push(home);
  const root = join(home, "state", "slopify", "docker");
  const projects = join(home, "Slopify", "Projects");
  const compose = join(home, "compose.yaml");
  await writeFile(compose, "services: {}\n");
  const reports: string[] = [];
  const options = (over: Partial<ApplyOptions> = {}): ApplyOptions => ({
    home,
    uid,
    gid,
    root,
    name: "slopify",
    volume: "slopify-data",
    image: "ghcr.io/gentbajko/slopify:3.0.0",
    version: "3.0.0",
    port: null,
    projects: null,
    mode: "install",
    composeFile: compose,
    hostCli: { enabled: false },
    report: (line) => reports.push(line),
    pollMs: 1,
    ...over,
  });
  return { home, root, projects, options, reports, fake: fakeEngine(projects) };
}

it.skipIf(process.platform !== "linux")(
  "installs fresh: creates the volume once, owns it, starts through compose and commits",
  async () => {
    const h = await setup();
    const result = await applyDocker(h.options(), h.fake.e);
    expect(result).toMatchObject({
      url: "http://127.0.0.1:6969",
      projects: h.projects,
      changed: true,
      recovery: null,
    });
    expect(h.fake.calls).toEqual([
      "image ghcr.io/gentbajko/slopify:3.0.0",
      "volume create slopify-data",
      `own slopify-data ${uid}:${gid}`,
      "compose up",
      "ready ghcr.io/gentbajko/slopify:3.0.0 candidate",
    ]);
    const dir = join(h.root, "slopify");
    const install = JSON.parse(await readFile(join(dir, "install.json"), "utf8"));
    expect(install).toMatchObject({ version: 2, appVersion: "3.0.0", port: 6969, hostCli: false });
    const env = await readFile(join(dir, ".env"), "utf8");
    expect(env).toContain(`SLOPIFY_PROJECTS_DIR='${h.projects}'`);
    expect(env).toContain(`SLOPIFY_HOST_CLI_SHARE='${join(dir, "host-cli-off")}'`);
    expect(JSON.parse(await readFile(join(dir, "activation/activation.json"), "utf8"))).toEqual({
      version: 1,
      token: install.token,
      committed: true,
    });
    await expect(readFile(join(dir, "update.json"))).rejects.toThrow();
    // Same settings again: nothing is recreated.
    h.fake.calls.length = 0;
    expect((await applyDocker(h.options(), h.fake.e)).changed).toBe(false);
    expect(h.fake.calls).toEqual([
      "image ghcr.io/gentbajko/slopify:3.0.0",
      "ready ghcr.io/gentbajko/slopify:3.0.0",
    ]);
  },
);

it.skipIf(process.platform !== "linux")(
  "updates: waits for running work, snapshots, keeps only the newest recovery volume",
  async () => {
    const h = await setup();
    await applyDocker(
      h.options({ image: "ghcr.io/gentbajko/slopify:2.9.0", version: "2.9.0" }),
      h.fake.e,
    );
    h.fake.volumes.add("slopify-data-recovery-11111111-1111-4111-8111-111111111111");
    h.fake.recovery.push({
      name: "slopify-data-recovery-11111111-1111-4111-8111-111111111111",
      transaction: "11111111-1111-4111-8111-111111111111",
      container: null,
    });
    h.fake.recovery.push({
      name: "slopify-data-recovery-22222222-2222-4222-8222-222222222222",
      transaction: "22222222-2222-4222-8222-222222222222",
      container: "someone-else",
    });
    h.fake.volumes.add("slopify-data-recovery-22222222-2222-4222-8222-222222222222");
    h.fake.state.busy = [true, true, false];
    h.fake.calls.length = 0;
    const hostCli: string[] = [];
    const result = await applyDocker(
      h.options({
        mode: "update",
        hostCli: {
          enabled: true,
          ensure: async () => {
            hostCli.push(`bridge after ${h.fake.state.busy.length} busy answers`);
            return join(h.home, "share");
          },
        },
      }),
      h.fake.e,
    );
    expect(h.reports.some((line) => line.includes("Waiting for running work"))).toBe(true);
    expect(hostCli).toEqual(["bridge after 0 busy answers"]);
    expect(result.recovery).toMatch(/^slopify-data-recovery-/);
    expect(h.fake.calls).toEqual([
      "image ghcr.io/gentbajko/slopify:3.0.0",
      "compose stop",
      `snapshot slopify-data ${result.recovery}`,
      "compose up",
      "ready ghcr.io/gentbajko/slopify:3.0.0 candidate",
      "volume rm slopify-data-recovery-11111111-1111-4111-8111-111111111111",
    ]);
    expect(h.fake.volumes.has("slopify-data")).toBe(true);
    expect(h.fake.volumes.has("slopify-data-recovery-22222222-2222-4222-8222-222222222222")).toBe(
      true,
    );
    expect(await readFile(join(h.root, "slopify/.env"), "utf8")).toContain(
      `SLOPIFY_HOST_CLI_SHARE='${join(h.home, "share")}'`,
    );
  },
);

it.skipIf(process.platform !== "linux")(
  "rolls back when the new container doesn't answer: data copied back, previous settings restarted",
  async () => {
    const h = await setup();
    await applyDocker(
      h.options({ image: "ghcr.io/gentbajko/slopify:2.9.0", version: "2.9.0" }),
      h.fake.e,
    );
    const dir = join(h.root, "slopify");
    const before = {
      env: await readFile(join(dir, ".env"), "utf8"),
      install: await readFile(join(dir, "install.json"), "utf8"),
    };
    h.fake.state.failReady = true;
    h.fake.calls.length = 0;
    await expect(applyDocker(h.options({ mode: "update" }), h.fake.e)).rejects.toThrow(
      /The update failed, so Slopify put the previous version back and nothing was lost\. What failed: The new container did not answer\. The recovery copy of your data is kept in the Docker volume slopify-data-recovery-/,
    );
    expect(h.fake.calls.slice(-4)).toEqual([
      "compose stop",
      expect.stringMatching(/^restore slopify-data-recovery-.* slopify-data$/),
      "compose up",
      "ready ghcr.io/gentbajko/slopify:2.9.0",
    ]);
    expect(await readFile(join(dir, ".env"), "utf8")).toBe(before.env);
    expect(await readFile(join(dir, "install.json"), "utf8")).toBe(before.install);
    await expect(readFile(join(dir, "update.json"))).rejects.toThrow();
    expect(h.fake.calls).not.toContain("volume create slopify-data");
    expect(h.fake.calls.some((c) => c.startsWith("volume rm"))).toBe(false);
  },
);

it.skipIf(process.platform !== "linux")(
  "adopts the 2.5.0 launcher's container and volume by name, and removes its stopped copies",
  async () => {
    const h = await setup();
    await mkdir(h.projects, { recursive: true });
    await writeFile(join(h.projects, "kept.txt"), "project file");
    h.fake.volumes.add("slopify-data");
    h.fake.containers.set("slopify", container({ name: "slopify" }, h.projects));
    const stale = container(
      { name: "slopify-previous-33333333-3333-4333-8333-333333333333", running: false },
      h.projects,
    );
    h.fake.containers.set(stale.name, stale);
    const result = await applyDocker(h.options(), h.fake.e);
    expect(result.projects).toBe(h.projects);
    expect(h.fake.calls.slice(1, 5)).toEqual([
      "restart slopify no",
      "stop slopify",
      expect.stringMatching(/^rename slopify slopify-previous-/),
      expect.stringMatching(/^snapshot slopify-data slopify-data-recovery-/),
    ]);
    expect(h.fake.calls).not.toContain("volume create slopify-data");
    expect(h.fake.calls.some((c) => c.startsWith("own"))).toBe(false);
    expect([...h.fake.containers.keys()]).toEqual(["slopify"]);
    expect(h.fake.containers.get("slopify")?.project).toBe("slopify");
    expect(await readFile(join(h.projects, "kept.txt"), "utf8")).toBe("project file");
  },
);

it.skipIf(process.platform !== "linux")(
  "puts the adopted container back exactly as it was when the new one fails",
  async () => {
    const h = await setup();
    await mkdir(h.projects, { recursive: true });
    h.fake.volumes.add("slopify-data");
    const old = container({ name: "slopify" }, h.projects);
    h.fake.containers.set("slopify", old);
    h.fake.state.failReady = true;
    await expect(applyDocker(h.options(), h.fake.e)).rejects.toThrow(
      "put the previous version back",
    );
    expect(h.fake.containers.get("slopify")).toMatchObject({
      id: old.id,
      running: true,
      restart: "always",
    });
    expect([...h.fake.containers.keys()]).toEqual(["slopify"]);
    expect(await readFile(join(h.root, "slopify/install.json")).catch(() => null)).toBeNull();
  },
);

it.skipIf(process.platform !== "linux")(
  "refuses while an older launcher's update is unfinished, and a container on another volume",
  async () => {
    const h = await setup();
    const dir = join(h.root, "slopify");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    await writeState(join(dir, "journal.json"), {
      id: "x",
      name: "slopify",
      volume: "slopify-data",
      phase: "copying",
      backup: "slopify-data-recovery-x",
    });
    await expect(applyDocker(h.options(), h.fake.e)).rejects.toThrow("@2.5.0 --docker");
    await writeState(join(dir, "journal.json"), {
      id: "x",
      name: "slopify",
      volume: "slopify-data",
      phase: "committed",
      backup: "slopify-data-recovery-x",
    });
    h.fake.containers.set(
      "slopify",
      container(
        {
          name: "slopify",
          mounts: [{ type: "volume", name: "other", source: "", destination: "/data" }],
        },
        h.projects,
      ),
    );
    await expect(applyDocker(h.options(), h.fake.e)).rejects.toThrow("SLOPIFY_DOCKER_VOLUME=other");
    expect(h.fake.calls).toEqual([]);
  },
);

it.skipIf(process.platform !== "linux")("finishes the undo of a run that was cut off", async () => {
  const h = await setup();
  await mkdir(h.projects, { recursive: true });
  h.fake.volumes.add("slopify-data");
  const old = container({ name: "slopify" }, h.projects);
  const dir = join(h.root, "slopify");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  // Cut off after the old container was renamed and the candidate started.
  h.fake.containers.set("slopify-previous-44444444-4444-4444-8444-444444444444", {
    ...old,
    name: "slopify-previous-44444444-4444-4444-8444-444444444444",
    running: false,
    restart: "no",
  });
  h.fake.containers.set("slopify", container({ name: "slopify", project: "slopify" }, h.projects));
  await writeState(join(dir, "update.json"), {
    version: 2,
    id: "44444444-4444-4444-8444-444444444444",
    phase: "starting",
    image: "ghcr.io/gentbajko/slopify:3.0.0",
    previous: {
      kind: "legacy",
      id: old.id,
      name: "slopify",
      renamed: "slopify-previous-44444444-4444-4444-8444-444444444444",
      running: true,
      restart: "always",
    },
    backup: "slopify-data-recovery-44444444-4444-4444-8444-444444444444",
    backupDigest: digest,
    published: null,
  });
  h.fake.state.failReady = true;
  await expect(applyDocker(h.options(), h.fake.e)).rejects.toThrow("put the previous version back");
  expect(h.fake.calls.slice(0, 5)).toEqual([
    "rm slopify",
    "restore slopify-data-recovery-44444444-4444-4444-8444-444444444444 slopify-data",
    "rename slopify-previous-44444444-4444-4444-8444-444444444444 slopify",
    "restart slopify always",
    "start slopify",
  ]);
  expect(h.reports[0]).toContain("cut off");
});

it.skipIf(process.platform !== "linux")(
  "mounts <Documents>/Slopify/Projects and Backups for a new install",
  async () => {
    const h = await setup();
    const documents = join(h.home, "Dokumente");
    const result = await applyDocker(h.options({ documents }), h.fake.e);
    const projects = join(documents, "Slopify", "Projects");
    const backups = join(documents, "Slopify", "Backups");
    expect(result).toMatchObject({ projects, backups, changed: true });
    const dir = join(h.root, "slopify");
    const env = await readFile(join(dir, ".env"), "utf8");
    expect(env).toContain(`SLOPIFY_PROJECTS_DIR='${projects}'`);
    expect(env).toContain(`SLOPIFY_BACKUPS_DIR='${backups}'`);
    expect(JSON.parse(await readFile(join(dir, "install.json"), "utf8"))).toMatchObject({
      projects,
      backups,
    });
    // Same settings again: nothing is recreated.
    expect((await applyDocker(h.options({ documents }), h.fake.e)).changed).toBe(false);
  },
);

it.skipIf(process.platform !== "linux")(
  "keeps an existing install's Projects folder and its Backups inside it",
  async () => {
    const h = await setup();
    await applyDocker(h.options(), h.fake.e);
    const documents = join(h.home, "Documents");
    const result = await applyDocker(
      h.options({
        mode: "update",
        documents,
        image: "ghcr.io/gentbajko/slopify:3.0.1",
        version: "3.0.1",
      }),
      h.fake.e,
    );
    expect(result).toMatchObject({ projects: h.projects, backups: null, changed: true });
    const env = await readFile(join(h.root, "slopify", ".env"), "utf8");
    expect(env).toContain(`SLOPIFY_PROJECTS_DIR='${h.projects}'`);
    expect(env).not.toContain("SLOPIFY_BACKUPS_DIR");
  },
);

it("writes literal values and refuses quotes", () => {
  expect(composeEnv({ A: "/home/me/Project files", B: "" })).toBe(
    "A='/home/me/Project files'\nB=''\n",
  );
  expect(() => composeEnv({ A: "it's" })).toThrow("quote");
});
