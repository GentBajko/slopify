import { randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { HostFolderRefused } from "../kernel/ports/host-cli.js";
import { createHostFolderOpener, launchXdgOpen } from "./open-folder.js";

const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const home of homes.splice(0)) await rm(home, { recursive: true, force: true });
});
async function setup(options: { identity?: { dev: string; ino: string }; mode?: number } = {}) {
  const home = await mkdtemp(join(tmpdir(), "slopify-host-folder-"));
  homes.push(home);
  const root = join(home, "data", "slopify", "docker");
  const projects = join(home, "Projects");
  await mkdir(join(root, "slopify"), { recursive: true, mode: 0o700 });
  await mkdir(join(projects, "p1", "history"), { recursive: true });
  const s = await lstat(projects, { bigint: true });
  const receipt = join(root, "slopify", "receipt.json");
  await writeFile(
    receipt,
    JSON.stringify({
      version: 1,
      installation: randomUUID(),
      daemon: "daemon",
      name: "slopify",
      volume: "slopify-data",
      volumeIdentity: "volume",
      projects,
      directoryIdentity: options.identity ?? { dev: String(s.dev), ino: String(s.ino) },
      user: "1000:1000",
      image: "ghcr.io/gentbajko/slopify:latest",
      signature: "signature",
      transaction: randomUUID(),
    }),
    { mode: 0o600 },
  );
  await chmod(receipt, options.mode ?? 0o600);
  const launch = vi.fn(async (_directory: string) => {});
  const open = createHostFolderOpener({ root, uid: process.getuid?.() ?? -1, launch });
  return { home, projects, launch, open };
}

it.skipIf(process.platform !== "linux")(
  "opens the project folder and real folders inside it",
  async () => {
    const h = await setup();
    await h.open(join(h.projects, "p1", "history"));
    await h.open(h.projects);
    await h.open(`${h.projects}/p1/../p1/history/`);
    expect(h.launch.mock.calls.map(([path]) => path)).toEqual([
      join(h.projects, "p1", "history"),
      h.projects,
      join(h.projects, "p1", "history"),
    ]);
  },
);
it.skipIf(process.platform !== "linux")(
  "refuses folders outside every launcher project folder",
  async () => {
    const h = await setup();
    for (const path of [h.home, "/etc", `${h.projects}/../`, `${h.projects}/p1/../../data`])
      await expect(h.open(path)).rejects.toBeInstanceOf(HostFolderRefused);
    await expect(h.open(`${h.projects}-other`)).rejects.toThrow(/Docker launcher/);
    expect(h.launch).not.toHaveBeenCalled();
  },
);
it.skipIf(process.platform !== "linux")(
  "refuses a symlink, a file or a missing folder on the way down",
  async () => {
    const h = await setup();
    await symlink(h.home, join(h.projects, "link"));
    await writeFile(join(h.projects, "p1", "file.wav"), "saved");
    for (const path of [
      join(h.projects, "link"),
      join(h.projects, "link", "Projects"),
      join(h.projects, "p1", "file.wav"),
      join(h.projects, "p1", "missing"),
    ])
      await expect(h.open(path)).rejects.toBeInstanceOf(HostFolderRefused);
    expect(h.launch).not.toHaveBeenCalled();
  },
);
it.skipIf(process.platform !== "linux")(
  "refuses a project folder that was replaced since the launcher recorded it",
  async () => {
    const h = await setup({ identity: { dev: "1", ino: "1" } });
    await expect(h.open(join(h.projects, "p1"))).rejects.toThrow(/moved or replaced/);
    expect(h.launch).not.toHaveBeenCalled();
  },
);
it.skipIf(process.platform !== "linux")(
  "ignores a receipt others could read or change",
  async () => {
    const h = await setup({ mode: 0o644 });
    await expect(h.open(join(h.projects, "p1"))).rejects.toBeInstanceOf(HostFolderRefused);
    expect(h.launch).not.toHaveBeenCalled();
  },
);
it.skipIf(process.platform !== "linux")(
  "explains a missing xdg-open instead of failing silently",
  async () => {
    const empty = await mkdtemp(join(tmpdir(), "slopify-no-path-"));
    homes.push(empty);
    vi.stubEnv("PATH", empty);
    await expect(launchXdgOpen(empty)).rejects.toThrow(
      /xdg-open isn't installed on this machine.*xdg-utils/,
    );
  },
);
