import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  fstatSync,
  mkdirSync,
  readFileSync,
  truncateSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { unzipSync, Zip, ZipDeflate, zipSync } from "fflate";
import { expect, it } from "vitest";
import { resolveFont } from "../fonts/catalog.js";
import { listEntries, listPrompts } from "../library/repo.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { cliPathStatus } from "../settings/cli-paths.js";
import { listVoices, readSetting, writeSetting } from "../settings/repo.js";
import { projectDir, stagingPath } from "./layout.js";
import {
  exportPortable,
  importPortable,
  portableMaxArchiveBytes,
  portableMaxArchiveMembers,
  portableMaxExpandedBytes,
  portableMaxManifestRows,
  storageUsage,
} from "./portable.js";
import { insertStagedFile, stagedFiles } from "./repo.js";

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    createdAt: "2026-09-13T12:00:00.000Z",
    settings: {},
    prompts: [],
    entries: [],
    voices: [],
    templates: [],
    fonts: [],
    staged: [],
    ...overrides,
  };
}

function manifestArchive(overrides: Record<string, unknown> = {}): Uint8Array {
  return zipSync({
    "manifest.json": [Buffer.from(JSON.stringify(manifest(overrides))), { level: 0 }],
  });
}

function tamperFirstStoredMember(archive: Uint8Array): Uint8Array {
  const changed = Buffer.from(archive);
  const localHeader = changed.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  if (localHeader < 0 || changed.readUInt16LE(localHeader + 8) !== 0)
    throw new Error("Test ZIP does not start with a stored member.");
  const dataStart =
    localHeader +
    30 +
    changed.readUInt16LE(localHeader + 26) +
    changed.readUInt16LE(localHeader + 28);
  changed[dataStart] = (changed[dataStart] ?? 0) ^ 0xff;
  return changed;
}

function withoutCentralDirectory(archive: Uint8Array): Uint8Array {
  const complete = Buffer.from(archive);
  const eocd = complete.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("Test ZIP EOCD was not found.");
  return complete.subarray(0, complete.readUInt32LE(eocd + 16));
}

function compressedZeros(bytes: number): Uint8Array {
  const output: Uint8Array[] = [];
  let failure: Error | undefined;
  const archive = new Zip((error, chunk) => {
    if (error !== null) failure = error;
    else output.push(chunk);
  });
  const file = new ZipDeflate("oversized.bin", { level: 9 });
  archive.add(file);
  const block = new Uint8Array(1024 * 1024);
  let remaining = bytes;
  while (remaining > 0) {
    const size = Math.min(remaining, block.byteLength);
    remaining -= size;
    file.push(size === block.byteLength ? block : block.subarray(0, size), remaining === 0);
  }
  archive.end();
  if (failure !== undefined) throw failure;
  return Buffer.concat(output);
}

function understateExpandedSize(archive: Uint8Array): Uint8Array {
  const forged = Buffer.from(archive);
  const localHeader = forged.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const centralHeader = forged.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  if (localHeader < 0 || centralHeader < 0) throw new Error("Test ZIP headers were not found.");
  forged.writeUInt32LE(1, localHeader + 22);
  forged.writeUInt32LE(1, centralHeader + 24);
  const compressedBytes = forged.readUInt32LE(centralHeader + 20);
  const dataStart =
    localHeader +
    30 +
    forged.readUInt16LE(localHeader + 26) +
    forged.readUInt16LE(localHeader + 28);
  const descriptor = dataStart + compressedBytes;
  forged.writeUInt32LE(1, descriptor + (forged.readUInt32LE(descriptor) === 0x08074b50 ? 12 : 8));
  return forged;
}

