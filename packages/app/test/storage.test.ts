import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { systemClock } from "../src/kernel/clock.js";
import type { Config } from "../src/kernel/config/index.js";
import { openDb } from "../src/kernel/db/index.js";
import { ulidIds } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import type { Paths } from "../src/kernel/paths.js";
import { boot } from "../src/main.js";
import type { StagedFile } from "../src/slices/storage/model.js";
import type { StorageDeps } from "../src/slices/storage/staging.js";
import { attachStagedFile } from "../src/slices/storage/staging.js";

const log: Log = { write: (): void => {} };
const open: Array<() => Promise<void>> = [];
const connections: DatabaseSync[] = [];

afterEach(async () => {
  for (const db of connections.splice(0)) {
    db.close();
  }
  for (const stop of open.splice(0)) {
    await stop();
  }
});

function config(dataDir: string): Config {
  return { port: 0, host: "127.0.0.1", dataDir, open: false };
}

async function started(dataDir: string): Promise<{ url: string; paths: Paths }> {
  const { url, paths, stop } = await boot(config(dataDir));
  open.push(stop);
  return { url, paths };
}

function connect(paths: Paths): DatabaseSync {
  const db = openDb(paths.db);
  connections.push(db);
  return db;
}

function storage(db: DatabaseSync, paths: Paths): StorageDeps {
  return { db, paths, ids: ulidIds, clock: systemClock, log, emit: (): void => {} };
}

async function post(
  url: string,
  kind: string,
  filename: string,
  body: string,
): Promise<StagedFile> {
  const form = new FormData();
  form.set("file", new File([body], filename));
  const response = await fetch(`${url}/api/staging/${kind}`, { method: "POST", body: form });
  if (response.status !== 201) {
    throw new Error(`upload of ${filename} answered ${response.status}`);
  }
  return (await response.json()) as StagedFile;
}

describe("upload, attach, and download over a socket", () => {
  it("stages two files, attaches them, and serves them by name and as a zip", async () => {
    const { url, paths } = await started(mkdtempSync(join(tmpdir(), "slopify-e2e-")));
    const db = connect(paths);
    db.exec(
      "INSERT INTO projects VALUES ('p1','Rope Tricks','16:9','{}','2026-09-02','2026-09-02')",
    );

    const first = await post(url, "images", "First Shot.png", "the first image");
    const second = await post(url, "images", "second shot.PNG", "the second image");

    const listed = (await (await fetch(`${url}/api/staging`)).json()) as { files: StagedFile[] };
    expect(listed.files.map((file) => file.originalFilename)).toEqual([
      "First Shot.png",
      "second shot.PNG",
    ]);
    expect(listed.files.every((file) => file.state === "staged")).toBe(true);

    const deps = storage(db, paths);
    for (const [index, file] of [first, second].entries()) {
      const attached = attachStagedFile(deps, {
        stagedFileId: file.id,
        projectId: "p1",
        role: "image",
        index: index + 1,
      });
      expect(attached.ok).toBe(true);
    }
    expect((await (await fetch(`${url}/api/staging`)).json()) as unknown).toEqual({ files: [] });

    const download = await fetch(`${url}/files/p1/image-1`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toBe(
      'attachment; filename="rope-tricks-image-1.png"',
    );
    expect(await download.text()).toBe("the first image");

    const zip = await fetch(`${url}/files/p1/images.zip`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get("content-disposition")).toBe(
      'attachment; filename="rope-tricks-images.zip"',
    );
    const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()));
    expect(Object.keys(entries)).toEqual(["rope-tricks-image-1.png", "rope-tricks-image-2.png"]);
    expect(text(entries["rope-tricks-image-1.png"])).toBe("the first image");
    expect(text(entries["rope-tricks-image-2.png"])).toBe("the second image");
  });

  it("finishes an upload whose page stopped listening halfway through", async () => {
    const { url, paths } = await started(mkdtempSync(join(tmpdir(), "slopify-e2e-")));
    const half = "a".repeat(64 * 1024);
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const events = new AbortController();
    const stream = await fetch(`${url}/api/events/global`, { signal: events.signal });
    const reader = (stream.body ?? new ReadableStream<Uint8Array>()).getReader();

    const upload = fetch(`${url}/api/staging/audio`, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=----slopifytest" },
      body: multipart(half, gate),
      // Required by fetch for a body that is a stream rather than a buffer.
      duplex: "half",
    });

    // Wait for the first progress event, then hang up on the channel carrying it.
    await until(reader, "staging.progress");
    events.abort();
    release();

    const response = await upload;
    expect(response.status).toBe(201);
    const staged = (await response.json()) as StagedFile;
    expect(staged.bytes).toBe(half.length * 2);
    expect(readFileSync(join(paths.staging, staged.id), "utf8")).toBe(half + half);
  });
});

describe("reconcile at the next boot", () => {
  it("keeps an attached file, drops an untracked one, and clears staging", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-reconcile-e2e-"));
    const first = await started(dataDir);
    const db = connect(first.paths);
    db.exec(
      "INSERT INTO projects VALUES ('p1','Rope Tricks','16:9','{}','2026-09-02','2026-09-02')",
    );

    const attached = await post(first.url, "images", "kept.png", "attached bytes");
    const abandoned = await post(first.url, "images", "never-used.png", "abandoned bytes");
    expect(
      attachStagedFile(storage(db, first.paths), {
        stagedFileId: attached.id,
        projectId: "p1",
        role: "image",
        index: 1,
      }).ok,
    ).toBe(true);
    const orphan = join(first.paths.projects, "p1", "images", "999.png");
    writeFileSync(orphan, "written but never recorded");
    db.close();
    connections.length = 0;
    await (open.pop() ?? (async (): Promise<void> => {}))();

    const second = await started(dataDir);

    expect(readFileSync(join(second.paths.projects, "p1", "images", "001.png"), "utf8")).toBe(
      "attached bytes",
    );
    expect(existsSync(orphan)).toBe(false);
    expect(existsSync(join(second.paths.staging, abandoned.id))).toBe(false);
    const after = connect(second.paths);
    expect(after.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
    expect(after.prepare("SELECT count(*) AS n FROM outputs").get()).toEqual({ n: 1 });
  });
});

function text(bytes: Uint8Array | undefined): string {
  return Buffer.from(bytes ?? new Uint8Array()).toString();
}

function multipart(half: string, gate: Promise<void>): ReadableStream<Uint8Array> {
  const boundary = "----slopifytest";
  const head = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`;
  return new ReadableStream<Uint8Array>({
    async start(controller): Promise<void> {
      controller.enqueue(Buffer.from(head + half));
      await gate;
      controller.enqueue(Buffer.from(`${half}\r\n--${boundary}--\r\n`));
      controller.close();
    },
  });
}

async function until(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  event: string,
): Promise<void> {
  const decoder = new TextDecoder();
  let seen = "";
  while (!seen.includes(event)) {
    const { value, done } = await reader.read();
    if (done) {
      throw new Error(`the event stream ended before ${event}`);
    }
    seen += decoder.decode(value, { stream: true });
  }
}
