import type { Log } from "../../kernel/log.js";
import type { Format } from "../../kernel/pipeline.js";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import { castImageMaxBytes, castImagesPerMember, sniffImage, storeImageBlob } from "./images.js";
import type { CastImage, CastKind, ChannelDeps, ChannelResult } from "./model.js";
import { castMemberById } from "./repo.js";
import { castGenerateSchema } from "./schema.js";

// Makes one picture from a prompt, with the provider's own retries; `main.ts` builds it from
// the image registry. A cast picture belongs to no project, so no stage records its attempts;
// its cost lands on Home's run cost against the member's channel.
export type CastImageGenerator = (request: {
  readonly channelId: string;
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly aspect: Format;
}) => Promise<GeneratedImage>;

export interface CastImageDeps extends ChannelDeps {
  readonly generateImage?: CastImageGenerator | undefined;
  readonly log?: Log | undefined;
}

export function uploadCastImage(
  deps: ChannelDeps,
  memberId: string,
  bytes: Uint8Array,
): ChannelResult<CastImage> {
  const room = roomFor(deps, memberId);
  if (!room.ok) return room;
  if (bytes.byteLength > castImageMaxBytes)
    return {
      ok: false,
      reason: "not-an-image",
      message: `This picture is larger than ${String(castImageMaxBytes / 1024 / 1024)} MB. Save it smaller (for example as a JPEG) and upload it again.`,
    };
  const mime = sniffImage(bytes);
  if (mime === undefined)
    return {
      ok: false,
      reason: "not-an-image",
      message: "This file is not a PNG or JPEG picture. Upload a PNG or JPEG file.",
    };
  const at = deps.clock.now().toISOString();
  const sha256 = storeImageBlob(deps.db, bytes, mime, at);
  const id = deps.uuid();
  deps.db
    .prepare(
      "INSERT INTO cast_images(id,member_id,source,prompt,state,error,sha256,created_at) VALUES (?,?,'upload',NULL,'ready',NULL,?,?)",
    )
    .run(id, memberId, sha256, at);
  return { ok: true, value: imageRow(deps, id) };
}

// Adds a row in "generating" and returns it at once; the picture lands in the row when the
// provider answers, or the row turns "failed" with the reason. Characters and creatures are
// drawn upright, places and objects wide.
export function generateCastImage(
  deps: CastImageDeps,
  memberId: string,
  input: unknown,
): ChannelResult<CastImage> {
  const parsed = castGenerateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const room = roomFor(deps, memberId);
  if (!room.ok) return room;
  const generate = deps.generateImage;
  if (generate === undefined) return { ok: false, reason: "no-image-provider" };
  const id = deps.uuid();
  deps.db
    .prepare(
      "INSERT INTO cast_images(id,member_id,source,prompt,state,error,sha256,created_at) VALUES (?,?,'generate',?,'generating',NULL,NULL,?)",
    )
    .run(id, memberId, parsed.data.prompt, deps.clock.now().toISOString());
  void generate({
    ...parsed.data,
    channelId: room.value.channelId,
    aspect: aspectOf(room.value.kind),
  }).then(
    (image) => {
      const mime = sniffImage(image.bytes);
      if (mime === undefined || image.bytes.byteLength > castImageMaxBytes) {
        fail(
          deps,
          id,
          "The provider answered with something that is not a usable PNG or JPEG picture. Press Generate again, or upload a picture instead.",
        );
        return;
      }
      const sha256 = storeImageBlob(deps.db, image.bytes, mime, deps.clock.now().toISOString());
      deps.db
        .prepare("UPDATE cast_images SET state='ready',sha256=? WHERE id=? AND state='generating'")
        .run(sha256, id);
    },
    (error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      deps.log?.write("warn", "channels.cast-image.failed", { detail: reason.slice(0, 500) });
      fail(
        deps,
        id,
        `The picture couldn't be made: ${reason.slice(0, 500)} Check the image provider in Settings → Providers, then press Generate again.`,
      );
    },
  );
  return { ok: true, value: imageRow(deps, id) };
}

export function deleteCastImage(
  deps: Pick<ChannelDeps, "db">,
  memberId: string,
  imageId: string,
): ChannelResult<{ readonly deleted: true }> {
  // The bytes stay: a project started with this picture still names it.
  const changed = deps.db
    .prepare("DELETE FROM cast_images WHERE id=? AND member_id=?")
    .run(imageId, memberId);
  return Number(changed.changes) === 0
    ? { ok: false, reason: "not-found" }
    : { ok: true, value: { deleted: true } };
}

// A picture still being made when Slopify stopped will never land.
export function settleInterruptedCastImages(deps: Pick<ChannelDeps, "db">): number {
  const changed = deps.db
    .prepare(
      "UPDATE cast_images SET state='failed',error='Slopify stopped before this picture was finished. Press Generate again.' WHERE state='generating'",
    )
    .run();
  return Number(changed.changes);
}

function roomFor(
  deps: Pick<ChannelDeps, "db">,
  memberId: string,
): ChannelResult<{ readonly kind: CastKind; readonly channelId: string }> {
  const member = castMemberById(deps.db, memberId);
  if (member === undefined) return { ok: false, reason: "not-found" };
  if (member.images.filter((image) => image.state !== "failed").length >= castImagesPerMember)
    return {
      ok: false,
      reason: "too-many-images",
      message: `${member.name} already has ${String(castImagesPerMember)} pictures. Delete one before adding another.`,
    };
  return { ok: true, value: { kind: member.kind, channelId: member.channelId } };
}

function aspectOf(kind: CastKind): Format {
  return kind === "character" || kind === "creature" ? "9:16" : "16:9";
}

function fail(deps: Pick<ChannelDeps, "db">, id: string, error: string): void {
  deps.db
    .prepare("UPDATE cast_images SET state='failed',error=? WHERE id=? AND state='generating'")
    .run(error, id);
}

function imageRow(deps: Pick<ChannelDeps, "db">, id: string): CastImage {
  const row = deps.db.prepare("SELECT member_id FROM cast_images WHERE id=?").get(id);
  const member = castMemberById(deps.db, String(row?.member_id));
  const image = member?.images.find((value) => value.id === id);
  if (image === undefined) throw new Error("The cast picture could not be read back");
  return image;
}
