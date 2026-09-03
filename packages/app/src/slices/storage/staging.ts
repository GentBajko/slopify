import type { WriteStream } from "node:fs";
import { copyFileSync, createWriteStream, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { extensionOf, outputFileName, outputPath, stagingPath } from "./layout.js";
import type {
  EmitStaging,
  Output,
  OutputRole,
  StagedFile,
  StageKind,
  StagingEvent,
} from "./model.js";
import {
  deleteStagedFile,
  insertOutput,
  insertStagedFile,
  markStagedFileCopied,
  stagedFileById,
} from "./repo.js";

export interface StorageDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
  readonly emit: EmitStaging;
}

export interface UploadInput {
  readonly stageKind: StageKind;
  readonly originalFilename: string;
  readonly content: AsyncIterable<Uint8Array>;
}

export type StageUploadResult =
  | { readonly ok: true; readonly file: StagedFile }
  | { readonly ok: false; readonly reason: "unsafe-filename" | "empty-file" };

export interface AttachInput {
  readonly stagedFileId: string;
  readonly projectId: string;
  readonly role: OutputRole;
  readonly index?: number | undefined;
}

export type AttachResult =
  | {
      readonly ok: true;
      readonly output: Output;
      // The staging file the copy came from. It is still there: only the caller knows
      // when its own transaction has committed, and until then the upload is the only
      // copy that survives a rollback. Hand it to dropStagedSource afterwards.
      readonly stagedSource: string;
    }
  | { readonly ok: false; readonly reason: "unknown-staged-file" | "still-copying" };

export type DiscardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "unknown-staged-file" };

// The upload's own name is data, never a path component: the file is stored under a
// generated id, and anything with a separator, a traversal, or a control character is
// refused rather than sanitised, so nothing silently lands under a name nobody chose.
const filename = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((name) => !name.includes("/") && !name.includes("\\"))
  .refine((name) => name !== "." && name !== "..")
  .refine((name) => ![...name].some((character) => (character.codePointAt(0) ?? 0) < 0x20));

// ceiling: progress is coalesced to one event per 200 ms per upload. A page that wants
// a smoother bar reads bytes from the staging list instead of asking for more events.
const progressIntervalMs = 200;

export async function stageUpload(
  deps: StorageDeps,
  input: UploadInput,
): Promise<StageUploadResult> {
  const named = filename.safeParse(input.originalFilename);
  if (!named.success) {
    return { ok: false, reason: "unsafe-filename" };
  }
  const originalFilename = named.data;

  const id = deps.ids.next();
  const target = stagingPath(deps.paths, id);
  const file: StagedFile = {
    id,
    stageKind: input.stageKind,
    path: id,
    originalFilename,
    bytes: 0,
    state: "copying",
    createdAt: deps.clock.now().toISOString(),
  };
  // The row exists before the first byte, so a process that dies mid-copy leaves a
  // record reconcile collects rather than an untracked file.
  insertStagedFile(deps.db, file);

  let bytes = 0;
  let lastEmit = 0;
  const notify = (event: StagingEvent): void => {
    // Nothing about progress delivery may abort the write: a page that navigated away
    // is not a reason to lose the upload it started.
    try {
      deps.emit(event);
    } catch (error) {
      deps.log.write("warn", "staging.emit", { detail: messageOf(error) });
    }
  };
  const progress = (state: StagedFile["state"]): void => {
    notify({
      type: "staging.progress",
      stagedFileId: id,
      stageKind: input.stageKind,
      originalFilename,
      bytes,
      state,
    });
  };

  async function* counted(): AsyncGenerator<Uint8Array> {
    for await (const chunk of input.content) {
      yield chunk;
      bytes += chunk.byteLength;
      const at = deps.clock.now().getTime();
      if (at - lastEmit >= progressIntervalMs) {
        lastEmit = at;
        progress("copying");
      }
    }
  }

  const sink = createWriteStream(target, { mode: 0o600, flags: "wx" });
  try {
    await pipeline(counted(), sink);
  } catch (error) {
    // pipeline rejects the moment the source throws, which can be before the file the
    // write stream is opening exists. Removing it first would leave the stray file the
    // reconcile has to collect at the next boot, so the close is waited for.
    await closed(sink);
    discard(deps, id, target, "staging.aborted");
    notify({
      type: "staging.failed",
      stagedFileId: id,
      stageKind: input.stageKind,
      originalFilename,
      detail: messageOf(error),
    });
    deps.log.write("error", "staging.failed", {
      detail: `${id} ${originalFilename}: ${messageOf(error)}`,
    });
    throw error;
  }

  if (bytes === 0) {
    discard(deps, id, target, "staging.empty");
    return { ok: false, reason: "empty-file" };
  }

  markStagedFileCopied(deps.db, id, bytes);
  progress("staged");
  return { ok: true, file: { ...file, bytes, state: "staged" } };
}

