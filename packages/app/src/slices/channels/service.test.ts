import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { GeneratedImage } from "../../kernel/ports/image.js";
import { withChannelBrief } from "../schedules/topics.js";
import {
  deleteCastImage,
  generateCastImage,
  settleInterruptedCastImages,
  uploadCastImage,
} from "./cast-images.js";
import { castImagesPerMember } from "./images.js";
import { defaultChannelId } from "./model.js";
import { projectChannelId, scheduleChannel, templateChannelId } from "./repo.js";
import {
  createCastMember,
  createChannel,
  deleteChannel,
  listChannels,
  moveTemplate,
  readChannel,
  updateCastMember,
  updateChannel,
} from "./service.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 9, 9]);

function fixture() {
  const db = openDb(":memory:");
  migrate(db, clock);
  return { db, clock, uuid: randomUUID };
}

function template(db: ReturnType<typeof openDb>, id: string, channelId: string | null): void {
  db.prepare(
    "INSERT INTO project_templates(id,head_version,creation_hash,created_at,channel_id) VALUES (?,1,'h','old',?)",
  ).run(id, channelId);
}

describe("migration 0032", () => {
  it("puts every existing template and project in the default channel, unchanged", () => {
    const db = openDb(":memory:");
    migrate(db, clock, { through: 24 });
    db.prepare(
      "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES ('t1',1,'h','old')",
    ).run();
    db.prepare(
      "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES ('p1','Saved','16:9','{\"title\":\"Saved\"}','old','old')",
    ).run();
    const before = db.prepare("SELECT * FROM projects").all();
    migrate(db, clock);
    expect(listChannels({ db })).toMatchObject([
      { id: defaultChannelId, name: "My channel", isDefault: true, brand: {}, templates: 1 },
    ]);
    expect(templateChannelId(db, "t1")).toBe(defaultChannelId);
    expect(projectChannelId(db, "p1")).toBe(defaultChannelId);
    // The project row, config included, is exactly what it was.
    expect(db.prepare("SELECT * FROM projects").all()).toEqual(before);
  });

  it("reads a missing or unknown channel as the default one", () => {
    const { db } = fixture();
    template(db, "t2", "0b9f8a4c-3c1e-4c5e-9d0a-1a2b3c4d5e6f");
    template(db, "t3", null);
    expect(templateChannelId(db, "t2")).toBe(defaultChannelId);
    expect(templateChannelId(db, "t3")).toBe(defaultChannelId);
    expect(projectChannelId(db, "nothing")).toBe(defaultChannelId);
  });
});

