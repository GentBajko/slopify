import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { assertVolumeClaims } from "./claims.js";
import { installationFixture } from "./install.fake.js";
import { type Container, type Journal, privateDirectory, writeState } from "./state.js";

async function readerFixture(bind = false) {
  const h = await installationFixture();
  const id = randomUUID();
  const directory = join(h.config.directory, id);
  await privateDirectory(directory, h.config.uid);
  const j: Journal = {
    version: 1,
    id,
    installation: randomUUID(),
    daemon: "fixture-daemon",
    name: h.config.name,
    volume: h.config.volume,
    volumeIdentity: await h.engine.volume(h.config.volume),
    image: "sha256:fixture-image",
    user: `${h.config.uid}:${h.config.gid}`,
    signature: "signature",
    phase: "copying",
    previous: null,
    previousReceipt: null,
    sourceBind: bind ? join(h.root, "source") : null,
    sourceIdentity: null,
    destination: join(h.root, "destination"),
    destinationBefore: null,
    staging: join(h.root, "staging"),
    stagingIdentity: null,
    publishedIdentity: null,
    sourceDigest: null,
    sourceAbsent: false,
    backup: `${h.config.volume}-recovery-${id}`,
    backupDigest: null,
    candidate: null,
    token: "a".repeat(64),
  };
  await writeState(join(directory, "journal.json"), j);
  await mkdir(j.staging);
  await writeFile(join(j.staging, "partial"), "copied bytes");
  await writeFile(join(h.volume, "source"), "volume bytes");
  const reader: Container = {
    id: "a".repeat(64),
    name: `slopify-reader-${id}`,
    image: j.image,
    user: "",
    running: false,
    restart: { Name: "no", MaximumRetryCount: 0 },
    signature: null,
    installation: null,
    port: null,
    mounts: [
      { type: "volume", name: j.volume, source: h.volume, destination: "/source", rw: false },
      ...(j.sourceBind
        ? [
            {
              type: "bind",
              name: "",
              source: j.sourceBind,
              destination: "/source/projects",
              rw: false,
            },
          ]
        : []),
      { type: "tmpfs", name: "", source: "", destination: "/data", rw: true },
    ],
  };
  h.containers.set(reader.id, reader);
  const command = vi.spyOn(h.engine, "command").mockImplementation(async (args) => {
    if (args[0] === "inspect") {
      expect(args).toEqual([
        "inspect",
        "--format",
        '{{index .Config.Labels "io.slopify.reader"}}',
        reader.id,
      ]);
      return j.id;
    }
    expect(args).toEqual(["rm", reader.id]);
    h.containers.delete(reader.id);
    return "";
  });
  const check = () => assertVolumeClaims(h.config, h.engine, j.daemon, j.volumeIdentity, null);
  return { ...h, j, reader, command, check, directory };
}

it.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  "removes only a verified stopped crash reader before claims (bind=%s, tmpfs=%s)",
  async (bind, tmpfs) => {
    const h = await readerFixture(bind);
    try {
      if (!tmpfs) h.reader.mounts = h.reader.mounts.filter((m) => m.type !== "tmpfs");
      await expect(h.check()).resolves.toBeUndefined();
      expect(h.command).toHaveBeenLastCalledWith(["rm", h.reader.id]);
      expect(h.calls).toEqual(["claims"]);
      expect(h.containers.size).toBe(0);
      expect(await readFile(join(h.j.staging, "partial"), "utf8")).toBe("copied bytes");
      expect(await readFile(join(h.volume, "source"), "utf8")).toBe("volume bytes");
      await expect(h.check()).resolves.toBeUndefined();
    } finally {
      await h.close();
    }
  },
);

it.each([
  "foreign name",
  "wrong inspected name",
  "running",
  "wrong image",
  "missing label",
  "wrong label",
  "wrong volume",
  "writable volume",
  "missing source",
  "wrong source target",
  "wrong bind",
  "writable bind",
  "missing bind",
  "unrecorded bind",
  "extra persistent mount",
  "persistent data",
  "unexpected tmpfs",
])("refuses a %s reader without removing or stopping it", async (fault) => {
  const h = await readerFixture(true);
  try {
    const r = h.reader;
    const source = r.mounts[0];
    const bind = r.mounts[1];
    const data = r.mounts[2];
    if (!source || !bind || !data) throw new Error("Missing fixture mount");
    if (fault === "foreign name") r.name = "foreign";
    if (fault === "wrong inspected name") {
      r.name = "foreign";
      vi.spyOn(h.engine, "inspect").mockResolvedValue(r);
    }
    if (fault === "running") r.running = true;
    if (fault === "wrong image") r.image = "sha256:foreign";
    if (fault === "missing label") h.command.mockResolvedValue("<no value>");
    if (fault === "wrong label") h.command.mockResolvedValue(randomUUID());
    if (fault === "wrong volume") source.name = "foreign";
    if (fault === "writable volume") source.rw = true;
    if (fault === "missing source") r.mounts.splice(0, 1);
    if (fault === "wrong source target") source.destination = "/foreign";
    if (fault === "wrong bind") bind.source = "/foreign";
    if (fault === "writable bind") bind.rw = true;
    if (fault === "missing bind") r.mounts.splice(1, 1);
    if (fault === "unrecorded bind")
      await writeState(join(h.directory, "journal.json"), { ...h.j, sourceBind: null });
    if (fault === "extra persistent mount") r.mounts.push({ ...source, destination: "/extra" });
    if (fault === "persistent data") data.type = "volume";
    if (fault === "unexpected tmpfs") data.destination = "/extra";
    await expect(h.check()).rejects.toThrow();
    expect(h.command.mock.calls.every(([args]) => args[0] === "inspect")).toBe(true);
    expect(h.calls).not.toContain("stop");
    expect(h.containers.get(r.id)).toBe(r);
  } finally {
    await h.close();
  }
});

