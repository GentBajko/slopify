import { randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  unlink,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hasCode } from "../../host-cli/paths.js";
import { privateRead } from "../../host-cli/service.js";
import { type Container, type Engine, recoveryId } from "./engine.js";
import {
  type Install,
  installSchema,
  legacyJournalSchema,
  legacyReceiptSchema,
  privateDirectory,
  readState,
  settledLegacyPhases,
  type Update,
  updateSchema,
  writeState,
  writeText,
} from "./state.js";
import { contains, identity, isMissing, privateTree, safePath, treeDigest } from "./tree.js";

export interface ApplyOptions {
  readonly home: string;
  readonly uid: number;
  readonly gid: number;
  /** `<XDG_DATA_HOME>/slopify/docker`; this installation lives in `<root>/<name>`. */
  readonly root: string;
  readonly name: string;
  readonly volume: string;
  readonly image: string;
  /** This launcher's version; the image must be the same release. */
  readonly version: string;
  /** Requested port, or null to keep the remembered one (6969 on a first install). 0 = any free port. */
  readonly port: number | null;
  /** Requested project folder, or null to keep the remembered one. */
  readonly projects: string | null;
  /**
   * This computer's Documents folder. A new install puts Projects and Backups in
   * `<documents>/Slopify`; without it, a new install uses `~/Slopify/Projects` as before 3.0.
   */
  readonly documents?: string | undefined;
  /** `update` refuses to run when nothing is installed yet. */
  readonly mode: "install" | "update";
  /** The compose.yaml this package ships. */
  readonly composeFile: string;
  /**
   * The host CLI bridge. `ensure` installs or updates it (only called once running work has
   * finished) and returns the folder holding its socket and token.
   */
  readonly hostCli:
    | { readonly enabled: false }
    | { readonly enabled: true; readonly ensure: () => Promise<string> };
  readonly report: (line: string) => void;
  readonly pollMs?: number;
}
export interface ApplyResult {
  readonly url: string;
  readonly projects: string;
  /** The Backups folder shared beside Projects, or null when backups stay inside Projects. */
  readonly backups: string | null;
  readonly changed: boolean;
  readonly recovery: string | null;
  readonly removed: readonly string[];
  readonly problems: readonly string[];
}

const upArgs = ["up", "--detach", "--force-recreate", "--no-build", "--pull", "never"];

/**
 * Installs or updates the Docker installation `<name>`: one transaction that waits for running
 * work, snapshots the data volume, starts the new container through compose, and either commits
 * it once it answers as the new version or puts the previous container and data back.
 *
 * The data volume is only ever reused by name: it is created when missing and never removed or
 * recreated. Older installations (a plain `docker run` container, or the container the 2.5.0
 * launcher managed) are adopted: the old container is kept stopped under another name until the
 * new one is committed.
 */
export async function applyDocker(o: ApplyOptions, e: Engine): Promise<ApplyResult> {
  const directory = join(o.root, o.name);
  await privateDirectory(directory, o.uid);
  const release = await lock(join(directory, "update.lock"));
  try {
    return await locked(o, e, directory);
  } finally {
    await release();
  }
}

