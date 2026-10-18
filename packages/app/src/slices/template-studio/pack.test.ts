import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";
import { insertPrompt, listPrompts, promptByName } from "../library/repo.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import { retainedOutput } from "../revisions/downloads.fake.js";
import { mutationFixture } from "../revisions/mutation.fake.js";
import { insertVoice, upsertKey } from "../settings/repo.js";
import { freeChecks } from "./checks.js";
import { exportPack, type PackSampleFile, packLimits, sampleFilesOf } from "./pack.js";
import { importPack, readPack } from "./pack-import.js";
import { packSampleFileOf, packSamples, packSamplesDir } from "./pack-samples.js";
import { gatesOf, upsertSample, writeGate } from "./repo.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function install() {
  const h = draftFixture();
  open.push(h.close);
  return h;
}

const story = "Tell the story of {{Topic}} in {{Era}}, warmly.";

function documentOf(h: ReturnType<typeof install>): PlayDraftDocument {
  return {
    ...h.document,
    form: {
      ...h.document.form,
      title: "History: {{Topic}}",
      llm: { provider: "openrouter", model: "gpt" },
      audio: { provider: "elevenlabs", model: "eleven_v4", voice: "warm-voice" },
      articlePrompt: "Storyteller",
      values: { Topic: "", Era: "the 1800s" },
      document: { theme: "plain" },
    },
  };
}

// A template on `h` whose version 1 is marked ready, its prompt in the Library and its voice in
// Settings → Voices.
function readyTemplate(h: ReturnType<typeof install>, document = documentOf(h)): string {
  if (promptByName(h.deps.db, "article", "Storyteller") === undefined) {
    insertPrompt(h.deps.db, {
      id: randomUUID(),
      kind: "article",
      name: "Storyteller",
      body: story,
      slots: ["Topic", "Era"],
      updatedAt: "2026-09-12T00:00:00.000Z",
    });
    insertVoice(h.deps.db, {
      id: randomUUID(),
      provider: "elevenlabs",
      name: "Warm narrator",
      voiceId: "warm-voice",
    });
  }
  const id = randomUUID();
  const made = createTemplate(h.deps, { id, name: "Weekly history", document });
  if (!made.ok) throw new Error(made.reason);
  writeGate(h.deps.db, id, { version: 1, state: "ready", carriedFrom: null });
  return id;
}

const exportDeps = (h: ReturnType<typeof install>) => ({ ...h.deps, version: "4.0.0" });

