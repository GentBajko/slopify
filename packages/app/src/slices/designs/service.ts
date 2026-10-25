import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import { errorText } from "../../kernel/errors.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { liveProject } from "../admission/repo.js";
import { storeImageBlob } from "../channels/images.js";
import { defaultChannelId } from "../channels/model.js";
import { imageBlob } from "../channels/repo.js";
import { releaseStagedFile } from "../storage/staging-refs.js";
import { notTemplateSample } from "../template-studio/repo.js";
import type { DesignEvent, DesignResult, DesignView } from "./model.js";
import { readPicture, startingPicture } from "./pictures.js";
import { designById, designByMutation, insertDesign, listDesigns, updateDesign } from "./repo.js";
import { createDesignSchema, setHeadSchema, updateDesignSchema } from "./requests.js";
import { insertStep, stepById, stepsOf } from "./steps-repo.js";

export interface DesignDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly paths: Paths;
  readonly log: Log;
  readonly emit?: ((event: DesignEvent) => void) | undefined;
}

export const changedMessage =
  "This design changed in another tab or by an agent. Reload it to see the change, then make yours again.";
export const reusedMessage =
  "This request id was already used for a different change. Reload the page and try again.";
const notFound = {
  ok: false,
  reason: "not-found",
  message: "This design no longer exists. Go back to Designs to choose another.",
} as const;

export function mutationHash(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function designView(db: DatabaseSync, id: string): DesignView | undefined {
  const design = designById(db, id);
  if (design === undefined || design.deletedAt !== null) return undefined;
  return { ...design, steps: stepsOf(db, id) };
}

export function listDesignViews(db: DatabaseSync, projectId?: string): readonly DesignView[] {
  return listDesigns(db, { projectId }).map((design) => ({
    ...design,
    steps: stepsOf(db, design.id),
  }));
}

export function getDesign(deps: Pick<DesignDeps, "db">, id: string): DesignResult<DesignView> {
  const view = designView(deps.db, id);
  return view === undefined ? notFound : { ok: true, value: view };
}

function emit(deps: DesignDeps, designId: string): void {
  try {
    deps.emit?.({ type: "design.changed", designId });
  } catch (error) {
    deps.log.write("warn", "designs.emit", { detail: errorText(error) });
  }
}

export function createDesign(deps: DesignDeps, raw: unknown): DesignResult<DesignView> {
  const parsed = createDesignSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid",
      message: `The design can't be made: ${parsed.error.issues[0]?.message ?? "a field is missing"}.`,
    };
  const input = parsed.data;
  const { mutationId, ...rest } = input;
  const hash = mutationHash(rest);
  const replay = designByMutation(deps.db, mutationId);
  if (replay !== undefined) {
    if (replay.hash !== hash)
      return { ok: false, reason: "mutation-reused", message: reusedMessage };
    const view = designView(deps.db, replay.design.id);
    return view === undefined ? notFound : { ok: true, value: view };
  }
  if (designById(deps.db, input.id) !== undefined)
    return { ok: false, reason: "mutation-reused", message: reusedMessage };
  const channelId = input.channelId ?? defaultChannelId;
  if (deps.db.prepare("SELECT 1 FROM channels WHERE id=?").get(channelId) === undefined)
    return {
      ok: false,
      reason: "channel-not-found",
      message: "That channel no longer exists. Choose another channel, then press Make again.",
    };
  if (input.projectId !== undefined && !projectExists(deps.db, input.projectId))
    return {
      ok: false,
      reason: "project-not-found",
      message:
        "That project no longer exists or is in the trash. Choose another project, or leave it out.",
    };
  if (input.kind === "design" && input.document === undefined)
    return {
      ok: false,
      reason: "invalid",
      message:
        "A designed piece needs its settings. Choose its picture, text and formats, then press Make.",
    };
  const picture = startingPicture(deps, input);
  if (!picture.ok) return picture;
  if (input.kind === "edit" && picture.value === undefined)
    return {
      ok: false,
      reason: "invalid",
      message: "An edit starts from a picture. Upload a PNG or JPEG, then press Edit.",
    };
  const at = deps.clock.now().toISOString();
  transact(deps.db, () => {
    insertDesign(deps.db, {
      id: input.id,
      kind: input.kind,
      name: input.name,
      channelId,
      projectId: input.projectId ?? null,
      document: input.document ?? null,
      values: input.values ?? {},
      mutationId,
      mutationHash: hash,
      at,
    });
    const start = picture.value;
    if (start === undefined) return;
    const sha256 = storeImageBlob(deps.db, start.bytes, start.mime, at);
    const step = insertStep(deps.db, {
      id: deps.ids.next(),
      designId: input.id,
      parentId: null,
      kind: "upload",
      instruction: null,
      provider: null,
      model: null,
      inputs: { castMemberIds: [] },
      state: "ready",
      sha256,
      width: start.width,
      height: start.height,
      mutationId: null,
      mutationHash: null,
      at,
    });
    updateDesign(deps.db, input.id, undefined, { headStepId: step.id }, at);
  });
  // The upload's bytes now live in image_blobs; the staging copy is let go once committed.
  const stagedId = picture.value?.stagedId;
  if (stagedId !== undefined)
    releaseStagedFile(
      {
        db: deps.db,
        paths: deps.paths,
        ids: deps.ids,
        clock: deps.clock,
        log: deps.log,
        emit: () => {},
      },
      stagedId,
    );
  emit(deps, input.id);
  const view = designView(deps.db, input.id);
  return view === undefined ? notFound : { ok: true, value: view };
}

