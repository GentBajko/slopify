import {
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, relative, sep } from "node:path";
import { redact } from "../../kernel/log.js";
import type { ProjectAsset, RevisionDeps } from "../revisions/model.js";
import { outputPath } from "./layout.js";

export type AssetIdentity = Pick<ProjectAsset, "id" | "projectId" | "path">;

export interface PendingAsset extends AssetIdentity {
  readonly absolutePath: string;
}

export interface PreparedAsset extends ProjectAsset {
  readonly bytes: number;
}

export function allocateAsset(
  deps: Pick<RevisionDeps, "paths" | "ids">,
  projectId: string,
  filename: string,
): PendingAsset {
  requireBasename(filename);
  const id = deps.ids.next();
  requireBasename(id);
  const path = `assets/${id}/${filename}`;
  const absolutePath = outputPath(deps.paths, projectId, path);
  const directory = outputPath(deps.paths, projectId, `assets/${id}`);
  if (dirname(absolutePath) !== directory) throw new Error("Asset filenames must be basenames.");
  mkdirSync(outputPath(deps.paths, projectId, "assets"), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  return { id, projectId, path, absolutePath };
}

export function sealAsset(deps: Pick<RevisionDeps, "clock">, pending: PendingAsset): PreparedAsset {
  const file = openSync(pending.absolutePath, "r+");
  try {
    const stats = fstatSync(file);
    if (!stats.isFile()) throw new Error("An asset must be a regular file.");
    fchmodSync(file, 0o600);
    fsyncSync(file);
    return {
      id: pending.id,
      projectId: pending.projectId,
      path: pending.path,
      bytes: stats.size,
      createdAt: deps.clock.now().toISOString(),
    };
  } finally {
    closeSync(file);
  }
}

export function writeAsset(
  deps: Pick<RevisionDeps, "paths" | "ids" | "clock" | "log">,
  projectId: string,
  filename: string,
  bytes: Uint8Array,
): PreparedAsset {
  const pending = allocateAsset(deps, projectId, filename);
  try {
    writeFileSync(pending.absolutePath, bytes, { flag: "wx", mode: 0o600, flush: true });
    return sealAsset(deps, pending);
  } catch (error) {
    try {
      rmSync(dirname(pending.absolutePath), { recursive: true, force: true });
    } catch (cleanupError) {
      warnCleanup(deps, projectId, cleanupError);
    }
    throw error;
  }
}

export function discardPreparedAssets(
  deps: Pick<RevisionDeps, "db" | "paths" | "log">,
  assets: readonly AssetIdentity[],
): void {
  for (const asset of assets) {
    try {
      requireBasename(asset.id);
      const filename = basename(asset.path);
      requireBasename(filename);
      if (asset.path !== `assets/${asset.id}/${filename}`) {
        throw new Error("A prepared asset must belong to its allocated directory.");
      }
      const directory = outputPath(deps.paths, asset.projectId, `assets/${asset.id}`);
      const registered = deps.db
        .prepare("SELECT id,path FROM project_assets WHERE project_id=?")
        .all(asset.projectId);
      const retained = registered.some((row) => {
        if (row.id === asset.id) return true;
        if (typeof row.path !== "string") throw new Error("A registered asset must name a path.");
        const inside = relative(directory, outputPath(deps.paths, asset.projectId, row.path));
        return (
          inside === "" ||
          (inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))
        );
      });
      if (!retained) rmSync(directory, { recursive: true, force: true });
    } catch (error) {
      warnCleanup(deps, asset.projectId, error);
    }
  }
}

function requireBasename(filename: string): void {
  if (
    filename === "" ||
    filename === "." ||
    filename === ".." ||
    /[<>:"/\\|?*]/.test(filename) ||
    [...filename].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 0x20 || code === 0x7f;
    }) ||
    /[. ]$/.test(filename) ||
    /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(filename)
  )
    throw new Error("Asset filenames must be portable basenames.");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function warnCleanup(deps: Pick<RevisionDeps, "log">, projectId: string, error: unknown): void {
  try {
    deps.log.write("warn", "asset.cleanup", { projectId, detail: messageOf(error) });
  } catch (loggingError) {
    // A full disk can prevent both cleanup and file logging; preserve the write error.
    process.emitWarning(
      redact(
        `asset.cleanup ${projectId}: ${messageOf(error)}; logging failed: ${messageOf(loggingError)}`,
      ),
    );
  }
}
