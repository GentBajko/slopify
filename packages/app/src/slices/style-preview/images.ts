import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import { imageBlob } from "../channels/repo.js";
import { outputPath, stagingPath } from "../storage/layout.js";
import { outputById, stagedFileById } from "../storage/repo.js";
import type { StylePreviewImage } from "./schema.js";

// The picture a preview is drawn on, read from where Slopify keeps it: a staged upload, a
// project's output or a cast picture. Only real PNG, JPEG or WebP pictures are handed to
// ffmpeg; anything else, or a file that is gone, is undefined and the preview uses its stills.

export interface PreviewPicture {
  readonly bytes: Uint8Array;
  // With the dot, from the picture's own bytes, so ffmpeg reads it by the right demuxer.
  readonly extension: ".png" | ".jpg" | ".webp";
  readonly sha256: string;
}

export type PreviewPictures = (image: StylePreviewImage) => PreviewPicture | undefined;

// ceiling: a provider's image or an upload is a few MB; anything this large is not a picture
// worth reading into memory for a 270-pixel preview.
const maxBytes = 40 * 1024 * 1024;

// Roles whose file is a single still picture.
const pictureRoles = new Set(["reference", "image", "thumbnail", "short_image"]);

export function previewPictures(deps: {
  readonly db: DatabaseSync;
  readonly paths: Paths;
}): PreviewPictures {
  return (image) => {
    try {
      const bytes = read(deps, image);
      if (bytes === undefined) return undefined;
      const extension = pictureExtension(bytes);
      if (extension === undefined) return undefined;
      return { bytes, extension, sha256: createHash("sha256").update(bytes).digest("hex") };
    } catch {
      return undefined;
    }
  };
}

function read(
  deps: { readonly db: DatabaseSync; readonly paths: Paths },
  image: StylePreviewImage,
): Uint8Array | undefined {
  switch (image.kind) {
    case "picture":
      return imageBlob(deps.db, image.sha256)?.bytes;
    case "upload": {
      const staged = stagedFileById(deps.db, image.stagedFileId);
      if (staged === undefined || staged.state !== "staged") return undefined;
      return readSmall(stagingPath(deps.paths, staged.id));
    }
    case "output": {
      const output = outputById(deps.db, image.outputId);
      if (output === undefined || !pictureRoles.has(output.role)) return undefined;
      return readSmall(outputPath(deps.paths, output.projectId, output.path));
    }
  }
}

function readSmall(path: string): Uint8Array | undefined {
  const size = statSync(path).size;
  if (size === 0 || size > maxBytes) return undefined;
  return new Uint8Array(readFileSync(path));
}

export function pictureExtension(bytes: Uint8Array): PreviewPicture["extension"] | undefined {
  const starts = (...values: readonly number[]) => values.every((value, at) => bytes[at] === value);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return ".png";
  if (starts(0xff, 0xd8, 0xff)) return ".jpg";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return ".webp";
  return undefined;
}
