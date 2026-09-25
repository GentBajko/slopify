import { chmod, mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it } from "vitest";
import { installationFixture } from "./install.fake.js";
import { installProjects } from "./install.js";
import { recoverInstallation } from "./recover.js";
import { journalSchema, readState, receiptSchema } from "./state.js";
import { treeDigest } from "./tree.js";

async function seeded() {
  const h = await installationFixture();
  await mkdir(join(h.volume, "projects", "p", "history"), { recursive: true });
  for (const [name, bytes] of [
    ["history/old.wav", "old audio"],
    ["partial.wav", "partial"],
    ["research.md", "研究"],
  ]) {
    if (!name || bytes === undefined) throw new Error("Invalid fixture");
    await writeFile(join(h.volume, "projects", "p", name), bytes);
  }
  await writeFile(join(h.volume, "database.fixture"), "private database bytes");
  h.containers.set("old", {
    id: "old",
    name: h.config.name,
    image: "old-image",
    user: "1000",
    running: true,
    restart: { Name: "on-failure", MaximumRetryCount: 7 },
    signature: null,
    installation: null,
    mounts: [
      { type: "volume", name: h.config.volume, source: h.volume, destination: "/data", rw: true },
    ],
    port: "127.0.0.1:6969",
  });
  return h;
}
it("migrates every project byte, keeps private state out, commits and reuses actual mounts", async () => {
  const h = await seeded();
  try {
    const before = await treeDigest(join(h.volume, "projects"));
    const first = await installProjects(h.config, h.engine, () => h.engine);
    expect(await treeDigest(first.projects)).toEqual(before);
    expect(await treeDigest(join(h.volume, "projects"))).toEqual(before);
    expect(await readdir(first.projects)).toEqual(["p"]);
    const receipt = await readState(
      join(h.config.directory, "receipt.json"),
      receiptSchema,
      h.config.uid,
    );
    expect(receipt?.volume).toBe(h.config.volume);
    const old = h.containers.get("old");
    expect(old?.running).toBe(false);
    expect(old?.restart.Name).toBe("no");
    h.calls.length = 0;
    await writeFile(join(first.projects, "p", "new.md"), "new legitimate output");
    expect((await installProjects(h.config, h.engine, () => h.engine)).projects).toBe(
      first.projects,
    );
    expect(h.calls).not.toContain("copy");
    expect(h.calls).not.toContain("snapshot");
  } finally {
    await h.close();
  }
});
it.each(["starting", "healthy", "verified"] as const)(
  "recovers an interrupted %s journal conservatively",
  async (phase) => {
    const h = await seeded();
    try {
      h.failures.add("health");
      await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow();
      h.failures.clear();
      const path = join(h.config.directory, "journal.json");
      const old = await readState(path, journalSchema, h.config.uid);
      if (!old) throw new Error("No transaction fixture");
      const entry = h.containers.get("old");
      if (!entry) throw new Error("No original fixture");
      await h.engine.stop(entry);
      const crash =
        phase === "verified"
          ? {
              ...old,
              phase,
              stagingIdentity: old.publishedIdentity,
              publishedIdentity: null,
              candidate: null,
            }
          : { ...old, phase };
      await (await import("./state.js")).writeState(path, crash);
      const result = await installProjects(h.config, h.engine, () => h.engine);
      expect((await treeDigest(result.projects)).hash).toBe(
        (await treeDigest(join(h.volume, "projects"))).hash,
      );
    } finally {
      await h.close();
    }
  },
);
it.each([false, true])(
  "refuses an unrelated name occupant before recovery mutations (running=%s)",
  async (running) => {
    const h = await seeded();
    try {
      h.failures.add("health");
      h.failures.add("restore");
      await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow(
        "Recovery incomplete",
      );
      h.failures.clear();
      const path = join(h.config.directory, "journal.json");
      const j = await readState(path, journalSchema, h.config.uid);
      if (!j?.candidate) throw new Error("Missing recorded candidate");
      const candidate = h.containers.get(j.candidate);
      if (!candidate) throw new Error("Missing candidate container");
      h.containers.set(candidate.id, { ...candidate, name: "owned-elsewhere", running: true });
      h.containers.set("foreign", {
        ...candidate,
        id: "foreign",
        name: h.config.name,
        running,
        mounts: [],
      });
      await writeFile(join(h.volume, "database.fixture"), "private state before recovery");
      const before = await treeDigest(h.volume, true);
      const containers = [...h.containers.entries()];
      const journal = await readFile(path, "utf8");
      h.calls.length = 0;
      await expect(recoverInstallation(h.config, j, null, h.engine)).rejects.toThrow(
        "Recovery name is occupied by an unrelated container",
      );
      for (const operation of ["stop", "rename", "restore", "restart", "start", "update"])
        expect(h.calls).not.toContain(operation);
      expect([...h.containers.entries()]).toEqual(containers);
      expect(await treeDigest(h.volume, true)).toEqual(before);
      expect(await readFile(path, "utf8")).toBe(journal);
    } finally {
      await h.close();
    }
  },
);
it.each(["copy", "snapshot", "own", "start", "health"])(
  "recovers previous container/policy after %s fails",
  async (fail) => {
    const h = await seeded();
    try {
      const before = await treeDigest(h.volume, true);
      h.failures.add(fail);
      await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow(
        "Previous installation restored",
      );
      expect(await treeDigest(h.volume, true)).toEqual(before);
      expect(h.containers.get("old")).toMatchObject({
        name: h.config.name,
        running: true,
        restart: { Name: "on-failure", MaximumRetryCount: 7 },
      });
      expect(
        await readState(join(h.config.directory, "receipt.json"), receiptSchema, h.config.uid),
      ).toBeNull();
    } finally {
      await h.close();
    }
  },
);
it("refuses stale published data on retry and reports rollback failures honestly", async () => {
  const h = await seeded();
  try {
    h.failures.add("health");
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow();
    h.failures.clear();
    await writeFile(join(h.volume, "projects", "p", "research.md"), "changed after rollback");
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow("baseline");
    h.failures.add("restore");
    h.failures.add("own");
    const next = { ...h.config, projectsOverride: join(h.root, "another") };
    await expect(installProjects(next, h.engine, () => h.engine)).rejects.toThrow(
      "Recovery incomplete",
    );
  } finally {
    await h.close();
  }
});
it("reuses receipts without containers and refuses missing folders, volumes and other writers", async () => {
  const h = await seeded();
  try {
    const installed = await installProjects(h.config, h.engine, () => h.engine);
    h.containers.clear();
    h.calls.length = 0;
    await installProjects(h.config, h.engine, () => h.engine);
    expect(h.calls).not.toContain("copy");
    await rename(installed.projects, `${installed.projects}-removed`);
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow("Remembered");
    await rename(`${installed.projects}-removed`, installed.projects);
    await expect(
      installProjects({ ...h.config, volume: "wrong-volume" }, h.engine, () => h.engine),
    ).rejects.toThrow("volume");
    const candidate = [...h.containers.values()][0];
    if (!candidate) throw new Error("Missing fixture container");
    h.containers.set("foreign", { ...candidate, id: "foreign", name: "foreign", running: true });
    await expect(
      installProjects(
        { ...h.config, projectsOverride: join(h.root, "move") },
        h.engine,
        () => h.engine,
      ),
    ).rejects.toThrow("claimed by another container");
  } finally {
    await h.close();
  }
});
it("retains incomplete staging and never adopts unrelated populated destinations", async () => {
  const h = await seeded();
  try {
    const target = join(h.root, "Unrelated");
    await mkdir(target);
    await writeFile(join(target, "note"), "keep");
    await expect(
      installProjects({ ...h.config, projectsOverride: target }, h.engine, () => h.engine),
    ).rejects.toThrow("populated");
    expect(h.calls).not.toContain("stop");
    h.failures.add("copy");
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow();
    const j = await readState(
      join(h.config.directory, "journal.json"),
      journalSchema,
      h.config.uid,
    );
    if (!j) throw new Error("Missing journal");
    await writeFile(join(j.staging, "uncertain"), "retain");
    h.failures.clear();
    await installProjects(h.config, h.engine, () => h.engine);
    expect(await readFile(join(j.staging, "uncertain"), "utf8")).toBe("retain");
    expect(await readFile(join(target, "note"), "utf8")).toBe("keep");
  } finally {
    await h.close();
  }
});