function projectExists(db: DatabaseSync, id: string): boolean {
  // A template's studio sample is the studio's alone: no design can be linked to it.
  return (
    db
      .prepare(`SELECT 1 FROM projects WHERE id=? AND ${liveProject()} AND ${notTemplateSample()}`)
      .get(id) !== undefined
  );
}

export function updateDesignRecord(
  deps: DesignDeps,
  id: string,
  raw: unknown,
): DesignResult<DesignView> {
  const parsed = updateDesignSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid",
      message: `The change can't be saved: ${parsed.error.issues[0]?.message ?? "a field is missing"}.`,
    };
  const input = parsed.data;
  const current = designView(deps.db, id);
  if (current === undefined) return notFound;
  if (
    input.projectId !== undefined &&
    input.projectId !== null &&
    !projectExists(deps.db, input.projectId)
  )
    return {
      ok: false,
      reason: "project-not-found",
      message: "That project no longer exists or is in the trash. Choose another project.",
    };
  const saved = updateDesign(
    deps.db,
    id,
    input.baseUpdatedAt,
    {
      name: input.name,
      projectId: input.projectId,
      // Turning an edit into a designed piece is giving it a document.
      ...(input.document === undefined
        ? {}
        : { document: input.document, kind: "design" as const }),
      values: input.values,
    },
    deps.clock.now().toISOString(),
  );
  if (!saved) return { ok: false, reason: "changed", message: changedMessage, current };
  emit(deps, id);
  const view = designView(deps.db, id);
  return view === undefined ? notFound : { ok: true, value: view };
}

// "Continue from this version": free, it only moves which version the next edit starts from.
export function setDesignHead(
  deps: DesignDeps,
  id: string,
  raw: unknown,
): DesignResult<DesignView> {
  const parsed = setHeadSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, reason: "invalid", message: "Choose a version to continue from." };
  if (designView(deps.db, id) === undefined) return notFound;
  const step = stepById(deps.db, parsed.data.stepId);
  if (step === undefined || step.designId !== id)
    return {
      ok: false,
      reason: "not-found",
      message: "That version is no longer in this design. Reload the page.",
    };
  if (step.state !== "ready")
    return {
      ok: false,
      reason: "not-ready",
      message: "That version has no picture yet. Wait for it to finish, or press Try again on it.",
    };
  updateDesign(deps.db, id, undefined, { headStepId: step.id }, deps.clock.now().toISOString());
  emit(deps, id);
  const view = designView(deps.db, id);
  return view === undefined ? notFound : { ok: true, value: view };
}

export function stepPicture(
  db: DatabaseSync,
  designId: string,
  stepId: string,
): { readonly bytes: Uint8Array; readonly mime: "image/png" | "image/jpeg" } | undefined {
  const step = stepById(db, stepId);
  if (step === undefined || step.designId !== designId || step.sha256 === null) return undefined;
  if (designView(db, designId) === undefined) return undefined;
  return imageBlob(db, step.sha256);
}

// A picture sent as bytes (an agent's upload_design_picture): kept in image_blobs, answered with
// the hash a new design starts from (`fromStepSha`).
export function storeUploadedPicture(
  deps: Pick<DesignDeps, "db" | "clock">,
  bytes: Uint8Array,
): DesignResult<{
  readonly sha256: string;
  readonly mime: "image/png" | "image/jpeg";
  readonly width: number;
  readonly height: number;
}> {
  const read = readPicture(bytes);
  if (!read.ok) return read;
  const sha256 = storeImageBlob(
    deps.db,
    read.value.bytes,
    read.value.mime,
    deps.clock.now().toISOString(),
  );
  return {
    ok: true,
    value: { sha256, mime: read.value.mime, width: read.value.width, height: read.value.height },
  };
}
