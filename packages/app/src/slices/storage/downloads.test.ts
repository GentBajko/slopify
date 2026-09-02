import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { DownloadDeps } from "./downloads.js";
import { assetOf, findDownload, imagesZip, slugOf } from "./downloads.js";
import type { Output } from "./model.js";
import { insertOutput } from "./repo.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };

function harness(title = "A Very Short History of Rope"): DownloadDeps {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-downloads-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(join(paths.dataDir, "test.db"));
  migrate(db, clock);
  db.prepare("INSERT INTO projects VALUES ('p1',?,'16:9','{}','2026-09-01','2026-09-01')").run(
    title,
  );
  return { db, paths };
}

function output(fields: Partial<Output> & Pick<Output, "id" | "role" | "path">): Output {
  return {
    projectId: "p1",
    stageKind: "images",
    originalFilename: null,
    bytes: 0,
    durationMs: null,
    meta: {},
    createdAt: "2026-09-02T10:00:00.000Z",
    ...fields,
  };
}

function place(deps: DownloadDeps, out: Output, body: string): void {
  const target = join(deps.paths.projects, out.projectId, out.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body);
  insertOutput(deps.db, { ...out, bytes: Buffer.byteLength(body) });
}

describe("slugOf", () => {
  it("folds a title down to lowercase words joined by hyphens", () => {
    expect(slugOf("A Very Short History of Rope")).toBe("a-very-short-history-of-rope");
    expect(slugOf("Café — Crème brûlée!")).toBe("cafe-creme-brulee");
    expect(slugOf("  spaced  out  ")).toBe("spaced-out");
  });

  it("falls back when a title slugs down to nothing", () => {
    expect(slugOf("")).toBe("project");
    expect(slugOf("!!!")).toBe("project");
    expect(slugOf("日本語")).toBe("project");
  });

  it("keeps the slug short enough to leave room for the asset and extension", () => {
    expect(slugOf("x".repeat(200))).toBe("x".repeat(60));
    expect(slugOf(`${"word ".repeat(20)}`)).not.toMatch(/-$/);
  });
});

describe("assetOf", () => {
  it("names an asset after its role, with the image's place in the slideshow", () => {
    expect(assetOf(output({ id: "o1", role: "article_md", path: "article.md" }))).toBe(
      "article-md",
    );
    expect(assetOf(output({ id: "o2", role: "audio_body", path: "audio-body.mp3" }))).toBe(
      "audio-body",
    );
    expect(assetOf(output({ id: "o3", role: "video", path: "video.mp4" }))).toBe("video");
    expect(
      assetOf(output({ id: "o4", role: "image", path: "images/003.png", meta: { index: 3 } })),
    ).toBe("image-3");
  });

  it("falls back to the bare role for an image with no recorded index", () => {
    expect(assetOf(output({ id: "o5", role: "image", path: "images/001.png" }))).toBe("image");
  });
});

describe("findDownload", () => {
  it("serves a file under <title-slug>-<asset>.<ext>", () => {
    const deps = harness();
    place(deps, output({ id: "o1", role: "audio_body", path: "audio-body.mp3" }), "id3 bytes");

    const result = findDownload(deps, "p1", "audio-body");

    expect(result).toEqual({
      ok: true,
      download: {
        path: join(deps.paths.projects, "p1", "audio-body.mp3"),
        filename: "a-very-short-history-of-rope-audio-body.mp3",
        bytes: 9,
        contentType: "audio/mpeg",
      },
    });
  });

  it("addresses one image of a slideshow by its index", () => {
    const deps = harness("Rope");
    place(
      deps,
      output({ id: "o1", role: "image", path: "images/002.webp", meta: { index: 2 } }),
      "webp",
    );

    expect(findDownload(deps, "p1", "image-2")).toMatchObject({
      ok: true,
      download: { filename: "rope-image-2.webp", contentType: "image/webp" },
    });
  });

  it("has nothing for a project or an asset it does not know", () => {
    const deps = harness();
    place(deps, output({ id: "o1", role: "video", path: "video.mp4" }), "mp4");

    expect(findDownload(deps, "gone", "video")).toEqual({ ok: false, reason: "unknown-project" });
    expect(findDownload(deps, "p1", "thumbnail")).toEqual({ ok: false, reason: "unknown-asset" });
    expect(findDownload(deps, "p1", "../../etc/passwd")).toEqual({
      ok: false,
      reason: "unknown-asset",
    });
  });

  it("reports a recorded output whose file has gone missing", () => {
    const deps = harness();
    const video = output({ id: "o1", role: "video", path: "video.mp4" });
    place(deps, video, "mp4");
    rmSync(join(deps.paths.projects, "p1", "video.mp4"));

    expect(findDownload(deps, "p1", "video")).toEqual({ ok: false, reason: "missing-file" });
  });
});

describe("imagesZip", () => {
  it("zips every image and the thumbnail under their download names", () => {
    const deps = harness("Rope");
    place(
      deps,
      output({ id: "o1", role: "image", path: "images/001.png", meta: { index: 1 } }),
      "first",
    );
    place(
      deps,
      output({ id: "o2", role: "image", path: "images/002.jpg", meta: { index: 2 } }),
      "second",
    );
    place(deps, output({ id: "o3", role: "thumbnail", path: "thumbnail.png" }), "thumb");
    place(deps, output({ id: "o4", role: "video", path: "video.mp4" }), "not an image");

    const result = imagesZip(deps, "p1");

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.filename).toBe("rope-images.zip");
    const entries = unzipSync(result.bytes);
    expect(Object.keys(entries)).toEqual([
      "rope-image-1.png",
      "rope-image-2.jpg",
      "rope-thumbnail.png",
    ]);
    expect(Buffer.from(entries["rope-image-1.png"] ?? new Uint8Array()).toString()).toBe("first");
    expect(Buffer.from(entries["rope-image-2.jpg"] ?? new Uint8Array()).toString()).toBe("second");
    expect(Buffer.from(entries["rope-thumbnail.png"] ?? new Uint8Array()).toString()).toBe("thumb");
  });

  it("has nothing to zip for a project with no images and no thumbnail", () => {
    const deps = harness();
    place(deps, output({ id: "o1", role: "video", path: "video.mp4" }), "mp4");

    expect(imagesZip(deps, "p1")).toEqual({ ok: false, reason: "no-images" });
    expect(imagesZip(deps, "gone")).toEqual({ ok: false, reason: "unknown-project" });
  });

  it("skips an image whose file has gone missing rather than failing the whole zip", () => {
    const deps = harness("Rope");
    place(
      deps,
      output({ id: "o1", role: "image", path: "images/001.png", meta: { index: 1 } }),
      "first",
    );
    place(
      deps,
      output({ id: "o2", role: "image", path: "images/002.png", meta: { index: 2 } }),
      "second",
    );
    rmSync(join(deps.paths.projects, "p1", "images", "002.png"));

    const result = imagesZip(deps, "p1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(unzipSync(result.bytes))).toEqual(["rope-image-1.png"]);
    }
  });
});