it("exports settings, templates, uploaded fonts and staged bytes without provider keys", async () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    const templateId = randomUUID();
    const font = readFileSync(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url));
    const fontId = `uploaded-${createHash("sha256").update(font).digest("hex")}`;
    mkdirSync(`${source.deps.paths.dataDir}/fonts`);
    writeFileSync(`${source.deps.paths.dataDir}/fonts/${fontId}.ttf`, font, { mode: 0o600 });
    expect(
      createTemplate(source.deps, {
        id: templateId,
        name: "Portable",
        document: {
          ...source.document,
          form: {
            ...source.document.form,
            subtitles: { ...source.document.form.subtitles, mode: "burn-in", fontId },
          },
        },
      }).ok,
    ).toBe(true);
    writeSetting(source.deps.db, "silenceGapSeconds", "3");
    const stagedId = "staged-portable";
    writeFileSync(stagingPath(source.deps.paths, stagedId), Buffer.from("audio"), { mode: 0o600 });
    insertStagedFile(source.deps.db, {
      id: stagedId,
      stageKind: "audio",
      path: stagedId,
      originalFilename: "voice.wav",
      bytes: 5,
      state: "staged",
      createdAt: source.deps.clock.now().toISOString(),
    });
    source.deps.db
      .prepare("INSERT INTO provider_keys(provider,key,updated_at) VALUES(?,?,?)")
      .run("openrouter", "secret", source.deps.clock.now().toISOString());
    const archive = exportPortable({
      db: source.deps.db,
      paths: source.deps.paths,
      ids: source.deps.ids,
      now: () => source.deps.clock.now().toISOString(),
    });
    const result = importPortable(
      {
        db: target.deps.db,
        paths: target.deps.paths,
        ids: target.deps.ids,
        now: () => target.deps.clock.now().toISOString(),
      },
      archive,
    );
    expect(result.templates).toBe(1);
    expect(result.fonts).toBe(1);
    expect(result.fontFallbacks).toBe(0);
    expect(result.stagedFiles).toBe(1);
    expect(await resolveFont(target.deps.paths, fontId)).toMatchObject({
      id: fontId,
      source: "uploaded",
    });
    expect(
      target.deps.db.prepare("SELECT key FROM settings WHERE key=?").get("silenceGapSeconds"),
    ).toEqual({ key: "silenceGapSeconds" });
    expect(target.deps.db.prepare("SELECT count(*) AS n FROM provider_keys").get()).toEqual({
      n: 0,
    });
  } finally {
    source.close();
    target.close();
  }
});

it("repairs uploaded-font references in legacy backups that have no font bytes", () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    const templateId = randomUUID();
    const font = readFileSync(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url));
    const fontId = `uploaded-${createHash("sha256").update(font).digest("hex")}`;
    mkdirSync(`${source.deps.paths.dataDir}/fonts`);
    writeFileSync(`${source.deps.paths.dataDir}/fonts/${fontId}.ttf`, font, { mode: 0o600 });
    expect(
      createTemplate(source.deps, {
        id: templateId,
        name: "Legacy font",
        document: {
          ...source.document,
          form: {
            ...source.document.form,
            subtitles: { ...source.document.form.subtitles, mode: "burn-in", fontId },
          },
        },
      }).ok,
    ).toBe(true);
    const archive = unzipSync(
      exportPortable({
        ...source.deps,
        now: () => source.deps.clock.now().toISOString(),
      }),
    );
    const manifest = JSON.parse(Buffer.from(archive["manifest.json"] ?? []).toString("utf8"));
    delete manifest.fonts;
    delete archive[`fonts/${fontId}.ttf`];
    archive["manifest.json"] = Buffer.from(JSON.stringify(manifest));

    const result = importPortable(
      { ...target.deps, now: () => target.deps.clock.now().toISOString() },
      zipSync(archive),
    );

    expect(result.fontFallbacks).toBe(1);
    expect(templateById(target.deps.db, templateId)?.document.form.subtitles.fontId).toBe(
      "default",
    );
  } finally {
    source.close();
    target.close();
  }
});

it("reports project folder usage alongside aggregate storage totals", () => {
  const h = draftFixture();
  try {
    h.deps.db
      .prepare("INSERT INTO projects VALUES (?, ?, '16:9', '{}', ?, ?)")
      .run("p1", "Storage sample", "2026-09-12", "2026-09-12");
    mkdirSync(projectDir(h.deps.paths, "p1"), { recursive: true });
    writeFileSync(`${projectDir(h.deps.paths, "p1")}/video.mp4`, Buffer.alloc(7));
    expect(storageUsage(h.deps).byProject).toEqual([
      { id: "p1", title: "Storage sample", bytes: 7 },
    ]);
  } finally {
    h.close();
  }
});

it("rolls back database writes and created staging files when an import write fails", () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    writeSetting(source.deps.db, "silenceGapSeconds", "7");
    const stagedId = "portable-source";
    writeFileSync(stagingPath(source.deps.paths, stagedId), Buffer.from("audio"), { mode: 0o600 });
    insertStagedFile(source.deps.db, {
      id: stagedId,
      stageKind: "audio",
      path: stagedId,
      originalFilename: "voice.wav",
      bytes: 5,
      state: "staged",
      createdAt: source.deps.clock.now().toISOString(),
    });
    const archive = exportPortable({
      db: source.deps.db,
      paths: source.deps.paths,
      ids: source.deps.ids,
      now: () => source.deps.clock.now().toISOString(),
    });
    target.deps.db.exec(
      "CREATE TRIGGER reject_portable_file BEFORE INSERT ON staged_files BEGIN SELECT RAISE(ABORT, 'rejected'); END",
    );
    const importedId = "portable-imported";
    const importedPath = stagingPath(target.deps.paths, importedId);

    expect(() =>
      importPortable(
        {
          db: target.deps.db,
          paths: target.deps.paths,
          ids: { next: () => importedId },
          now: () => target.deps.clock.now().toISOString(),
        },
        archive,
      ),
    ).toThrow(/rejected/);

    expect(
      target.deps.db.prepare("SELECT value FROM settings WHERE key=?").get("silenceGapSeconds"),
    ).toBeUndefined();
    expect(target.deps.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({
      n: 0,
    });
    expect(existsSync(importedPath)).toBe(false);
  } finally {
    source.close();
    target.close();
  }
});