it.each([false, true])(
  "reuses the committed install after rollback with new outputs=%s",
  async (addOutput) => {
    const h = await seeded();
    try {
      const installed = await installProjects(h.config, h.engine, () => h.engine);
      const receipt = await readState(
        join(h.config.directory, "receipt.json"),
        receiptSchema,
        h.config.uid,
      );
      h.failures.add("health");
      await expect(
        installProjects({ ...h.config, port: 7070 }, h.engine, () => h.engine),
      ).rejects.toThrow("Previous installation restored");
      h.failures.clear();
      if (addOutput)
        await writeFile(join(installed.projects, "new.md"), "legitimate output after rollback");
      const before = await treeDigest(installed.projects);
      h.calls.length = 0;
      expect((await installProjects(h.config, h.engine, () => h.engine)).projects).toBe(
        installed.projects,
      );
      expect(await treeDigest(installed.projects)).toEqual(before);
      expect(
        await readState(join(h.config.directory, "receipt.json"), receiptSchema, h.config.uid),
      ).toEqual(receipt);
      for (const op of ["stop", "copy", "snapshot", "restore", "own"])
        expect(h.calls).not.toContain(op);
    } finally {
      await h.close();
    }
  },
);

it("retries a failed fresh install whose original projects subtree was absent", async () => {
  const h = await installationFixture();
  try {
    h.failures.add("health");
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow(
      "Previous installation restored",
    );
    h.failures.clear();
    const installed = await installProjects(h.config, h.engine, () => h.engine);
    expect(await readdir(installed.projects)).toEqual([]);
    expect(
      await readState(join(h.config.directory, "receipt.json"), receiptSchema, h.config.uid),
    ).not.toBeNull();
  } finally {
    await h.close();
  }
});