async function locked(o: ApplyOptions, e: Engine, directory: string): Promise<ApplyResult> {
  const paths = {
    install: join(directory, "install.json"),
    update: join(directory, "update.json"),
    env: join(directory, ".env"),
    compose: join(directory, "compose.yaml"),
    activation: join(directory, "activation"),
    off: join(directory, "host-cli-off"),
  };
  const context = await e.context(o.uid, o.gid);
  const interrupted = await readState(paths.update, updateSchema, o.uid);
  if (interrupted !== null) {
    o.report(
      "The last Slopify install or update was cut off before it finished. Putting the previous version back first...",
    );
    await rollback(o, e, directory, interrupted);
    await unlink(paths.update);
  }
  const install = await readState(paths.install, installSchema, o.uid);
  if (install !== null && (install.name !== o.name || install.volume !== o.volume))
    throw new Error(
      `${paths.install} belongs to another installation (${install.name}, volume ${install.volume}). Use SLOPIFY_DOCKER_NAME and SLOPIFY_DOCKER_VOLUME to pick it, and try again.`,
    );
  if (install !== null && install.daemon !== context.daemon)
    throw new Error(
      "This is not the Docker that Slopify was installed with (a different Docker context or DOCKER_HOST is active). Switch back to the original one (docker context use <name>, or unset DOCKER_HOST) and try again.",
    );
  const current = await e.inspect(o.name);
  const legacy = install === null ? await adoptable(o, directory, current) : null;
  if (o.mode === "update" && install === null && current === null)
    throw new Error(
      `Nothing to update: there is no Slopify Docker installation named ${o.name}. Install it first: npx @gentbajko/slopify --docker`,
    );
  if (current !== null) {
    const data = current.mounts.find((m) => m.destination === "/data");
    if (data?.type !== "volume" || data.name !== o.volume)
      throw new Error(
        `The existing container ${o.name} keeps its data in ${data?.type === "volume" ? `the volume ${data.name}` : "no named volume"}, not ${o.volume}. Run the command with SLOPIFY_DOCKER_VOLUME=${data?.type === "volume" ? data.name : "<its volume>"} so Slopify reuses that data, and try again.`,
      );
  }

  const source = install?.projects ?? legacy?.projects ?? null;
  const fallback =
    o.documents === undefined
      ? o.name === "slopify"
        ? join(o.home, "Slopify/Projects")
        : join(o.home, "Slopify", o.name, "Projects")
      : o.name === "slopify"
        ? join(o.documents, "Slopify", "Projects")
        : join(o.documents, "Slopify", o.name, "Projects");
  const projects = o.projects ?? source ?? fallback;
  // Only a brand-new install that takes the Documents default gets a Backups folder of its own
  // beside Projects; everything else keeps backups where they were (inside Projects).
  const backups =
    install !== null
      ? (install.backups ?? null)
      : source === null && o.projects === null && o.documents !== undefined
        ? join(dirname(projects), "Backups")
        : null;
  await safePath(projects, o.home, o.root, true);
  if (backups !== null) {
    await safePath(backups, o.home, o.root, true);
    if (contains(projects, backups) || contains(backups, projects))
      throw new Error(
        `The Backups folder ${backups} and the project folder ${projects} are inside each other. Choose a separate project folder with --projects-dir <folder>.`,
      );
  }
  if (
    source !== null &&
    source !== projects &&
    (contains(source, projects) || contains(projects, source))
  )
    throw new Error(
      `The new project folder ${projects} and the current one ${source} are inside each other. Choose a separate folder with --projects-dir <folder>.`,
    );
  if (source !== null && source === projects) await assertFolder(projects);
  if (source !== projects) await assertEmpty(projects);
  const port = o.port ?? install?.port ?? current?.port ?? 6969;

  await e.image(o.image);
  const imageVersion = await e.imageVersion(o.image);
  if (imageVersion !== o.version)
    throw new Error(
      `The Docker image ${o.image} is Slopify ${imageVersion} but this installer is ${o.version}. Run the latest of both (npx @gentbajko/slopify@latest --docker), or if you set SLOPIFY_DOCKER_IMAGE, point it at version ${o.version}. Nothing was changed.`,
    );

  if (
    install !== null &&
    current !== null &&
    current.project === o.name &&
    install.image === o.image &&
    install.appVersion === o.version &&
    install.user === context.user &&
    install.projects === projects &&
    (install.backups ?? null) === backups &&
    (o.port === null || install.port === o.port) &&
    install.hostCli === o.hostCli.enabled
  ) {
    if (!current.running) await e.start(current.id);
    await e.ready(current.id, null);
    if (o.hostCli.enabled) await o.hostCli.ensure();
    return {
      url: `http://127.0.0.1:${current.port ?? install.port}`,
      projects,
      backups,
      changed: false,
      recovery: install.recovery,
      removed: [],
      problems: [],
    };
  }

  if (current?.running) await waitForIdle(o, e, current.id);
  const share = o.hostCli.enabled ? await o.hostCli.ensure() : null;

  const id = randomUUID();
  const token = randomBytes(32).toString("hex");
  let u: Update = {
    version: 2,
    id,
    phase: "stopping",
    image: o.image,
    previous:
      current === null
        ? { kind: "none" }
        : install !== null && current.project === o.name
          ? {
              kind: "compose",
              env: (await privateRead(paths.env, o.uid)) ?? "",
              activation:
                (await privateRead(join(paths.activation, "activation.json"), o.uid)) ?? "",
            }
          : {
              kind: "legacy",
              id: current.id,
              name: o.name,
              renamed: `${o.name}-previous-${id}`,
              running: current.running,
              restart: current.restart,
            },
    backup: null,
    backupDigest: null,
    published: null,
  };
  const save = async (change: Partial<Update>) => {
    u = updateSchema.parse({ ...u, ...change });
    await writeState(paths.update, u);
  };
  await save({});
  try {
    if (u.previous.kind === "legacy") {
      await e.restartPolicy(u.previous.id, "no");
      if (u.previous.running) await e.stop(u.previous.id);
      await e.rename(u.previous.id, u.previous.renamed);
    } else if (u.previous.kind === "compose") await e.compose(directory, o.name, ["stop"]);

    const fresh = !(await e.volumeExists(o.volume));
    if (fresh) await e.createVolume(o.volume);
    else {
      const backup = `${o.volume}-recovery-${id}`;
      await save({ phase: "snapshot", backup });
      o.report(`Saving a recovery copy of your data in the Docker volume ${backup}...`);
      const backupDigest = await e.snapshot(o.image, o.volume, backup, {
        "io.slopify.transaction": id,
        "io.slopify.container": o.name,
      });
      await save({ backupDigest });
    }
    if (source !== projects) {
      await publishProjects(o, e, source, projects, id, current);
      await save({ published: { path: projects, identity: await identity(projects) } });
    }
    if (backups !== null) await mkdir(backups, { recursive: true, mode: 0o700 });
    const previousUser = install?.user ?? current?.user ?? null;
    if (fresh || previousUser !== context.user) await e.own(o.image, o.volume, context.user);

    await writeText(paths.compose, await readFile(o.composeFile, "utf8"));
    await mkdir(paths.off, { recursive: true, mode: 0o700 });
    await mkdir(paths.activation, { recursive: true, mode: 0o700 });
    await writeState(join(paths.activation, "activation.json"), {
      version: 1,
      token,
      committed: false,
    });
    await writeText(
      paths.env,
      composeEnv({
        SLOPIFY_NAME: o.name,
        SLOPIFY_IMAGE: o.image,
        SLOPIFY_USER: context.user,
        SLOPIFY_PORT: port === 0 ? "" : String(port),
        SLOPIFY_VOLUME: o.volume,
        SLOPIFY_PROJECTS_DIR: projects,
        ...(backups === null ? {} : { SLOPIFY_BACKUPS_DIR: backups }),
        SLOPIFY_HOST_CLI_SHARE: share ?? paths.off,
        SLOPIFY_ACTIVATION_DIR: paths.activation,
        SLOPIFY_UPDATE_TOKEN: token,
        SLOPIFY_UPDATE_PENDING: "1",
      }),
    );
    await save({ phase: "starting" });
    await e.compose(directory, o.name, upArgs);
    const candidate = await e.inspect(o.name);
    if (candidate === null)
      throw new Error("Docker Compose finished but the Slopify container isn't there.");
    await e.ready(candidate.id, { token, version: o.version });

    const next: Install = {
      version: 2,
      name: o.name,
      volume: o.volume,
      daemon: context.daemon,
      image: o.image,
      appVersion: o.version,
      user: context.user,
      port,
      projects,
      projectsIdentity: await identity(projects),
      ...(backups === null ? {} : { backups }),
      hostCli: share !== null,
      token,
      recovery: u.backup,
    };
    await writeState(paths.install, next);
    await writeState(join(paths.activation, "activation.json"), {
      version: 1,
      token,
      committed: true,
    });
    await unlink(paths.update);
    const tidy = await tidyUp(o, e, u);
    return {
      url: `http://127.0.0.1:${candidate.port ?? port}`,
      projects,
      backups,
      changed: true,
      recovery: u.backup,
      ...tidy,
    };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    try {
      await rollback(o, e, directory, u);
      await unlink(paths.update);
    } catch (failure) {
      throw new Error(
        `Slopify could not finish, and could not fully put the previous version back either. Don't delete anything: ${u.backup ? `your data's recovery copy is the Docker volume ${u.backup}, ` : ""}progress is recorded in ${paths.update}. Fix the problem below and run the same command again; it finishes the undo first. What failed: ${reason} Undo problem: ${failure instanceof Error ? failure.message : String(failure)}`,
        { cause },
      );
    }
    throw new Error(
      `${o.mode === "update" ? "The update" : "The install"} failed, so Slopify put the previous version back${u.previous.kind === "none" ? "" : " and nothing was lost"}. What failed: ${reason}${u.backup ? ` The recovery copy of your data is kept in the Docker volume ${u.backup}.` : ""}`,
      { cause },
    );
  }
}