it.each(["id", "name", "daemon", "volume", "volumeIdentity"] as const)(
  "does not adopt a reader from a journal with mismatched %s",
  async (field) => {
    const h = await readerFixture();
    try {
      await writeState(join(h.directory, "journal.json"), {
        ...h.j,
        [field]: field === "id" ? randomUUID() : "foreign",
      });
      await expect(h.check()).rejects.toThrow("claimed by another container");
      expect(h.command).not.toHaveBeenCalled();
      expect(h.containers.has(h.reader.id)).toBe(true);
    } finally {
      await h.close();
    }
  },
);

// Rollback containers left by launchers before 1.6: stopped, restart off, launcher-labelled and
// named `<name>-previous-<timestamp>`. Refusing them blocked every upgrade from those versions.
function legacyRollback(name: string, volume: string, patch: Partial<Container> = {}): Container {
  return {
    id: randomUUID().replaceAll("-", ""),
    name: `${name}-previous-20260925023316`,
    image: "sha256:older-image",
    user: "",
    running: false,
    restart: { Name: "no", MaximumRetryCount: 0 },
    signature: "older-launcher-signature",
    installation: null,
    port: null,
    mounts: [{ type: "volume", name: volume, source: "/volume", destination: "/data", rw: true }],
    ...patch,
  };
}

it("keeps a stopped launcher rollback from before project folders", async () => {
  const h = await installationFixture();
  try {
    await mkdir(h.config.directory, { recursive: true, mode: 0o700 });
    const old = legacyRollback(h.config.name, h.config.volume);
    h.containers.set(old.id, old);
    await expect(
      assertVolumeClaims(
        h.config,
        h.engine,
        "fixture-daemon",
        await h.engine.volume(h.config.volume),
        null,
      ),
    ).resolves.toBeUndefined();
    expect(h.containers.get(old.id)).toBe(old);
  } finally {
    await h.close();
  }
});

it.each([
  ["running", { running: true }],
  ["restartable", { restart: { Name: "always", MaximumRetryCount: 0 } }],
  ["unlabelled", { signature: null }],
  ["foreign name", { name: "someone-elses-previous-20260925023316" }],
  ["hand-named", { name: "slopify-pre-cli-bridge-2026-09-24" }],
] as const)("still refuses a %s container on the volume", async (_label, patch) => {
  const h = await installationFixture();
  try {
    await mkdir(h.config.directory, { recursive: true, mode: 0o700 });
    const other = legacyRollback(h.config.name, h.config.volume, patch);
    h.containers.set(other.id, other);
    await expect(
      assertVolumeClaims(
        h.config,
        h.engine,
        "fixture-daemon",
        await h.engine.volume(h.config.volume),
        null,
      ),
    ).rejects.toThrow("claimed by another container");
  } finally {
    await h.close();
  }
});

// Docker lists a container's mounts in no fixed order; the retained previous container must be
// recognised however they come back.
it("recognises its own retained previous container whatever order Docker lists mounts in", async () => {
  const h = await readerFixture();
  try {
    h.containers.delete(h.reader.id);
    const data = {
      type: "volume",
      name: h.j.volume,
      source: h.volume,
      destination: "/data",
      rw: true,
    };
    const share = {
      type: "bind",
      name: "",
      source: "/host/share",
      destination: "/opt/slopify-host",
      rw: false,
    };
    const recorded: Container = {
      ...legacyRollback(h.config.name, h.j.volume),
      name: `${h.config.name}-previous-${h.j.id}`,
      signature: null,
      mounts: [data, share],
    };
    await writeState(join(h.directory, "journal.json"), { ...h.j, previous: recorded });
    h.containers.set(recorded.id, { ...recorded, mounts: [share, data] });
    await expect(h.check()).resolves.toBeUndefined();
  } finally {
    await h.close();
  }
});