it("refuses a replaced committed folder before restarting or activating", async () => {
  const h = await seeded();
  try {
    const installed = await installProjects(h.config, h.engine, () => h.engine);
    const current = await h.engine.inspect(h.config.name);
    if (!current) throw new Error("Missing installation");
    await h.engine.stop(current);
    await rename(installed.projects, `${installed.projects}-saved`);
    await mkdir(installed.projects, { mode: 0o700 });
    await writeFile(join(installed.projects, "unrelated.md"), "do not touch");
    h.calls.length = 0;
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow("Remembered");
    for (const op of ["start", "update", "stop", "own", "restore"])
      expect(h.calls).not.toContain(op);
    expect((await h.engine.inspect(current.id))?.running).toBe(false);
    expect(await readFile(join(installed.projects, "unrelated.md"), "utf8")).toBe("do not touch");
  } finally {
    await h.close();
  }
});

it("refuses a new source subtree after a fresh failed publication", async () => {
  const h = await installationFixture();
  try {
    h.failures.add("health");
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow();
    h.failures.clear();
    await mkdir(join(h.volume, "projects"));
    await writeFile(join(h.volume, "projects", "unexpected.md"), "new source");
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow(
      "Stale migration baseline",
    );
    expect(await readFile(join(h.volume, "projects", "unexpected.md"), "utf8")).toBe("new source");
  } finally {
    await h.close();
  }
});

it("rejects stopped foreign volume claims without trusting recovery-shaped names", async () => {
  const h = await seeded();
  try {
    const old = h.containers.get("old");
    if (!old) throw new Error("Missing fixture");
    h.containers.clear();
    h.containers.set("foreign", {
      ...old,
      id: "foreign",
      name: `${h.config.name}-previous-untrusted`,
      running: false,
    });
    const before = await treeDigest(h.volume, true);
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow("claimed");
    expect(await treeDigest(h.volume, true)).toEqual(before);
    expect(h.calls).toEqual(["context", "claims"]);
  } finally {
    await h.close();
  }
});

it("refuses an unwritable existing bind before changing the installation", async () => {
  const h = await seeded();
  const bind = join(h.root, "Existing projects");
  const blocked = join(bind, "p");
  try {
    await mkdir(blocked, { recursive: true, mode: 0o700 });
    await writeFile(join(blocked, "old.md"), "retained");
    await chmod(blocked, 0o500);
    const old = h.containers.get("old");
    if (!old) throw new Error("Missing original");
    h.containers.set(old.id, {
      ...old,
      mounts: [
        ...old.mounts,
        { type: "bind", name: "", source: bind, destination: "/data/projects", rw: true },
      ],
    });
    await expect(installProjects(h.config, h.engine, () => h.engine)).rejects.toThrow(
      "permissions",
    );
    for (const op of ["stop", "start", "own", "snapshot"]) expect(h.calls).not.toContain(op);
  } finally {
    await chmod(blocked, 0o700);
    await h.close();
  }
});

it("finishes interrupted rollback without restoring private data after the original restarted", async () => {
  const h = await seeded();
  try {
    await installProjects(h.config, h.engine, () => h.engine);
    h.failures.add("health");
    const restart = h.engine.restart;
    h.engine.restart = async (c) => {
      await restart(c);
      throw new Error("interrupted after restart");
    };
    await expect(
      installProjects({ ...h.config, port: 7070 }, h.engine, () => h.engine),
    ).rejects.toThrow("Recovery incomplete");
    h.engine.restart = restart;
    h.failures.clear();
    await writeFile(join(h.volume, "database.fixture"), "new private bytes after restart");
    h.calls.length = 0;
    await installProjects(h.config, h.engine, () => h.engine);
    expect(h.calls).not.toContain("restore");
    expect(await readFile(join(h.volume, "database.fixture"), "utf8")).toBe(
      "new private bytes after restart",
    );
  } finally {
    await h.close();
  }
});
