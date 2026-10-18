import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { crc32, deflateSync } from "node:zlib";
import { catalogueSchema } from "../../catalog/schema.js";
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

export const designCatalogue = catalogueSchema.parse({
  schemaVersion: 1,
  updatedAt: "2026-10-10",
  providers: { fal: { maxConcurrent: 4 } },
  llm: [],
  tts: [],
  image: [
    {
      name: "FLUX.2",
      source: "https://fal.ai/pricing",
      enabled: true,
      deprecated: false,
      provider: "fal",
      id: "fal-ai/flux-2",
      keywords: ["reference"],
      image: { aspectRatios: ["16:9", "9:16", "1:1"] },
      pricing: { perImage: 0.04 },
    },
  ],
});

// A real, decodable PNG of one colour, for tests that hand a picture to jsPDF or ffmpeg.
export function solidPng(
  width: number,
  height: number,
  rgb: readonly [number, number, number] = [40, 90, 160],
): Uint8Array {
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, width);
  new DataView(header.buffer).setUint32(4, height);
  header.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) raw.set(rgb, y * (width * 3 + 1) + 1 + x * 3);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
