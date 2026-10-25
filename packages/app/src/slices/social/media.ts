// Which files a post carries, in the shape its site wants them. Pure: the sources come from
// the project's outputs (`sources.ts`); a reshaped picture or a design's render is made the
// first time it is asked for (`reshape.ts`), so listing a pack never draws anything.

import { editSettings } from "../../kernel/ports/settings-places.js";
import type { DesignFormat } from "../designs/model.js";
import { limitsFor } from "./limits.js";
import {
  type MediaShape,
  type PostMedia,
  type PostMediaChoice,
  type PostWarning,
  platformLabels,
  type SocialPlatform,
} from "./model.js";

export interface SourceFile {
  // The project's asset name (`storage/asset-name.ts`).
  readonly asset: string;
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: number;
}

export interface MediaSources {
  readonly projectId: string;
  readonly format: "16:9" | "9:16" | "1:1";
  readonly long: (SourceFile & { readonly seconds: number | null }) | null;
  readonly shorts: readonly {
    readonly number: number;
    readonly file: (SourceFile & { readonly seconds: number | null }) | null;
  }[];
  readonly thumbnail: SourceFile | null;
  readonly pictures: readonly (SourceFile & { readonly alt?: string | undefined })[];
  readonly designs: readonly { readonly id: string; readonly name: string }[];
}

const shapeSlugs: Readonly<Record<Exclude<MediaShape, "original">, string>> = {
  "1:1": "1x1",
  "4:5": "4x5",
  "9:16": "9x16",
  "16:9": "16x9",
};

// A design's format on each site: portrait on Instagram, a story on TikTok, square elsewhere.
export function designFormatFor(platform: SocialPlatform): DesignFormat {
  return platform === "instagram" ? "portrait" : platform === "tiktok" ? "story" : "square";
}

const designShapes: Readonly<Partial<Record<DesignFormat, MediaShape>>> = {
  portrait: "4:5",
  story: "9:16",
  square: "1:1",
};

// The file names the media routes take: the asset itself, `<asset>--4x5` for a reshaped copy,
// and `design--<id>--<format>` for a design's render.
export function mediaFile(asset: string, shape: MediaShape): string {
  return shape === "original" ? asset : `${asset}--${shapeSlugs[shape]}`;
}

export type MediaRef =
  | { readonly kind: "asset"; readonly asset: string; readonly shape: MediaShape }
  | { readonly kind: "design"; readonly id: string; readonly format: DesignFormat };

export function parseMediaFile(file: string): MediaRef | undefined {
  const design = /^design--([A-Za-z0-9_-]{1,64})--([a-z0-9]+)$/u.exec(file);
  if (design !== null) {
    const format = Object.keys(designShapes).find((one) => one === design[2]);
    return format === undefined || design[1] === undefined
      ? undefined
      : { kind: "design", id: design[1], format: format as DesignFormat };
  }
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:--([0-9]+x[0-9]+))?$/u.exec(file);
  if (match === null || match[1] === undefined) return undefined;
  if (match[2] === undefined) return { kind: "asset", asset: match[1], shape: "original" };
  const shape = (Object.keys(shapeSlugs) as Exclude<MediaShape, "original">[]).find(
    (one) => shapeSlugs[one] === match[2],
  );
  return shape === undefined ? undefined : { kind: "asset", asset: match[1], shape };
}

const url = (projectId: string, file: string) => `/api/social/media/${projectId}/${file}`;

function still(
  sources: MediaSources,
  kind: "thumbnail" | "picture",
  source: SourceFile & { readonly alt?: string | undefined },
  shape: MediaShape,
): PostMedia {
  const file = mediaFile(source.asset, shape);
  const reshaped = shape !== "original";
  return {
    kind,
    file,
    url: url(sources.projectId, file),
    filename: reshaped
      ? `${source.filename.replace(/\.[^.]+$/u, "")}-${shapeSlugs[shape as "4:5"]}.jpg`
      : source.filename,
    contentType: reshaped ? "image/jpeg" : source.contentType,
    bytes: reshaped ? null : source.bytes,
    shape,
    ...(source.alt === undefined ? {} : { alt: source.alt }),
  };
}

// The post's files in the order the site shows them: the video first, then the pictures.
export function mediaFor(
  platform: SocialPlatform,
  choice: PostMediaChoice,
  sources: MediaSources,
): { readonly media: readonly PostMedia[]; readonly warnings: readonly PostWarning[] } {
  const media: PostMedia[] = [];
  const warnings: PostWarning[] = [];
  const site = platformLabels[platform];
  const missing = (sentence: string) => warnings.push({ code: "media-missing", sentence });
  const shape = limitsFor(platform).pictureShape;

  if (choice.video === "long") {
    if (sources.long === null)
      missing(
        "The video isn't made yet. Let the Video stage finish (or use Continue the run on the project page), then open Copy for YouTube Studio again.",
      );
    else
      media.push({
        kind: "video",
        file: sources.long.asset,
        url: url(sources.projectId, sources.long.asset),
        filename: sources.long.filename,
        contentType: sources.long.contentType,
        bytes: sources.long.bytes,
        shape: sources.format,
        ...(sources.long.seconds === null ? {} : { seconds: sources.long.seconds }),
      });
  } else if (choice.video === "short") {
    const number = choice.short ?? 1;
    const short = sources.shorts.find((one) => one.number === number);
    if (short?.file == null)
      missing(
        short === undefined
          ? `This project has no short ${String(number)}. Pick another short for ${site} in the post's media, or turn on Shorts in ${editSettings.shorts}.`
          : `Short ${String(number)} isn't rendered yet. Let the Video stage finish, then open Copy for YouTube Studio again.`,
      );
    else
      media.push({
        kind: "short",
        file: short.file.asset,
        url: url(sources.projectId, short.file.asset),
        filename: short.file.filename,
        contentType: short.file.contentType,
        bytes: short.file.bytes,
        shape: "9:16",
        ...(short.file.seconds === null ? {} : { seconds: short.file.seconds }),
      });
  }

  if (choice.thumbnail === true) {
    if (sources.thumbnail === null)
      missing(
        `The thumbnail isn't made yet. Let the Thumbnail stage finish, or set Thumbnail source in ${editSettings.outputs}.`,
      );
    else media.push(still(sources, "thumbnail", sources.thumbnail, shape));
  }

  const wanted = choice.pictures ?? 0;
  if (wanted > 0) {
    if (sources.pictures.length === 0)
      missing(
        "This project has no pictures yet. Let the Images stage finish, or pick other media for this post.",
      );
    for (const picture of sources.pictures.slice(0, wanted))
      media.push(still(sources, "picture", picture, shape));
  }

  const format = designFormatFor(platform);
  for (const id of choice.designs ?? []) {
    if (!sources.designs.some((design) => design.id === id)) {
      missing(
        "A design picked for this post is gone or belongs to another project. Pick the post's designs again.",
      );
      continue;
    }
    const file = `design--${id}--${format}`;
    media.push({
      kind: "design",
      file,
      url: url(sources.projectId, file),
      filename: `design-${id}-${format}.png`,
      contentType: "image/png",
      bytes: null,
      shape: designShapes[format] ?? "original",
    });
  }
  return { media, warnings };
}
