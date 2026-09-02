import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { Output } from "../../slices/storage/model.js";
import { insertOutput } from "../../slices/storage/repo.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };
const log: Log = { write: (): void => {} };
const ids: Ids = { next: (): string => "fixed" };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly place: (
    output: Partial<Output> & Pick<Output, "id" | "role" | "path">,
    body: string,
  ) => void;
  readonly paths: Paths;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-files-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  db.exec("INSERT INTO projects VALUES ('p1','Rope','16:9','{}','2026-09-01','2026-09-01')");
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids, log }),
    clock,
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
  });
  return {
    app,
    paths,
    place: (fields, body): void => {
      const target = join(paths.projects, "p1", fields.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, body);
      insertOutput(db, {
        projectId: "p1",
        stageKind: "images",
        originalFilename: null,
        durationMs: null,
        meta: {},
        createdAt: "2026-09-02T10:00:00.000Z",
        ...fields,
        bytes: Buffer.byteLength(body),
      });
    },
  };
}

describe("GET /files/:projectId/:asset", () => {
  it("serves the file under its download name", async () => {
    const { app, place } = harness();
    place({ id: "o1", role: "audio_body", path: "audio-body.mp3", stageKind: "audio" }, "id3");

    const response = await app.request("/files/p1/audio-body");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="rope-audio-body.mp3"',
    );
    expect(response.headers.get("content-type")).toBe("audio/mpeg");
    expect(response.headers.get("content-length")).toBe("3");
    expect(response.headers.get("x-slopify-version")).toBe("1.2.3");
    expect(await response.text()).toBe("id3");
  });

  it("answers a problem for a project, an asset, or a file that is not there", async () => {
    const { app, place, paths } = harness();
    place({ id: "o1", role: "video", path: "video.mp4", stageKind: "video" }, "mp4");

    expect((await app.request("/files/gone/video")).status).toBe(404);
    expect((await app.request("/files/p1/thumbnail")).status).toBe(404);

    rmSync(join(paths.projects, "p1", "video.mp4"));
    const gone = await app.request("/files/p1/video");
    expect(gone.status).toBe(404);
    expect(gone.headers.get("content-type")).toBe("application/problem+json");
    expect(await gone.json()).toMatchObject({ detail: /no longer on disk/ });
  });

  it("refuses an asset name that is not one", async () => {
    const { app } = harness();

    const response = await app.request("/files/p1/..%2F..%2Fetc");

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
  });
});

describe("GET /files/:projectId/images.zip", () => {
  it("serves every image and the thumbnail in one archive", async () => {
    const { app, place } = harness();
    place({ id: "o1", role: "image", path: "images/001.png", meta: { index: 1 } }, "first");
    place({ id: "o2", role: "image", path: "images/002.png", meta: { index: 2 } }, "second");
    place({ id: "o3", role: "thumbnail", path: "thumbnail.png", stageKind: "thumbnail" }, "thumb");

    const response = await app.request("/files/p1/images.zip");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="rope-images.zip"',
    );
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(entries)).toEqual([
      "rope-image-1.png",
      "rope-image-2.png",
      "rope-thumbnail.png",
    ]);
  });

  it("answers a problem when the project has no images yet", async () => {
    const { app } = harness();

    const response = await app.request("/files/p1/images.zip");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ detail: /no images/ });
  });
});
