import { constants, copyFileSync } from "node:fs";
import { basename } from "node:path";
import type { RevisionDeps } from "../revisions/model.js";
import type { PreparedAsset } from "./assets.js";
import { allocateAsset, discardPreparedAssets, sealAsset, writeAsset } from "./assets.js";
import { extensionOf, outputFileName, stagingPath } from "./layout.js";
import type { Output } from "./model.js";
import { stagedFileById } from "./repo.js";
import type { AttachInput, TextInput } from "./staging.js";

export interface PreparedOutput {
  readonly asset: PreparedAsset;
  readonly output: Output;
}

export type PrepareStagedResult =
  | (PreparedOutput & {
      readonly ok: true;
      readonly stagedFileId: string;
      readonly stagedSource: string;
    })
  | { readonly ok: false; readonly reason: "unknown-staged-file" | "still-copying" };

export function prepareStagedFile(
  deps: RevisionDeps,
  input: Omit<AttachInput, "retainStaged">,
): PrepareStagedResult {
  const staged = stagedFileById(deps.db, input.stagedFileId);
  if (staged === undefined) return { ok: false, reason: "unknown-staged-file" };
  if (staged.state !== "staged") return { ok: false, reason: "still-copying" };
  const index = input.index ?? 1;
  const filename = basename(
    outputFileName(input.role, index, extensionOf(staged.originalFilename), staged.stageKind),
  );
  const stagedSource = stagingPath(deps.paths, staged.path);
  const pending = allocateAsset(deps, input.projectId, filename);
  try {
    copyFileSync(stagedSource, pending.absolutePath, constants.COPYFILE_EXCL);
    const asset = sealAsset(deps, pending);
    return {
      ok: true,
      asset,
      stagedFileId: staged.id,
      stagedSource,
      output: {
        id: deps.ids.next(),
        projectId: input.projectId,
        stageKind: staged.stageKind,
        role: input.role,
        path: asset.path,
        originalFilename: staged.originalFilename,
        bytes: asset.bytes,
        durationMs: null,
        meta: input.role === "image" ? { index } : {},
        createdAt: asset.createdAt,
      },
    };
  } catch (error) {
    discardPreparedAssets(deps, [pending]);
    throw error;
  }
}

export function prepareText(deps: RevisionDeps, input: TextInput): PreparedOutput {
  const filename = basename(outputFileName(input.role, 1, ".txt", input.stageKind));
  const asset = writeAsset(deps, input.projectId, filename, Buffer.from(input.text, "utf8"));
  try {
    return {
      asset,
      output: {
        id: deps.ids.next(),
        projectId: input.projectId,
        stageKind: input.stageKind,
        role: input.role,
        path: asset.path,
        originalFilename: null,
        bytes: asset.bytes,
        durationMs: null,
        meta: {},
        createdAt: asset.createdAt,
      },
    };
  } catch (error) {
    discardPreparedAssets(deps, [asset]);
    throw error;
  }
}