/** Puts back what `u` changed. Safe to repeat: each step checks what is actually there. */
async function rollback(o: ApplyOptions, e: Engine, directory: string, u: Update): Promise<void> {
  const paths = { env: join(directory, ".env"), activation: join(directory, "activation") };
  const occupant = await e.inspect(o.name);
  const candidate =
    occupant !== null && !(u.previous.kind === "legacy" && occupant.id === u.previous.id)
      ? occupant
      : null;
  if (candidate !== null) {
    if (u.previous.kind === "compose") await e.compose(directory, o.name, ["stop"]);
    else await e.removeContainer(candidate.id);
  }
  // Only a started candidate can have changed the data (for example by migrating the database).
  if (u.phase === "starting" && u.backup !== null && u.backupDigest !== null) {
    o.report(`Copying your data back from the recovery volume ${u.backup}...`);
    await e.restore(u.image, u.backup, o.volume, u.backupDigest);
  }
  if (u.published !== null) {
    // Only the copy this run made, and only if it is still the same folder.
    const now = await identity(u.published.path).catch(() => null);
    if (now?.dev === u.published.identity.dev && now.ino === u.published.identity.ino)
      await rm(u.published.path, { recursive: true, force: true });
  }
  if (u.previous.kind === "compose") {
    await writeText(paths.env, u.previous.env);
    await mkdir(paths.activation, { recursive: true, mode: 0o700 });
    await writeText(join(paths.activation, "activation.json"), u.previous.activation);
    await e.compose(directory, o.name, upArgs);
    const back = await e.inspect(o.name);
    if (back !== null) await e.ready(back.id, null);
  } else if (u.previous.kind === "legacy") {
    const renamed = await e.inspect(u.previous.renamed);
    if (renamed !== null) await e.rename(renamed.id, u.previous.name);
    await e.restartPolicy(u.previous.id, u.previous.restart);
    if (u.previous.running) {
      await e.start(u.previous.id);
      await e.ready(u.previous.id, null);
    }
  }
}

