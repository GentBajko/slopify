import { readFileSync } from "node:fs";
import { castImageMaxBytes, sniffImage } from "../channels/images.js";
import { imageBlob } from "../channels/repo.js";
import { stagingPath } from "../storage/layout.js";
import { stagedFileById } from "../storage/repo.js";
import type { DesignResult } from "./model.js";
import { pictureSize } from "./picture-size.js";
import type { CreateDesignInput } from "./requests.js";
import type { DesignDeps } from "./service.js";

// The picture a design starts from: an upload (PNG or JPEG up to 10 MB) or a version another
// design already has.

export interface Picture {
  readonly bytes: Uint8Array;
  readonly mime: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly stagedId?: string | undefined;
}

export function readPicture(bytes: Uint8Array): DesignResult<Omit<Picture, "stagedId">> {
  if (bytes.byteLength > castImageMaxBytes)
    return {
      ok: false,
      reason: "not-an-image",
      message: `This picture is larger than ${String(castImageMaxBytes / 1024 / 1024)} MB. Save it smaller (for example as a JPEG) and upload it again.`,
    };
  const mime = sniffImage(bytes);
  const size = mime === undefined ? undefined : pictureSize(bytes);
  if (mime === undefined || size === undefined)
    return {
      ok: false,
      reason: "not-an-image",
      message:
        "This file is not a PNG or JPEG picture Slopify can read. Upload a PNG or JPEG file.",
    };
  return { ok: true, value: { bytes, mime, ...size } };
}

export function startingPicture(
  deps: DesignDeps,
  input: CreateDesignInput,
): DesignResult<Picture | undefined> {
  if (input.stagedFileId !== undefined) {
    const staged = stagedFileById(deps.db, input.stagedFileId);
    if (staged === undefined)
      return {
        ok: false,
        reason: "upload-gone",
        message: "The uploaded picture is gone. Upload it again.",
      };
    if (staged.state !== "staged")
      return {
        ok: false,
        reason: "still-uploading",
        message: "The picture is still uploading. Wait for it to finish, then try again.",
      };
    if (staged.bytes > castImageMaxBytes) return readPicture(new Uint8Array(castImageMaxBytes + 1));
    const read = readPicture(new Uint8Array(readFileSync(stagingPath(deps.paths, staged.path))));
    return read.ok ? { ok: true, value: { ...read.value, stagedId: staged.id } } : read;
  }
  if (input.fromStepSha !== undefined) {
    const blob = imageBlob(deps.db, input.fromStepSha);
    if (blob === undefined)
      return {
        ok: false,
        reason: "not-found",
        message:
          "That picture is no longer kept. Choose another version, or upload the picture again.",
      };
    return readPicture(blob.bytes);
  }
  return { ok: true, value: undefined };
}
