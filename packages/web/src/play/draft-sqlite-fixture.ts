import { randomUUID } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "@app/kernel/db/index.js";
import { ulidIds } from "@app/kernel/ids.js";
import { ensureDirs, layout } from "@app/kernel/paths.js";
import type { DraftDeps, DraftResult, DraftView } from "@app/slices/play-drafts/model.js";
import {
  createDraftInputSchema,
  forkDraftInputSchema,
  saveDraftInputSchema,
} from "@app/slices/play-drafts/schema.js";
import { createDraft, forkDraft, readDraft, saveDraft } from "@app/slices/play-drafts/service.js";
import { stagingPath } from "@app/slices/storage/layout.js";
import { insertStagedFile } from "@app/slices/storage/repo.js";
import { type Answer, jsonAnswer } from "@/test-app";

export function sqliteSessionFixture(): {
  readonly deps: DraftDeps;
  readonly routes: Readonly<Record<string, Answer>>;
  readonly close: () => void;
  readonly readyAttachment: (id: string, name: string) => string;
} {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-session-cas-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  // A variable keeps Vite's browser asset transform away from the real SQL directory.
  const migrationPath = "../../../app/src/kernel/db/migrations/";
  const directory = new URL(migrationPath, import.meta.url);
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, directory), "utf8"));
  const deps: DraftDeps = {
    db,
    paths,
    clock: { now: () => new Date("2026-09-13T00:00:00.000Z"), sleep: async () => undefined },
    ids: ulidIds,
    uuid: randomUUID,
    log: { write: () => undefined },
  };
  const respond = (request: Request, result: DraftResult<DraftView>) =>
    result.ok
      ? jsonAnswer(result.value)(request)
      : jsonAnswer(
          { title: "Draft refused", status: 409, detail: "Changed elsewhere", ...result },
          409,
        )(request);
  const idOf = (request: Request) => new URL(request.url).pathname.split("/")[3];
  return {
    deps,
    routes: {
      "POST /api/drafts": async (request) =>
        respond(request, createDraft(deps, createDraftInputSchema.parse(await request.json()))),
      "PUT /api/drafts/:id": async (request) =>
        respond(
          request,
          saveDraft(
            deps,
            saveDraftInputSchema.parse({ ...(await request.json()), id: idOf(request) }),
          ),
        ),
      "GET /api/drafts/:id": (request) => respond(request, readDraft(deps, idOf(request) ?? "")),
      "POST /api/drafts/:id/fork": async (request) =>
        respond(
          request,
          forkDraft(
            deps,
            forkDraftInputSchema.parse({ ...(await request.json()), sourceId: idOf(request) }),
          ),
        ),
    },
    readyAttachment: (id, name) => {
      const stagedId = deps.ids.next();
      insertStagedFile(db, {
        id: stagedId,
        stageKind: "images",
        path: stagedId,
        originalFilename: name,
        bytes: 3,
        state: "staged",
        createdAt: deps.clock.now().toISOString(),
      });
      writeFileSync(stagingPath(paths, stagedId), "abc");
      db.prepare(
        "UPDATE play_draft_attachments SET staged_file_id=?,status='ready' WHERE id=?",
      ).run(stagedId, id);
      return stagedId;
    },
    close: () => {
      db.close();
      rmSync(paths.dataDir, { recursive: true, force: true });
    },
  };
}