it("validates every staged archive member before changing the database", () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    writeSetting(source.deps.db, "silenceGapSeconds", "9");
    const stagedId = "portable-missing";
    writeFileSync(stagingPath(source.deps.paths, stagedId), Buffer.from("audio"), { mode: 0o600 });
    insertStagedFile(source.deps.db, {
      id: stagedId,
      stageKind: "audio",
      path: stagedId,
      originalFilename: "voice.wav",
      bytes: 5,
      state: "staged",
      createdAt: source.deps.clock.now().toISOString(),
    });
    const archive = unzipSync(
      exportPortable({
        db: source.deps.db,
        paths: source.deps.paths,
        ids: source.deps.ids,
        now: () => source.deps.clock.now().toISOString(),
      }),
    );
    delete archive[`staging/${stagedId}`];

    expect(() =>
      importPortable(
        {
          db: target.deps.db,
          paths: target.deps.paths,
          ids: target.deps.ids,
          now: () => target.deps.clock.now().toISOString(),
        },
        zipSync(archive),
      ),
    ).toThrow(/missing staged file/i);
    expect(
      target.deps.db.prepare("SELECT value FROM settings WHERE key=?").get("silenceGapSeconds"),
    ).toBeUndefined();
  } finally {
    source.close();
    target.close();
  }
});

it("closes and removes a partially written import when the writer fails", () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    writeSetting(source.deps.db, "silenceGapSeconds", "9");
    const sourceId = "portable-partial-source";
    writeFileSync(stagingPath(source.deps.paths, sourceId), Buffer.from("audio"));
    insertStagedFile(source.deps.db, {
      id: sourceId,
      stageKind: "audio",
      path: sourceId,
      originalFilename: "voice.wav",
      bytes: 5,
      state: "staged",
      createdAt: source.deps.clock.now().toISOString(),
    });
    const archive = exportPortable({
      ...source.deps,
      now: () => source.deps.clock.now().toISOString(),
    });
    const importedId = "portable-partial-import";
    let writtenDescriptor: number | undefined;
    const failure = new Error("Disk full during staged write");
    expect(() =>
      importPortable(
        {
          ...target.deps,
          ids: { next: () => importedId },
          now: () => target.deps.clock.now().toISOString(),
          writeStagedBytes: (descriptor, bytes) => {
            writtenDescriptor = descriptor;
            writeSync(descriptor, bytes.subarray(0, 2));
            expect(fstatSync(descriptor).size).toBe(2);
            throw failure;
          },
        },
        archive,
      ),
    ).toThrow(failure);
    if (writtenDescriptor === undefined) throw new Error("Writer was not reached");
    const closedDescriptor = writtenDescriptor;
    expect(() => fstatSync(closedDescriptor)).toThrow();
    expect(existsSync(stagingPath(target.deps.paths, importedId))).toBe(false);
    expect(target.deps.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({
      n: 0,
    });
    expect(
      target.deps.db.prepare("SELECT value FROM settings WHERE key=?").get("silenceGapSeconds"),
    ).toBeUndefined();
  } finally {
    source.close();
    target.close();
  }
});

it("rejects archives with excessive member counts before import", () => {
  const target = draftFixture();
  try {
    const members: Record<string, Uint8Array> = {
      "manifest.json": Buffer.from(JSON.stringify(manifest())),
    };
    for (let index = 0; index < portableMaxArchiveMembers; index += 1)
      members[`extras/${index}`] = new Uint8Array();

    expect(() =>
      importPortable(
        { ...target.deps, now: () => target.deps.clock.now().toISOString() },
        zipSync(members, { level: 0 }),
      ),
    ).toThrow(/too many archive members/i);
  } finally {
    target.close();
  }
});

