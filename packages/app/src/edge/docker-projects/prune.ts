import { join } from "node:path";
import { type Engine, recoveryId } from "./engine.js";
import { type DockerConfig, type Journal, journalSchema, readState } from "./state.js";

export interface PruneResult {
  readonly removed: readonly string[];
  // What could not be removed, each said as a whole sentence for the terminal.
  readonly problems: readonly string[];
}

// Phases an update's record is left in once it is over, one way or the other. Anything else
// is an update that never finished, and its volume may be the only copy of the data.
const settled = new Set<Journal["phase"]>(["healthy", "committed", "restored", "rolled-back"]);

// After an update is committed and healthy, keep only its own recovery volume. An older one is
// removed only when all of these hold, so a volume some other installation, container or person
// made is never touched:
// - its name is exactly `<this data volume>-recovery-<uuid>`, never the data volume itself;
// - its io.slopify.transaction label is that same uuid (every launcher has set it);
// - the container label, which this launcher adds, names this container (earlier launchers
//   set none, and for those the next check decides alone);
// - the update's own record, <install dir>/<uuid>/journal.json in this container's private
//   folder, exists and names this container, data volume and Docker, the installation the
//   volume's label names, and exactly this volume as its backup, and says that update is
//   over. A first install that was rolled back has an installation id of its own, so the
//   id is matched against the volume's label rather than the current update's.
// Docker refuses to remove a volume a container still uses; that refusal is reported, not
// forced. Nothing here can fail the update, which has already finished.
export async function pruneRecoveryVolumes(
  c: DockerConfig,
  e: Engine,
  j: Journal,
): Promise<PruneResult> {
  const removed: string[] = [];
  const problems: string[] = [];
  let volumes: Awaited<ReturnType<Engine["recoveryVolumes"]>>;
  try {
    volumes = await e.recoveryVolumes(c.volume);
  } catch (error) {
    return {
      removed,
      problems: [
        `Couldn't list older recovery volumes to tidy up, so all of them are kept. See them with docker volume ls --filter label=io.slopify.transaction and remove the ones you no longer need with docker volume rm <name>. ${reason(error)}`,
      ],
    };
  }
  for (const volume of volumes) {
    const id = recoveryId(c.volume, volume.name);
    if (id === null || id === j.id || volume.name === j.backup || volume.name === c.volume)
      continue;
    if (volume.transaction !== id) continue;
    if (volume.container !== null && volume.container !== c.name) continue;
    const record = await readState(
      join(c.directory, id, "journal.json"),
      journalSchema,
      c.uid,
    ).catch(() => null);
    if (
      record === null ||
      record.id !== id ||
      record.name !== c.name ||
      record.volume !== c.volume ||
      record.daemon !== j.daemon ||
      (volume.installation !== null && volume.installation !== record.installation) ||
      record.backup !== volume.name ||
      !settled.has(record.phase)
    )
      continue;
    try {
      await e.removeVolume(volume.name);
      removed.push(volume.name);
    } catch (error) {
      problems.push(
        `Couldn't remove the older recovery volume ${volume.name}, so it is kept. Once nothing uses it, remove it with docker volume rm ${volume.name}. ${reason(error)}`,
      );
    }
  }
  return { removed, problems };
}

function reason(error: unknown): string {
  return error instanceof Error ? `Why: ${error.message}` : "";
}
