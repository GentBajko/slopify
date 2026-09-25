import { createHash, randomBytes, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readVersion } from "../../kernel/version.js";
import { assertVolumeClaims } from "./claims.js";
import { readCommittedJournal } from "./committed.js";
import type { Engine } from "./engine.js";
import { assertSourceIdentity, recoverInstallation } from "./recover.js";
import {
  type DockerConfig,
  type Journal,
  journalSchema,
  privateDirectory,
  type Receipt,
  readState,
  receiptSchema,
  selectProjects,
  writeState,
} from "./state.js";
import {
  assertIdentity,
  assertWritableTree,
  identity,
  isMissing,
  privateTree,
  safePath,
  syncDirectory,
  treeDigest,
} from "./tree.js";

export async function installProjects(
  c: DockerConfig,
  e: Engine,
  recovery: () => Engine,
): Promise<{ url: string; projects: string; recovery: string | null }> {
  await privateDirectory(c.directory, c.uid);
  const receiptPath = join(c.directory, "receipt.json");
  const journalPath = join(c.directory, "journal.json");
  let receipt = await readState(receiptPath, receiptSchema, c.uid);
  let previousJournal = await readState(journalPath, journalSchema, c.uid);
  const context = await e.context(c.uid, c.gid);
  const currentVolume = await e.volume(c.volume);
  if (
    (receipt && receipt.volumeIdentity !== currentVolume) ||
    (previousJournal?.volumeIdentity && previousJournal.volumeIdentity !== currentVolume)
  )
    throw new Error(
      `Remembered data volume ${c.volume} is missing or was replaced since Slopify was installed. Restore the original volume (see docker volume ls) and run the launcher again. Nothing was changed.`,
    );
  if (
    (receipt && receipt.daemon !== context.daemon) ||
    (previousJournal && previousJournal.daemon !== context.daemon)
  )
    throw new Error(
      "This is not the Docker that Slopify was installed with (a different Docker context or DOCKER_HOST is active). Switch back to the original one (docker context use <name>, or unset DOCKER_HOST) and try again.",
    );
  await assertVolumeClaims(c, e, context.daemon, currentVolume, await e.inspect(c.name));
  if (previousJournal && previousJournal.phase !== "rolled-back")
    previousJournal = await recoverInstallation(c, previousJournal, receipt, recovery());
  if (previousJournal?.phase === "rolled-back") await assertSourceIdentity(previousJournal);
  receipt = await readState(receiptPath, receiptSchema, c.uid);
  const old = await e.inspect(c.name);
  if (
    !receipt &&
    previousJournal?.sourceBind &&
    (old?.id !== previousJournal.previous?.id ||
      old?.mounts.find((m) => m.destination === "/data/projects")?.source !==
        previousJournal.sourceBind)
  )
    throw new Error(
      `Original bound container is missing or changed. Restore the recorded original container using ${previousJournal.sourceBind}; the hidden volume projects are not authoritative.`,
    );
  for (const name of await readdir(c.root)) {
    if (name === c.name || name === "setup.lock") continue;
    const s = await lstat(join(c.root, name));
    if (!s.isDirectory() || s.isSymbolicLink()) continue;
    const other = await readState(join(c.root, name, "receipt.json"), receiptSchema, c.uid);
    if (other?.daemon === context.daemon && other.volume === c.volume)
      throw new Error(
        `The Docker volume ${c.volume} already belongs to another Slopify installation (${other.name}). Give this one its own volume with SLOPIFY_DOCKER_VOLUME=<name> and try again.`,
      );
  }
  let reuse: Journal | null = null;
  if (
    previousJournal?.phase === "rolled-back" &&
    previousJournal.sourceBind !== previousJournal.destination &&
    previousJournal.publishedIdentity &&
    previousJournal.sourceDigest &&
    (c.projectsOverride === null || c.projectsOverride === previousJournal.destination)
  ) {
    await assertIdentity(previousJournal.destination, previousJournal.publishedIdentity);
    if ((await treeDigest(previousJournal.destination)).hash !== previousJournal.sourceDigest.hash)
      throw new Error(
        `Published retry folder changed; preserve it for inspection: ${previousJournal.destination}`,
      );
    reuse = previousJournal;
  }
  const base = await selectProjects(c, receipt, old, reuse);
  const projects = reuse?.destination ?? base;
  await safePath(projects, c.home, c.root, true);
  const bind =
    receipt?.projects ??
    old?.mounts.find((m) => m.destination === "/data/projects")?.source ??
    null;
  if (bind !== null) await assertWritableTree(bind, c.uid);
  const image = await e.image(c.image);
  const expectedVersion = await e.version(image);
  if (expectedVersion !== readVersion())
    throw new Error(
      `The Docker image is Slopify ${expectedVersion} but this launcher is ${readVersion()}. Run the latest of both (npx @gentbajko/slopify@latest --docker), or if you set SLOPIFY_DOCKER_IMAGE, point it at version ${readVersion()}. Your existing container was not changed.`,
    );
  const signature = createHash("sha256")
    .update(JSON.stringify([image, c.volume, c.port, c.bridge, projects, context.user]))
    .digest("hex");
  await e.writers(c.volume, [projects, ...(bind ? [bind] : [])], old ? [old.id] : []);
  await e.probe(c, image, context.user, projects);
  if (
    receipt &&
    old &&
    old.signature === signature &&
    old.image === image &&
    old.user === context.user &&
    old.mounts.find((m) => m.destination === "/data/projects")?.source === projects &&
    old.mounts.find((m) => m.destination === "/data")?.name === c.volume &&
    old.mounts.find((m) => m.destination === "/data")?.rw === true &&
    old.mounts.find((m) => m.destination === "/opt/slopify-install")?.source ===
      join(c.directory, receipt.transaction) &&
    old.mounts.find((m) => m.destination === "/opt/slopify-install")?.rw === false &&
    old.restart.Name === "always" &&
    old.port?.startsWith("127.0.0.1:") &&
    (c.port === 0 || old.port === `127.0.0.1:${c.port}`) &&
    (old.mounts.find((m) => m.destination === "/opt/slopify-host")?.source ?? null) === c.bridge
  ) {
    const j = await readCommittedJournal(c, receipt, old);
    if (!old.running) await e.command(["start", old.id]);
    await e.health(old.id, j.token, expectedVersion);
    return { url: `http://${old.port}`, projects, recovery: j.backup };
  }
  const id = randomUUID();
  const directory = join(c.directory, id);
  await privateDirectory(directory, c.uid);
  const destinationBefore = await identity(projects).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  let j: Journal = {
    version: 1,
    id,
    installation: receipt?.installation ?? randomUUID(),
    daemon: context.daemon,
    name: c.name,
    volume: c.volume,
    volumeIdentity: currentVolume,
    image,
    user: context.user,
    signature,
    phase: "prepared",
    previous: old,
    previousReceipt: receipt,
    sourceBind: bind,
    sourceIdentity: bind === null ? null : (receipt?.directoryIdentity ?? (await identity(bind))),
    destination: projects,
    destinationBefore,
    staging: join(dirname(projects), `.slopify-projects-${id}`),
    stagingIdentity: null,
    publishedIdentity: reuse?.publishedIdentity ?? null,
    sourceDigest: reuse?.sourceDigest ?? null,
    sourceAbsent: reuse?.sourceAbsent ?? false,
    backup: `${c.volume}-recovery-${id}`,
    backupDigest: null,
    candidate: null,
    token: randomBytes(32).toString("hex"),
  };
  async function save(change: Partial<Journal>): Promise<void> {
    j = journalSchema.parse({ ...j, ...change });
    await writeState(join(directory, "journal.json"), j);
    await writeState(journalPath, j);
  }
  await save({});
  await writeState(join(directory, "activation.json"), {
    version: 1,
    token: j.token,
    committed: false,
  });
  try {
    await save({ phase: "stopping" });
    if (old) await e.stop(old);
    await e.writers(c.volume, [projects, ...(bind ? [bind] : [])], []);
    await assertSourceIdentity(j);
    await save({ phase: "stopped" });
    await e.ensureVolume(c.volume);
    await save({ volumeIdentity: await e.volume(c.volume) });
    const source = await e.projects(image, c.volume, bind);
    if (reuse && (reuse.sourceAbsent ? source !== null : source?.hash !== reuse.sourceDigest?.hash))
      throw new Error(
        `Stale migration baseline. Retain ${projects} and ${reuse.staging}; select a new empty --projects-dir for a fresh verified copy.`,
      );
    await save({
      sourceDigest: source ?? reuse?.sourceDigest ?? null,
      sourceAbsent: source === null,
    });
    const backupDigest = await e.snapshot(j);
    await save({ phase: "snapshot", backupDigest });
    if (projects !== bind && reuse === null) {
      await mkdir(j.staging, { mode: 0o700 });
      await save({ phase: "copying", stagingIdentity: await identity(j.staging) });
      if (source !== null) await e.copy(image, c.volume, bind, j.staging, j.id);
      await privateTree(j.staging, c.uid, c.gid);
      const copied = await treeDigest(j.staging);
      const after = await e.projects(image, c.volume, bind);
      if (
        (source === null && copied.files !== 0) ||
        (source !== null && (copied.hash !== source.hash || after?.hash !== source.hash))
      )
        throw new Error("Project copy verification failed; source and staging are retained.");
      await save({ phase: "verified", sourceDigest: source ?? copied });
      await safePath(projects, c.home, c.root, false);
      if (j.destinationBefore) {
        await assertIdentity(projects, j.destinationBefore);
        if ((await readdir(projects)).length !== 0)
          throw new Error("Destination became populated before publication.");
      } else {
        const exists = await lstat(projects).catch((error: unknown) => {
          if (isMissing(error)) return null;
          throw error;
        });
        if (exists !== null) throw new Error("Destination appeared before publication.");
      }
      if (!j.stagingIdentity) throw new Error("Missing staging identity.");
      await assertIdentity(j.staging, j.stagingIdentity);
      await rename(j.staging, projects);
      await syncDirectory(dirname(projects));
    }
    await save({ phase: "published", publishedIdentity: await identity(projects) });
    await assertSourceIdentity(j);
    await e.writers(c.volume, [projects, ...(bind ? [bind] : [])], []);
    await e.own(j);
    if (old) await e.command(["rename", old.id, `${c.name}-previous-${j.id}`]);
    await save({ phase: "starting" });
    const candidate = await e.start(c, j, directory);
    await save({ candidate });
    await e.health(candidate, j.token, expectedVersion);
    await save({ phase: "healthy" });
    if (!j.publishedIdentity || !j.volumeIdentity)
      throw new Error("Missing published storage identity.");
    const next: Receipt = {
      version: 1,
      installation: j.installation,
      daemon: j.daemon,
      name: c.name,
      volume: c.volume,
      volumeIdentity: j.volumeIdentity,
      projects,
      directoryIdentity: j.publishedIdentity,
      user: j.user,
      image,
      signature,
      transaction: j.id,
    };
    await writeState(receiptPath, next);
    await e.command(["update", "--restart=always", candidate]);
    await writeState(join(directory, "activation.json"), {
      version: 1,
      token: j.token,
      committed: true,
    });
    await save({ phase: "committed" });
    const ready = await e.inspect(candidate);
    if (!ready?.port)
      throw new Error(
        "Slopify started but Docker did not report which port it is on. Run the same command again to finish.",
      );
    return { url: `http://${ready.port}`, projects, recovery: j.backup };
  } catch (cause) {
    const current = await readState(receiptPath, receiptSchema, c.uid);
    if (current?.transaction === j.id)
      throw new Error(
        `Slopify was installed (project files at ${projects}) but the last step did not finish. Run the same command again to complete it. Backup volume: ${j.backup}`,
        { cause },
      );
    try {
      await recoverInstallation(c, j, current, recovery());
    } catch (failure) {
      throw new Error(
        `Recovery incomplete: the install failed and Slopify could not fully undo it. Leave the Slopify container stopped and don't delete anything: backup volume ${j.backup}, progress file ${journalPath}, project folder ${projects}. Fix the problem below, then run the same command again. ${failure instanceof Error ? failure.message : "The undo step failed."}`,
        { cause },
      );
    }
    throw new Error(
      `Install failed. Previous installation restored${old?.running ? " and restarted" : " (not started)"}, so nothing was lost. Backup volume: ${j.backup}; project copy: ${projects}. Reason: ${cause instanceof Error ? cause.message : "Installation failed."}`,
      { cause },
    );
  }
}
