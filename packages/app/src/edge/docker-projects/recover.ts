import { join } from "node:path";
import type { Engine } from "./engine.js";
import {
  type DockerConfig,
  type Journal,
  type Receipt,
  selectProjects,
  writeState,
} from "./state.js";
import { assertIdentity, assertWritableTree, identity, isMissing, treeDigest } from "./tree.js";

export async function assertSourceIdentity(j: Journal): Promise<void> {
  if (j.sourceBind === null) return;
  if (!j.sourceIdentity) throw new Error("Original project bind identity is missing.");
  await assertIdentity(j.sourceBind, j.sourceIdentity);
}

export async function recoverInstallation(
  c: DockerConfig,
  j: Journal,
  receipt: Receipt | null,
  e: Engine,
): Promise<Journal> {
  const directory = join(c.directory, j.id);
  if (j.name !== c.name || j.volume !== c.volume) throw new Error("Journal installation conflict.");
  if (receipt?.transaction === j.id) {
    const current = await e.inspect(c.name);
    await selectProjects({ ...c, projectsOverride: null }, receipt, current);
    await assertWritableTree(receipt.projects, c.uid);
    if (current && (current.installation !== j.installation || current.signature !== j.signature))
      throw new Error("Committed container identity differs from its receipt.");
    await e.writers(c.volume, [receipt.projects], current ? [current.id] : []);
    await writeState(join(directory, "activation.json"), {
      version: 1,
      token: j.token,
      committed: true,
    });
    if (current && current.installation === j.installation && current.signature === j.signature) {
      await e.command(["update", "--restart=always", current.id]);
      if (!current.running) await e.command(["start", current.id]);
    }
    const finished = { ...j, phase: "committed" as const };
    await writeState(join(c.directory, "journal.json"), finished);
    return finished;
  }
  if (j.phase === "rolled-back") return j;
  await assertSourceIdentity(j);
  const occupant = await e.inspect(c.name);
  if (j.phase === "verified" && j.stagingIdentity && j.sourceDigest) {
    const found = await identity(j.destination).catch((error: unknown) => {
      if (isMissing(error)) return null;
      throw error;
    });
    if (
      found?.dev === j.stagingIdentity.dev &&
      found.ino === j.stagingIdentity.ino &&
      (await treeDigest(j.destination)).hash === j.sourceDigest.hash
    ) {
      j = { ...j, publishedIdentity: found };
    }
  }
  const possible = j.candidate ? await e.inspect(j.candidate) : occupant;
  if (occupant && occupant.id !== j.previous?.id && occupant.id !== possible?.id)
    throw new Error("Recovery name is occupied by an unrelated container.");
  if (possible && possible.id !== j.previous?.id) {
    const transaction = await e.command([
      "inspect",
      "--format",
      '{{index .Config.Labels "io.slopify.transaction"}}',
      possible.id,
    ]);
    if (
      transaction !== j.id ||
      possible.installation !== j.installation ||
      possible.signature !== j.signature
    )
      throw new Error("Recovery name is occupied by an unrelated container.");
    if (j.candidate !== possible.id) {
      j = { ...j, candidate: possible.id };
      await writeState(join(c.directory, "journal.json"), j);
      await writeState(join(directory, "journal.json"), j);
    }
    await e.stop(possible);
    const failedName = `${c.name}-failed-${j.id}`;
    if (possible.name !== failedName) await e.command(["rename", possible.id, failedName]);
  }
  if (j.phase !== "restored") {
    if (j.backupDigest) {
      await e.writers(c.volume, [j.destination, ...(j.sourceBind ? [j.sourceBind] : [])], []);
      await e.restore(j);
    }
    j = { ...j, phase: "restored" };
    await writeState(join(c.directory, "journal.json"), j);
    await writeState(join(directory, "journal.json"), j);
  }
  if (j.previous) {
    const old = await e.inspect(j.previous.id);
    if (!old || old.mounts.find((m) => m.destination === "/data")?.name !== c.volume)
      throw new Error("Original container/storage is missing; automatic rollback is unsafe.");
    if (j.previousReceipt)
      await selectProjects({ ...c, projectsOverride: null }, j.previousReceipt, old);
    if (j.sourceBind !== null) await assertWritableTree(j.sourceBind, c.uid);
    await e.writers(c.volume, [j.destination, ...(j.sourceBind ? [j.sourceBind] : [])], [old.id]);
    await e.restart(j.previous);
  }
  const rolledBack = { ...j, phase: "rolled-back" as const };
  await writeState(join(c.directory, "journal.json"), rolledBack);
  await writeState(join(directory, "journal.json"), rolledBack);
  return rolledBack;
}