export function attachStagedFile(deps: StorageDeps, input: AttachInput): AttachResult {
  const staged = stagedFileById(deps.db, input.stagedFileId);
  if (staged === undefined) {
    return { ok: false, reason: "unknown-staged-file" };
  }
  // A run never starts with provided content that is still copying.
  if (staged.state !== "staged") {
    return { ok: false, reason: "still-copying" };
  }

  const index = input.index ?? 1;
  const name = outputFileName(
    input.role,
    index,
    extensionOf(staged.originalFilename),
    staged.stageKind,
  );
  const target = outputPath(deps.paths, input.projectId, name);
  const source = stagingPath(deps.paths, staged.path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  // Copied, not renamed. A rename cannot be undone when the caller's transaction rolls
  // back, so a run that failed on its fourth file would have left the first three with
  // restored staged_files rows pointing at files that had already moved, and every retry
  // of the same form would fail the same way. Copying also survives a staging directory
  // mounted separately from projects/, which a rename cannot (EXDEV).
  copyFileSync(source, target);

  const output: Output = {
    id: deps.ids.next(),
    projectId: input.projectId,
    stageKind: staged.stageKind,
    role: input.role,
    path: name,
    originalFilename: staged.originalFilename,
    bytes: staged.bytes,
    durationMs: null,
    meta: input.role === "image" ? { index } : {},
    createdAt: deps.clock.now().toISOString(),
  };
  // The file already moved. If this fails the file is under projects/ with no row, which is
  // exactly what the boot reconcile collects. A savepoint rather than BEGIN, so startRun can
  // attach several files inside the one transaction that creates the project.
  try {
    transact(deps.db, () => {
      insertOutput(deps.db, output);
      deleteStagedFile(deps.db, staged.id);
    });
  } catch (error) {
    deps.log.write("error", "storage.attach", {
      projectId: input.projectId,
      detail: `${staged.id} → ${name}: ${messageOf(error)}`,
    });
    throw error;
  }
  return { ok: true, output, stagedSource: source };
}

// The other half of attachStagedFile: called once the transaction that attached the file
// has committed. A failure here is not worth failing the run over, because the file is a
// duplicate of one the project already holds and the next boot's reconcile clears it.
export function dropStagedSource(deps: StorageDeps, source: string): void {
  try {
    rmSync(source, { force: true });
  } catch (error) {
    deps.log.write("warn", "staging.source", { detail: `${source}: ${messageOf(error)}` });
  }
}

// Writing text needs no staging channel, because the progress events belong to uploads.
// Named separately so a stage that only stores its own output - the research notes - can
// call this without inventing an emitter.
export type TextStoreDeps = Omit<StorageDeps, "emit">;

export interface TextInput {
  readonly projectId: string;
  readonly stageKind: StageKind;
  readonly role: OutputRole;
  readonly text: string;
}

// A stage set to Provide can carry pasted text instead of a file, and the project holds it as
// an output like any other. Unlike an attached upload this needs no two-phase dance: the text
// came in on the request, so a rollback loses nothing the caller cannot write again, and the
// file left under a project id that was rolled back is an orphan the boot reconcile removes.
// ceiling: the paste is stored as typed. Markdown syntax still has to be stripped for the
// narration source; that reduction belongs to the narration slice that reads this file.
export function storeText(deps: TextStoreDeps, input: TextInput): Output {
  const name = outputFileName(input.role, 1, ".txt", input.stageKind);
  const target = outputPath(deps.paths, input.projectId, name);
  const bytes = Buffer.from(input.text, "utf8");
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  writeFileSync(target, bytes, { mode: 0o600 });
  const output: Output = {
    id: deps.ids.next(),
    projectId: input.projectId,
    stageKind: input.stageKind,
    role: input.role,
    path: name,
    originalFilename: null,
    bytes: bytes.byteLength,
    durationMs: null,
    meta: {},
    createdAt: deps.clock.now().toISOString(),
  };
  insertOutput(deps.db, output);
  return output;
}

export function discardStagedFile(deps: StorageDeps, id: string): DiscardResult {
  const staged = stagedFileById(deps.db, id);
  if (staged === undefined) {
    return { ok: false, reason: "unknown-staged-file" };
  }
  discard(deps, id, stagingPath(deps.paths, staged.path), "staging.discarded");
  return { ok: true };
}

function discard(deps: StorageDeps, id: string, target: string, event: string): void {
  try {
    rmSync(target, { force: true });
  } catch (error) {
    // The row stays `copying`, so the next boot's reconcile removes the file instead.
    deps.log.write("warn", event, { detail: `${id}: ${messageOf(error)}` });
    return;
  }
  deleteStagedFile(deps.db, id);
}

function closed(sink: WriteStream): Promise<void> {
  return sink.closed
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        sink.once("close", resolve);
      });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