describe("channels", () => {
  it("creates, renames and saves a brand kit, leaving blank fields out", () => {
    const deps = fixture();
    const id = randomUUID();
    const created = createChannel(deps, { id, name: " Lore " });
    expect(created).toMatchObject({ ok: true, value: { name: "Lore", version: 1 } });
    expect(createChannel(deps, { id, name: "Lore" }).ok).toBe(true);
    expect(createChannel(deps, { id, name: "Other" })).toMatchObject({ reason: "conflict" });
    const saved = updateChannel(deps, id, {
      name: "Lore Weekly",
      brand: { captionColor: "#ffd700", intro: "", endScreenText: "Subscribe" },
      seriesBrief: "D&D lore, famous villains first",
      baseVersion: 1,
    });
    expect(saved).toMatchObject({
      ok: true,
      value: {
        name: "Lore Weekly",
        brand: { captionColor: "#FFD700", endScreenText: "Subscribe" },
        seriesBrief: "D&D lore, famous villains first",
        version: 2,
      },
    });
    if (saved.ok) expect(saved.value.brand).not.toHaveProperty("intro");
    expect(
      updateChannel(deps, id, { name: "x", brand: {}, seriesBrief: "", baseVersion: 1 }),
    ).toMatchObject({ reason: "conflict" });
    expect(
      updateChannel(deps, id, {
        name: "x",
        brand: { titleColor: "gold" },
        seriesBrief: "",
        baseVersion: 2,
      }),
    ).toMatchObject({ reason: "invalid-input", message: "Use a colour like #FFD700." });
  });

  it("refuses to delete the default channel or one with templates, and moves projects", () => {
    const deps = fixture();
    const id = randomUUID();
    createChannel(deps, { id, name: "Second" });
    expect(deleteChannel(deps, defaultChannelId)).toMatchObject({ reason: "default-channel" });
    template(deps.db, "t1", id);
    expect(deleteChannel(deps, id)).toMatchObject({ reason: "has-templates" });
    expect(moveTemplate(deps, "t1", { channelId: defaultChannelId }).ok).toBe(true);
    deps.db
      .prepare(
        "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES ('p1','t','16:9','{}','a','a')",
      )
      .run();
    deps.db.prepare("INSERT INTO project_channels(project_id,channel_id) VALUES ('p1',?)").run(id);
    expect(deleteChannel(deps, id).ok).toBe(true);
    expect(projectChannelId(deps.db, "p1")).toBe(defaultChannelId);
    expect(readChannel(deps, id)).toMatchObject({ reason: "not-found" });
  });

  it("moves a template, and its schedules follow it", () => {
    const deps = fixture();
    const id = randomUUID();
    createChannel(deps, { id, name: "Second" });
    template(deps.db, "t1", null);
    deps.db
      .prepare(
        "INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,status,version,creation_hash,created_at,updated_at) VALUES ('s1','S','t1',1,'{}','UTC','skip','skip','[]','paused',1,'h','a','a')",
      )
      .run();
    expect(scheduleChannel(deps.db, "s1")?.id).toBe(defaultChannelId);
    expect(moveTemplate(deps, "t1", { channelId: id })).toMatchObject({ ok: true });
    expect(scheduleChannel(deps.db, "s1")?.id).toBe(id);
    expect(moveTemplate(deps, "t1", { channelId: randomUUID() })).toMatchObject({
      reason: "not-found",
    });
    expect(moveTemplate(deps, "missing", { channelId: id })).toMatchObject({ reason: "not-found" });
  });
});