it("rejects excessive manifest rows before changing the database", () => {
  const target = draftFixture();
  try {
    const prompts = Array.from({ length: portableMaxManifestRows + 1 }, (_, index) => ({
      id: `prompt-${index}`,
      kind: "article",
      name: `Prompt ${index}`,
      body: "Write.",
      slots: "[]",
      updated_at: "2026-09-13T12:00:00.000Z",
    }));
    const archive = zipSync({
      "manifest.json": Buffer.from(JSON.stringify(manifest({ prompts }))),
    });

    expect(() =>
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive),
    ).toThrow();
    expect(target.deps.db.prepare("SELECT count(*) AS n FROM prompts").get()).toEqual({ n: 0 });
  } finally {
    target.close();
  }
});

it("stops expansion when compressed archive metadata understates actual bytes", () => {
  const target = draftFixture();
  try {
    const archive = understateExpandedSize(compressedZeros(portableMaxExpandedBytes + 1));
    expect(archive.byteLength).toBeLessThan(1024 * 1024);

    expect(() =>
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive),
    ).toThrow(/inconsistent archive metadata/i);
  } finally {
    target.close();
  }
});

it("rejects a stored member whose bytes no longer match its central CRC", () => {
  const target = draftFixture();
  try {
    const archive = tamperFirstStoredMember(
      manifestArchive({ settings: { appearance: JSON.stringify("dark") } }),
    );

    expect(() =>
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive),
    ).toThrow(/inconsistent archive metadata/i);
    expect(readSetting(target.deps.db, "appearance")).toBeUndefined();
  } finally {
    target.close();
  }
});

it("rejects local ZIP records when the central directory and EOCD are missing", () => {
  const target = draftFixture();
  try {
    const archive = withoutCentralDirectory(
      manifestArchive({ settings: { appearance: JSON.stringify("dark") } }),
    );

    expect(() =>
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive),
    ).toThrow(/end-of-central-directory/i);
    expect(readSetting(target.deps.db, "appearance")).toBeUndefined();
  } finally {
    target.close();
  }
});

it.each([
  {
    collection: "prompts",
    row: {
      id: "bad-prompt",
      kind: "article",
      name: "Bad prompt",
      body: "Write {{topic}}.",
      slots: "not JSON",
      updated_at: "2026-09-13T12:00:00.000Z",
    },
  },
  {
    collection: "entries",
    row: {
      id: "bad-entry",
      category: "intro",
      mode: "text",
      name: "Bad entry",
      body: "Welcome {{topic}}.",
      slots: "not JSON",
      updated_at: "2026-09-13T12:00:00.000Z",
    },
  },
])("rejects malformed $collection slots before any portable write", ({ collection, row }) => {
  const target = draftFixture();
  try {
    const archive = manifestArchive({
      settings: { appearance: JSON.stringify("dark") },
      [collection]: [row],
    });

    expect(() =>
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive),
    ).toThrow(/slots/i);
    expect(readSetting(target.deps.db, "appearance")).toBeUndefined();
    expect(listPrompts(target.deps.db)).toEqual([]);
    expect(listEntries(target.deps.db)).toEqual([]);
  } finally {
    target.close();
  }
});

it("rejects an unknown voice provider before it can poison voice reads", () => {
  const target = draftFixture();
  try {
    const archive = manifestArchive({
      settings: { appearance: JSON.stringify("dark") },
      voices: [{ id: "v1", provider: "retired-tts", name: "Old voice", voice_id: "voice-1" }],
    });

    expect(() =>
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive),
    ).toThrow();
    expect(readSetting(target.deps.db, "appearance")).toBeUndefined();
    expect(listVoices(target.deps.db)).toEqual([]);
  } finally {
    target.close();
  }
});

it("rejects malformed stored CLI-path JSON before changing settings", () => {
  const target = draftFixture();
  try {
    const archive = manifestArchive({
      settings: { appearance: JSON.stringify("dark"), "cli.path.codex": "{" },
    });

    expect(() =>
      importPortable({ ...target.deps, now: () => target.deps.clock.now().toISOString() }, archive),
    ).toThrow(/valid JSON/i);
    expect(readSetting(target.deps.db, "appearance")).toBeUndefined();
    expect(cliPathStatus(target.deps.db, "codex")).toEqual({
      configured: null,
      command: "codex",
    });
  } finally {
    target.close();
  }
});

