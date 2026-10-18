import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout, type Paths } from "../../kernel/paths.js";
import { stagingPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import type { DesignEvent } from "./model.js";
import type { DesignDeps } from "./service.js";

// Test support, not shipped.

// The 33-byte head of a PNG of the given size: enough for every reader here.
export function pngOf(width: number, height: number, salt = 0): Uint8Array {
  const bytes = new Uint8Array(34);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(bytes.buffer).setUint32(16, width);
  new DataView(bytes.buffer).setUint32(20, height);
  bytes[33] = salt;
  return bytes;
}

export interface Harness {
  readonly deps: DesignDeps;
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: Clock & { readonly advance: (ms: number) => void };
  readonly events: DesignEvent[];
  readonly stage: (bytes: Uint8Array, state?: "staged" | "copying") => string;
  readonly cleanup: () => void;
}

export function designHarness(): Harness {
  const dir = mkdtempSync(join(tmpdir(), "slopify-designs-"));
  const paths = layout(dir);
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  let now = Date.parse("2026-10-18T10:00:00.000Z");
  const clock = {
    now: () => new Date(now),
    sleep: () => Promise.resolve(),
    advance: (ms: number) => {
      now += ms;
    },
  };
  migrate(db, clock);
  let n = 0;
  const events: DesignEvent[] = [];
  const deps: DesignDeps = {
    db,
    clock,
    ids: { next: () => `id${String(++n).padStart(4, "0")}` },
    paths,
    log: { write: () => {} },
    emit: (event) => events.push(event),
  };
  return {
    deps,
    db,
    paths,
    clock,
    events,
    stage: (bytes, state = "staged") => {
      const id = `staged${String(++n)}`;
      writeFileSync(stagingPath(paths, id), bytes);
      insertStagedFile(db, {
        id,
        stageKind: "images",
        path: id,
        originalFilename: "me.png",
        bytes: bytes.byteLength,
        state,
        createdAt: clock.now().toISOString(),
      });
      return id;
    },
    cleanup: () => {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