async function exported(h: ReturnType<typeof install>, id: string, samples: PackSampleFile[] = []) {
  const result = await exportPack(exportDeps(h), id, () => samples);
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

describe("exportPack", () => {
  it("packs the ready version with its prompts' text, voice, Look and theme, and nothing of this computer's", async () => {
    const h = install();
    upsertKey(
      h.deps.db,
      "openrouter",
      "sk-or-v1-0123456789abcdef0123456789",
      "2026-09-12T00:00:00.000Z",
    );
    const id = readyTemplate(h);
    const pack = await exported(h, id);
    expect(pack.filename).toBe("weekly-history.slopify-pack.zip");
    expect(pack.version).toBe(1);
    const files = unzipSync(pack.bytes);
    expect(Object.keys(files)).toEqual(["manifest.json"]);
    const manifest = JSON.parse(strFromU8(files["manifest.json"] ?? new Uint8Array()));
    expect(manifest).toMatchObject({
      format: "slopify-template-pack",
      formatVersion: 1,
      slopifyVersion: "4.0.0",
      template: { name: "Weekly history", version: 1 },
      voice: { provider: "elevenlabs", voiceId: "warm-voice", name: "Warm narrator" },
      samples: [],
    });
    expect(manifest.template.document.form.document).toEqual({ theme: "plain" });
    expect(manifest.template.document.librarySnapshot.prompts).toMatchObject([
      { kind: "article", name: "Storyteller", body: story },
    ]);
    expect(manifest.template.document.channelId).toBeUndefined();
    // The stored key never reaches a pack, in any file.
    expect(strFromU8(pack.bytes, true)).not.toContain("sk-or-v1");
  });

  it("packs the version schedules run when the newest one isn't marked ready", async () => {
    const h = install();
    const id = readyTemplate(h);
    const edited = updateTemplate(h.deps, {
      id,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Weekly history",
      document: { ...documentOf(h), form: { ...documentOf(h).form, title: "Unchecked" } },
    });
    expect(edited.ok).toBe(true);
    const manifest = JSON.parse(
      strFromU8(unzipSync((await exported(h, id)).bytes)["manifest.json"] ?? new Uint8Array()),
    );
    expect(manifest.template.version).toBe(1);
    expect(manifest.template.document.form.title).toBe("History: {{Topic}}");
  });

  it("refuses a template with no version marked ready, and one whose text looks like a key", async () => {
    const h = install();
    const id = readyTemplate(h);
    h.deps.db.prepare("DELETE FROM template_gates WHERE template_id=?").run(id);
    expect(await exportPack(exportDeps(h), id)).toMatchObject({
      ok: false,
      reason: "not-ready",
      message: expect.stringContaining("Press Mark ready in the studio, then Export pack."),
    });
    const leaky = readyTemplate(h, {
      ...documentOf(h),
      form: {
        ...documentOf(h).form,
        values: { Topic: "", Era: "sk-proj-abcdefghijklmnopqrstuvwx" },
      },
    });
    expect(await exportPack(exportDeps(h), leaky)).toMatchObject({
      ok: false,
      reason: "invalid-input",
      message: expect.stringContaining("looks like an API key"),
    });
    expect(await exportPack(exportDeps(h), randomUUID())).toMatchObject({
      ok: false,
      reason: "not-found",
    });
  });

  it("takes the sample's thumbnail, up to four pictures and its narration from the sample project", async () => {
    const m = await mutationFixture();
    open.push(m.close);
    const deps = { ...m.deps, uuid: () => randomUUID() };
    const id = randomUUID();
    const h = install();
    const made = createTemplate(deps, { id, name: "Show", document: { ...h.document } });
    expect(made.ok).toBe(true);
    upsertSample(m.deps.db, id, {
      projectId: m.projectId,
      topic: "Lighthouses",
      topicSource: "fixed",
      fullScript: false,
      at: "2026-09-12T00:00:00.000Z",
    });
    retainedOutput(m.deps, m.base.revision, "thumbnail", "thumb.png", "thumb");
    for (const name of ["a", "b", "c", "d", "e"])
      retainedOutput(m.deps, m.base.revision, "image", `${name}.png`, name, `image:${name}`);
    retainedOutput(m.deps, m.base.revision, "audio_export", "narration.mp3", "mp3");
    retainedOutput(m.deps, m.base.revision, "video", "video.mp4", "mp4");
    const files = sampleFilesOf({ ...m.deps, version: "4.0.0" }, id);
    expect(files.map((file) => file.role)).toEqual([
      "thumbnail",
      "picture",
      "picture",
      "picture",
      "picture",
      "narration",
    ]);
    expect(readFileSync(files[0]?.path ?? "", "utf8")).toBe("thumb");
  });
});

describe("importPack", () => {
  it("round-trips: a new unchecked template with the Library text, voice, Look and samples, opened in the studio", async () => {
    const from = install();
    const id = readyTemplate(from);
    const samples: PackSampleFile[] = [
      {
        role: "thumbnail",
        name: "thumb.png",
        path: join(from.deps.paths.dataDir, "t.png"),
        bytes: 5,
        extension: "png",
      },
    ];
    const { writeFileSync } = await import("node:fs");
    writeFileSync(samples[0]?.path ?? "", "thumb");
    const pack = await exported(from, id, samples);

    const to = install();
    insertVoice(to.deps.db, {
      id: randomUUID(),
      provider: "elevenlabs",
      name: "Mine",
      voiceId: "warm-voice",
    });
    const result = importPack(to.deps, pack.bytes);
    if (!result.ok) throw new Error(result.message);
    expect(result.value).toMatchObject({
      name: "Weekly history",
      added: 1,
      renamed: [],
      voiceKnown: true,
      samples: 1,
    });
    const template = templateById(to.deps.db, result.value.templateId);
    expect(template?.version).toBe(1);
    expect(template?.document.form).toEqual(documentOf(from).form);
    // Unchecked: no schedule runs it until it is looked over and marked ready.
    expect(gatesOf(to.deps.db, result.value.templateId)).toEqual([]);
    expect(promptByName(to.deps.db, "article", "Storyteller")?.body).toBe(story);
    expect(packSamples(to.deps.paths, result.value.templateId)).toEqual([
      { file: "thumbnail-1.png", role: "thumbnail", name: "thumb.png" },
    ]);
    const file = packSampleFileOf(to.deps.paths, result.value.templateId, "thumbnail-1.png");
    expect(file === undefined ? "" : readFileSync(file.path, "utf8")).toBe("thumb");
    expect(
      packSampleFileOf(to.deps.paths, result.value.templateId, "../samples.json"),
    ).toBeUndefined();
  });

  it('brings a prompt whose name is taken by other text in as "<name> (2)", and points the template at it', async () => {
    const from = install();
    const pack = await exported(from, readyTemplate(from));
    const to = install();
    insertPrompt(to.deps.db, {
      id: randomUUID(),
      kind: "article",
      name: "Storyteller",
      body: "Mine, not the pack's.",
      slots: [],
      updatedAt: "2026-09-12T00:00:00.000Z",
    });
    const result = importPack(to.deps, pack.bytes);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.renamed).toEqual([{ from: "Storyteller", to: "Storyteller (2)" }]);
    expect(templateById(to.deps.db, result.value.templateId)?.document.form.articlePrompt).toBe(
      "Storyteller (2)",
    );
    expect(promptByName(to.deps.db, "article", "Storyteller")?.body).toBe("Mine, not the pack's.");
    expect(promptByName(to.deps.db, "article", "Storyteller (2)")?.body).toBe(story);
    // Imported twice: the same text is used again, and the template gets a name of its own.
    const again = importPack(to.deps, pack.bytes);
    if (!again.ok) throw new Error(again.message);
    expect(again.value.name).toBe("Weekly history (2)");
    expect(listPrompts(to.deps.db).filter((prompt) => prompt.kind === "article")).toHaveLength(2);
  });

  it("keeps a voice this computer doesn't have, and the Voice check asks to choose one", async () => {
    const from = install();
    const pack = await exported(from, readyTemplate(from));
    const to = install();
    const result = importPack(to.deps, pack.bytes);
    if (!result.ok) throw new Error(result.message);
    expect(result.value.voiceKnown).toBe(false);
    const template = templateById(to.deps.db, result.value.templateId);
    if (template === undefined) throw new Error("no template");
    const voice = freeChecks({
      templateId: template.id,
      document: template.document,
      bodies: [],
      providers: new Map(),
      schedules: [],
      voices: [],
      monthlyCost: null,
      notificationUrl: false,
      agentSeenAt: null,
      now: new Date(),
    }).find((check) => check.id === "voice");
    expect(voice).toMatchObject({
      ok: false,
      sentence:
        "The narration's voice (ID warm-voice) isn't one of your voices in Settings → Voices. Add it there under that ID, or choose one of yours.",
      fix: { label: "Choose a voice in Voice" },
    });
  });

  it("refuses a pack holding a key, and writes nothing", async () => {
    const from = install();
    const pack = await exported(from, readyTemplate(from));
    const manifest = JSON.parse(
      strFromU8(unzipSync(pack.bytes)["manifest.json"] ?? new Uint8Array()),
    );
    manifest.template.document.form.values.Era = "AIzaSyA0123456789abcdefghijklmnop";
    const leaky = zipSync({ "manifest.json": strToU8(JSON.stringify(manifest)) });
    const to = install();
    expect(importPack(to.deps, leaky)).toMatchObject({
      ok: false,
      reason: "invalid-input",
      message: expect.stringContaining("keys never travel in a pack"),
    });
    expect(to.deps.db.prepare("SELECT count(*) AS n FROM project_templates").get()).toEqual({
      n: 0,
    });
    expect(listPrompts(to.deps.db)).toEqual([]);
  });

  it("refuses an oversized pack or sample, a file a pack never has, and what isn't a pack", () => {
    const to = install();
    expect(readPack(new Uint8Array(packLimits.uploadBytes + 1))).toMatchObject({
      ok: false,
      message: expect.stringContaining("larger than 30 MB"),
    });
    const big = zipSync({
      "manifest.json": strToU8("{}"),
      "samples/picture-1.png": new Uint8Array(packLimits.sampleBytes + 1),
    });
    expect(readPack(big)).toMatchObject({
      ok: false,
      message: expect.stringContaining(
        "samples/picture-1.png is larger than a template pack allows",
      ),
    });
    const odd = zipSync({ "manifest.json": strToU8("{}"), "run.sh": strToU8("echo") });
    expect(readPack(odd)).toMatchObject({
      ok: false,
      message: expect.stringContaining("(run.sh)"),
    });
    expect(readPack(strToU8("not a zip"))).toMatchObject({
      ok: false,
      message: expect.stringContaining("isn't a template pack"),
    });
    expect(readPack(zipSync({ "notes.txt": strToU8("") }))).toMatchObject({ ok: false });
    expect(readPack(zipSync({ "manifest.json": strToU8("{oops") }))).toMatchObject({
      ok: false,
      message: expect.stringContaining("isn't readable JSON"),
    });
    const newer = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({ format: "slopify-template-pack", formatVersion: 2 }),
      ),
    });
    expect(readPack(newer)).toMatchObject({
      ok: false,
      message: expect.stringContaining("made by a newer Slopify (pack format 2)"),
    });
    const missing = zipSync({
      "manifest.json": strToU8(
        JSON.stringify({ format: "slopify-template-pack", formatVersion: 1 }),
      ),
    });
    expect(readPack(missing)).toMatchObject({
      ok: false,
      message: expect.stringContaining("manifest isn't one Slopify can use"),
    });
    expect(packSamplesDir(to.deps.paths, "x")).toContain(join("template-studio", "packs", "x"));
  });
});