it("omits tutorial runtime state from exports and ignores it in older v1 imports", () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    writeSetting(source.deps.db, "appearance", JSON.stringify("dark"));
    writeSetting(source.deps.db, "tutorial.session", JSON.stringify({ projectId: "old-project" }));
    const exported = unzipSync(
      exportPortable({ ...source.deps, now: () => source.deps.clock.now().toISOString() }),
    );
    const exportedManifest = JSON.parse(
      Buffer.from(exported["manifest.json"] ?? []).toString("utf8"),
    );
    expect(exportedManifest.settings).toEqual({ appearance: JSON.stringify("dark") });

    exportedManifest.settings["tutorial.session"] = JSON.stringify({ projectId: "stale" });
    writeSetting(target.deps.db, "tutorial.session", JSON.stringify({ step: "current" }));
    const result = importPortable(
      { ...target.deps, now: () => target.deps.clock.now().toISOString() },
      manifestArchive(exportedManifest),
    );

    expect(result.settings).toBe(1);
    expect(readSetting(target.deps.db, "appearance")).toBe(JSON.stringify("dark"));
    expect(readSetting(target.deps.db, "tutorial.session")).toBe(
      JSON.stringify({ step: "current" }),
    );
  } finally {
    source.close();
    target.close();
  }
});

it("exports and round-trips only complete staged rows with matching bytes", () => {
  const source = draftFixture();
  const target = draftFixture();
  try {
    for (const file of [
      { id: "valid-stage", bytes: 5, state: "staged" as const, content: "audio" },
      { id: "copying-stage", bytes: 3, state: "copying" as const, content: "par" },
      { id: "mismatch-stage", bytes: 99, state: "staged" as const, content: "short" },
    ]) {
      writeFileSync(stagingPath(source.deps.paths, file.id), Buffer.from(file.content));
      insertStagedFile(source.deps.db, {
        id: file.id,
        stageKind: "audio",
        path: file.id,
        originalFilename: `${file.id}.wav`,
        bytes: file.bytes,
        state: file.state,
        createdAt: source.deps.clock.now().toISOString(),
      });
    }

    const archive = exportPortable({
      ...source.deps,
      now: () => source.deps.clock.now().toISOString(),
    });
    const result = importPortable(
      { ...target.deps, now: () => target.deps.clock.now().toISOString() },
      archive,
    );

    expect(result.stagedFiles).toBe(1);
    expect(stagedFiles(target.deps.db)).toEqual([
      expect.objectContaining({ originalFilename: "valid-stage.wav", bytes: 5, state: "staged" }),
    ]);
  } finally {
    source.close();
    target.close();
  }
});

it("preflights oversized staged files from metadata without reading their sparse bytes", () => {
  const source = draftFixture();
  try {
    const id = "oversized-stage";
    const path = stagingPath(source.deps.paths, id);
    writeFileSync(path, new Uint8Array());
    truncateSync(path, portableMaxArchiveBytes + 1);
    insertStagedFile(source.deps.db, {
      id,
      stageKind: "audio",
      path: id,
      originalFilename: "oversized.wav",
      bytes: portableMaxArchiveBytes + 1,
      state: "staged",
      createdAt: source.deps.clock.now().toISOString(),
    });

    expect(() =>
      exportPortable({ ...source.deps, now: () => source.deps.clock.now().toISOString() }),
    ).toThrow(/staged files are too large/i);
  } finally {
    source.close();
  }
});

it("preflights staged-file count before reading their contents", () => {
  const source = draftFixture();
  try {
    const count = portableMaxArchiveMembers - 64;
    source.deps.db.exec("BEGIN");
    try {
      for (let index = 0; index < count; index += 1) {
        const id = `staged-count-${index}`;
        writeFileSync(stagingPath(source.deps.paths, id), Buffer.from([index & 0xff]));
        insertStagedFile(source.deps.db, {
          id,
          stageKind: "audio",
          path: id,
          originalFilename: `${id}.wav`,
          bytes: 1,
          state: "staged",
          createdAt: source.deps.clock.now().toISOString(),
        });
      }
      source.deps.db.exec("COMMIT");
    } catch (error) {
      source.deps.db.exec("ROLLBACK");
      throw error;
    }

    expect(() =>
      exportPortable({ ...source.deps, now: () => source.deps.clock.now().toISOString() }),
    ).toThrow(/too many staged files/i);
  } finally {
    source.close();
  }
});

it("refuses to export a manifest containing a library row that its readers reject", () => {
  const source = draftFixture();
  try {
    source.deps.db
      .prepare("INSERT INTO prompts(id,kind,name,body,slots,updated_at) VALUES(?,?,?,?,?,?)")
      .run("bad", "article", "Bad", "Write {{topic}}.", "not JSON", "2026-09-13");

    expect(() =>
      exportPortable({ ...source.deps, now: () => source.deps.clock.now().toISOString() }),
    ).toThrow();
  } finally {
    source.close();
  }
});