/** After a commit: remove what the new recovery copy makes redundant. Never fails the update. */
async function tidyUp(
  o: ApplyOptions,
  e: Engine,
  u: Update,
): Promise<{ removed: string[]; problems: string[] }> {
  const removed: string[] = [];
  const problems: string[] = [];
  const attempt = async (what: string, fix: string, action: () => Promise<void>) => {
    try {
      await action();
      removed.push(what);
    } catch (error) {
      problems.push(
        `Couldn't remove ${what}, so it is kept. ${fix} Why: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
  try {
    // Stopped copies of the old container. Their data lives in the volume, which stays.
    for (const old of await e.legacyPrevious(o.name))
      if (
        !old.running &&
        (old.launcher || (u.previous.kind === "legacy" && old.id === u.previous.id))
      )
        await attempt(
          `the old container ${old.name}`,
          `Remove it with docker rm ${old.name}.`,
          () => e.removeContainer(old.id),
        );
    // Keep only the newest recovery volume: the one this update just made.
    for (const volume of await e.recoveryVolumes(o.volume)) {
      const id = recoveryId(o.volume, volume.name);
      if (id === null || volume.name === u.backup || volume.transaction !== id) continue;
      if (volume.container !== null && volume.container !== o.name) continue;
      await attempt(
        `the older recovery volume ${volume.name}`,
        `Once nothing uses it, remove it with docker volume rm ${volume.name}.`,
        () => e.removeVolume(volume.name),
      );
    }
  } catch (error) {
    problems.push(
      `Couldn't list older recovery volumes and containers to tidy up, so all of them are kept. See them with docker volume ls --filter label=io.slopify.transaction. Why: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { removed, problems };
}

async function waitForIdle(o: ApplyOptions, e: Engine, id: string): Promise<void> {
  let told = false;
  for (;;) {
    if ((await e.busy(id)) !== true) return;
    if (!told)
      o.report(
        "Slopify is generating right now. Waiting for running work to finish before updating (press Ctrl+C to cancel; nothing has been changed yet)...",
      );
    told = true;
    await delay(o.pollMs ?? 5000);
  }
}

/** The installation 2.5.0 or older left behind, if it is safe to adopt. */
async function adoptable(
  o: ApplyOptions,
  directory: string,
  current: Container | null,
): Promise<{ projects: string | null } | null> {
  const journal = await readState(
    join(directory, "journal.json"),
    legacyJournalSchema,
    o.uid,
  ).catch(() => null);
  if (journal !== null && !settledLegacyPhases.has(journal.phase))
    throw new Error(
      `An update by an older Slopify launcher (2.5.0 or earlier) didn't finish (step "${journal.phase}", recovery volume ${journal.backup}). Let it finish or undo first by running npx @gentbajko/slopify@2.5.0 --docker once, then run this command again. Nothing was changed.`,
    );
  const receipt = await readState(
    join(directory, "receipt.json"),
    legacyReceiptSchema,
    o.uid,
  ).catch(() => null);
  if (current === null) return receipt === null ? null : { projects: receipt.projects };
  if (current.project !== null)
    throw new Error(
      `A container named ${o.name} is already managed by Docker Compose (project ${current.project}) from another folder, so Slopify won't take it over. Stop it in that folder (docker compose down, which keeps the data volume), or install under another name with SLOPIFY_DOCKER_NAME=<name>.`,
    );
  const bind = current.mounts.find((m) => m.destination === "/data/projects");
  if (bind !== undefined && bind.type !== "bind")
    throw new Error(
      `The existing container ${o.name} keeps project files in a ${bind.type} mount, which Slopify can't adopt. Recreate it with a host folder for /data/projects, or install under another name with SLOPIFY_DOCKER_NAME=<name>.`,
    );
  return { projects: bind?.source ?? null };
}

/**
 * Makes `projects` hold the project files: a verified copy of the old host folder, or of the
 * files a plain `docker run` kept inside the volume. The source is never changed.
 */
async function publishProjects(
  o: ApplyOptions,
  e: Engine,
  source: string | null,
  projects: string,
  id: string,
  current: Container | null,
): Promise<void> {
  const staging = join(dirname(projects), `.slopify-projects-${id}`);
  await rm(staging, { recursive: true, force: true });
  if (source !== null) {
    o.report(`Copying your project files from ${source} to ${projects}...`);
    const before = await treeDigest(source);
    await cp(source, staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
      preserveTimestamps: true,
    });
    await privateTree(staging, o.uid, o.gid);
    if ((await treeDigest(staging)).hash !== before.hash)
      throw new Error(
        `The copy of your project files in ${staging} doesn't match ${source}. The original folder is unchanged.`,
      );
  } else {
    const inVolume = current === null ? null : await e.volumeProjects(o.image, o.volume);
    await mkdir(staging, { mode: 0o700 });
    if (inVolume !== null && inVolume.files > 0) {
      o.report(`Copying the project files kept inside the data volume to ${projects}...`);
      await e.copyVolumeProjects(o.image, o.volume, staging, id);
      await privateTree(staging, o.uid, o.gid);
      if ((await treeDigest(staging)).hash !== inVolume.hash)
        throw new Error(
          `The copy of the project files from the data volume doesn't match the original. They are unchanged inside the volume ${o.volume}.`,
        );
    }
  }
  // assertEmpty checked it before anything changed; rmdir still refuses if files appeared since.
  await rmdir(projects).catch((error: unknown) => {
    if (!isMissing(error)) throw error;
  });
  await rename(staging, projects);
}

async function assertFolder(path: string): Promise<void> {
  const s = await lstat(path).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (s === null || !s.isDirectory())
    throw new Error(
      `The project folder ${path} is missing. Put it back where it was (or restore it from a backup) and run the command again. Nothing was changed.`,
    );
}

async function assertEmpty(path: string): Promise<void> {
  const entries = await readdir(path).catch((error: unknown) => {
    if (isMissing(error)) return [];
    throw error;
  });
  if (entries.length > 0)
    throw new Error(
      `The project folder ${path} already has files in it that Slopify didn't put there. Choose an empty or new folder with --projects-dir <folder>, or move those files away, then try again.`,
    );
}

/** The .env compose reads. Single quotes keep every value literal. */
export function composeEnv(values: Readonly<Record<string, string>>): string {
  return Object.entries(values)
    .map(([key, value]) => {
      if (/['\n\r]/.test(value))
        throw new Error(
          `${value} can't be used in the Docker settings because it contains a quote or a line break. Choose a folder whose name has neither.`,
        );
      return `${key}='${value}'\n`;
    })
    .join("");
}

async function lock(path: string): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const file = await open(
        path,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      await file.writeFile(String(process.pid));
      await file.close();
      return () => unlink(path);
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      const pid = Number((await readFile(path, "utf8").catch(() => "")).trim());
      if (Number.isInteger(pid) && pid > 0 && alive(pid))
        throw new Error(
          `Another Slopify install or update is already running (process ${pid}). Wait for it to finish, then run the command again.`,
        );
      await unlink(path).catch(() => {});
    }
  }
  throw new Error(
    `Could not take the lock ${path}. Delete it if no Slopify install is running, and try again.`,
  );
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return hasCode(error, "EPERM");
  }
}