describe("the cast", () => {
  it("keeps members with their aliases, dropping repeats and the name itself", () => {
    const deps = fixture();
    const id = randomUUID();
    const created = createCastMember(deps, defaultChannelId, {
      id,
      kind: "creature",
      name: "Tiamat",
      aliases: ["tiamat", "Dragon Queen", "dragon queen", "Takhisis"],
      description: "Five-headed dragon",
    });
    expect(created).toMatchObject({
      ok: true,
      value: { name: "Tiamat", aliases: ["Dragon Queen", "Takhisis"], images: [] },
    });
    expect(
      updateCastMember(deps, id, {
        kind: "creature",
        name: "Tiamat",
        aliases: [""],
        baseVersion: 1,
      }),
    ).toMatchObject({
      reason: "invalid-input",
      message: "Enter a name, and remove empty aliases.",
    });
    expect(
      updateCastMember(deps, id, { kind: "creature", name: "Tiamat", aliases: [], baseVersion: 1 }),
    ).toMatchObject({ ok: true, value: { aliases: [], version: 2 } });
    expect(readChannel(deps, defaultChannelId)).toMatchObject({
      ok: true,
      value: { cast: [{ id, name: "Tiamat" }] },
    });
  });

  it("stores uploaded PNG and JPEG pictures by hash and refuses anything else", () => {
    const deps = fixture();
    const id = randomUUID();
    createCastMember(deps, defaultChannelId, { id, kind: "place", name: "Waterdeep" });
    const first = uploadCastImage(deps, id, png);
    expect(first).toMatchObject({ ok: true, value: { source: "upload", state: "ready" } });
    expect(uploadCastImage(deps, id, jpeg).ok).toBe(true);
    expect(uploadCastImage(deps, id, new Uint8Array([1, 2, 3]))).toMatchObject({
      reason: "not-an-image",
      message: "This file is not a PNG or JPEG picture. Upload a PNG or JPEG file.",
    });
    // The same bytes twice are one stored picture.
    uploadCastImage(deps, id, png);
    expect(deps.db.prepare("SELECT count(*) AS n FROM image_blobs").get()?.n).toBe(2);
    uploadCastImage(deps, id, png);
    expect(uploadCastImage(deps, id, png)).toMatchObject({ reason: "too-many-images" });
    if (!first.ok) throw new Error("upload failed");
    expect(deleteCastImage(deps, id, first.value.id).ok).toBe(true);
    // A project started with the picture still names its bytes.
    expect(deps.db.prepare("SELECT count(*) AS n FROM image_blobs").get()?.n).toBe(2);
    expect(castImagesPerMember).toBe(4);
  });

  it("makes a picture in the background, upright for characters", async () => {
    const deps = fixture();
    const id = randomUUID();
    createCastMember(deps, defaultChannelId, { id, kind: "character", name: "Drizzt" });
    const requests: unknown[] = [];
    let answer: (image: GeneratedImage) => void = () => undefined;
    const generateImage = (request: unknown) => {
      requests.push(request);
      return new Promise<GeneratedImage>((resolve) => {
        answer = resolve;
      });
    };
    const started = generateCastImage({ ...deps, generateImage }, id, {
      prompt: "Drizzt, full body",
      provider: "openai-image",
      model: "gpt-image-2",
    });
    expect(started).toMatchObject({ ok: true, value: { state: "generating", sha256: null } });
    expect(requests).toEqual([
      {
        prompt: "Drizzt, full body",
        provider: "openai-image",
        model: "gpt-image-2",
        aspect: "9:16",
      },
    ]);
    answer({ bytes: png, mime: "image/png" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const member = readChannel(deps, defaultChannelId);
    expect(member).toMatchObject({
      ok: true,
      value: { cast: [{ images: [{ state: "ready", source: "generate" }] }] },
    });
  });

  it("records a failed picture with the reason and how to fix it", async () => {
    const deps = fixture();
    const id = randomUUID();
    createCastMember(deps, defaultChannelId, { id, kind: "place", name: "Candlekeep" });
    generateCastImage(
      { ...deps, generateImage: () => Promise.reject(new Error("The key was rejected.")) },
      id,
      { prompt: "A library fortress", provider: "fal", model: "flux" },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const read = readChannel(deps, defaultChannelId);
    if (!read.ok) throw new Error("read failed");
    expect(read.value.cast[0]?.images[0]).toMatchObject({
      state: "failed",
      error: expect.stringContaining("The key was rejected. Check the image provider in Settings"),
    });
    expect(generateCastImage(deps, id, { prompt: "x", provider: "fal", model: "f" })).toMatchObject(
      { reason: "no-image-provider" },
    );
  });

  it("fails a picture that was still being made when Slopify stopped", () => {
    const deps = fixture();
    const id = randomUUID();
    createCastMember(deps, defaultChannelId, { id, kind: "object", name: "Wand" });
    generateCastImage({ ...deps, generateImage: () => new Promise(() => undefined) }, id, {
      prompt: "A wand",
      provider: "fal",
      model: "flux",
    });
    expect(settleInterruptedCastImages(deps)).toBe(1);
    const read = readChannel(deps, defaultChannelId);
    expect(read.ok && read.value.cast[0]?.images[0]?.state).toBe("failed");
  });
});

describe("the series brief", () => {
  it("is what a schedule without a brief of its own reads, through its template", () => {
    const deps = fixture();
    template(deps.db, "t1", null);
    deps.db
      .prepare(
        "INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,status,version,creation_hash,created_at,updated_at) VALUES ('s1','S','t1',1,'{}','UTC','skip','skip','[]','paused',1,'h','a','a')",
      )
      .run();
    updateChannel(deps, defaultChannelId, {
      name: "My channel",
      brand: {},
      seriesBrief: "Famous villains first",
      baseVersion: 1,
    });
    const schedule = { id: "s1", brief: null };
    expect(withChannelBrief(deps, schedule).brief).toBe("Famous villains first");
    expect(withChannelBrief(deps, { ...schedule, brief: "Own brief" }).brief).toBe("Own brief");
  });
});