// A pack whose central directory lists manifest.json and then `names.length` entries that all
// point at one deflated block of `size` zeros: tiny on disk, far larger once unpacked.
function overlappingZip(names: readonly string[], size: number): Uint8Array {
  const one = zipSync(
    { "manifest.json": strToU8("{}"), "samples/x.png": new Uint8Array(size) },
    { level: 9 },
  );
  const view = new DataView(one.buffer, one.byteOffset, one.byteLength);
  const eocd = one.byteLength - 22;
  const cdOffset = view.getUint32(eocd + 16, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const directory = one.slice(cdOffset, cdOffset + cdSize);
  const at = (offset: number) => new DataView(directory.buffer).getUint16(offset, true);
  const firstLength = 46 + at(28) + at(30) + at(32);
  const manifestRecord = directory.slice(0, firstLength);
  const sampleHead = directory.slice(firstLength, firstLength + 46);
  const records: Uint8Array[] = [manifestRecord];
  for (const name of names) {
    const bytes = strToU8(name);
    const entry = new Uint8Array(46 + bytes.length);
    entry.set(sampleHead);
    const entryView = new DataView(entry.buffer);
    entryView.setUint16(28, bytes.length, true);
    entryView.setUint16(30, 0, true);
    entryView.setUint16(32, 0, true);
    entry.set(bytes, 46);
    records.push(entry);
  }
  const length = records.reduce((n, r) => n + r.length, 0);
  const end = one.slice(eocd);
  const endView = new DataView(end.buffer);
  endView.setUint16(8, records.length, true);
  endView.setUint16(10, records.length, true);
  endView.setUint32(12, length, true);
  const out = new Uint8Array(cdOffset + length + end.length);
  out.set(one.slice(0, cdOffset));
  let offset = cdOffset;
  for (const r of records) {
    out.set(r, offset);
    offset += r.length;
  }
  out.set(end, offset);
  return out;
}

const pictureNames = (count: number) =>
  Array.from({ length: count }, (_, i) => `samples/p${String(i).padStart(5, "0")}.png`);

describe("readPack against zip bombs", () => {
  it("refuses a zip whose entries overlap, without unpacking them", () => {
    const bomb = overlappingZip(pictureNames(2000), packLimits.sampleBytes);
    expect(bomb.byteLength).toBeLessThan(packLimits.uploadBytes);
    const before = process.memoryUsage().arrayBuffers;
    const started = performance.now();
    expect(readPack(bomb)).toMatchObject({
      ok: false,
      message: expect.stringContaining("more files than a template pack ever has"),
    });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(process.memoryUsage().arrayBuffers - before).toBeLessThan(64 * 1024 * 1024);
  });

  it("refuses a pack one file over the count, and two entries with the same name", () => {
    expect(readPack(overlappingZip(pictureNames(packLimits.samples + 1), 10))).toMatchObject({
      ok: false,
      message: expect.stringContaining("more files than a template pack ever has"),
    });
    expect(readPack(overlappingZip(["samples/a.png", "samples/a.png"], 10))).toMatchObject({
      ok: false,
      message: expect.stringContaining("holds samples/a.png twice"),
    });
    expect(readPack(overlappingZip(pictureNames(packLimits.samples), 10))).toMatchObject({
      ok: false,
      message: expect.not.stringContaining("more files"),
    });
  });
});
