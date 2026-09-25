import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { Engine } from "./engine.js";
import { type Container, type DockerConfig, journalSchema, readState } from "./state.js";

export async function assertVolumeClaims(
  c: DockerConfig,
  e: Engine,
  daemon: string,
  volumeIdentity: string | null,
  current: Container | null,
): Promise<void> {
  const permitted = new Set(current ? [current.id] : []);
  for (const entry of await readdir(c.directory)) {
    if (!/^[a-f0-9-]{36}$/.test(entry)) continue;
    const directory = join(c.directory, entry);
    const s = await lstat(directory);
    if (!s.isDirectory() || s.isSymbolicLink() || s.uid !== c.uid || (s.mode & 0o077) !== 0)
      throw new Error("Unsafe recovery transaction directory.");
    const j = await readState(join(directory, "journal.json"), journalSchema, c.uid);
    if (
      !j ||
      j.id !== entry ||
      j.name !== c.name ||
      j.daemon !== daemon ||
      j.volume !== c.volume ||
      j.volumeIdentity !== volumeIdentity
    )
      continue;
    const readerName = `slopify-reader-${j.id}`;
    const reader = await e.inspect(readerName);
    if (reader) {
      const transaction = await e.command([
        "inspect",
        "--format",
        '{{index .Config.Labels "io.slopify.reader"}}',
        reader.id,
      ]);
      const source = reader.mounts.find((m) => m.destination === "/source");
      const bind = reader.mounts.find((m) => m.destination === "/source/projects");
      if (
        reader.name !== readerName ||
        transaction !== j.id ||
        reader.image !== j.image ||
        reader.running ||
        source?.type !== "volume" ||
        source.name !== j.volume ||
        source.rw ||
        (j.sourceBind !== null &&
          (bind?.type !== "bind" || bind.source !== j.sourceBind || bind.rw)) ||
        reader.mounts.some(
          (m) =>
            m !== source &&
            !(j.sourceBind !== null && m === bind) &&
            !(m.type === "tmpfs" && m.destination === "/data"),
        )
      )
        throw new Error("Copy reader identity or mounts conflict; recovery material is retained.");
      await e.command(["rm", reader.id]);
    }
    if (j.previous) {
      const prior = await e.inspect(j.previous.id);
      if (
        prior &&
        [j.previous.name, `${c.name}-previous-${j.id}`].includes(prior.name) &&
        prior.image === j.previous.image &&
        prior.user === j.previous.user &&
        JSON.stringify(prior.mounts) === JSON.stringify(j.previous.mounts)
      )
        permitted.add(prior.id);
    }
    if (j.candidate) {
      const candidate = await e.inspect(j.candidate);
      if (
        candidate &&
        [c.name, `${c.name}-failed-${j.id}`].includes(candidate.name) &&
        candidate.installation === j.installation &&
        candidate.signature === j.signature
      )
        permitted.add(candidate.id);
    }
  }
  await e.claims(c.volume, [...permitted]);
}
