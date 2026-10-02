import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { adoptBaseline } from "../revisions/adopt.js";
import { saveRevision } from "../revisions/mutations.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { uploadCastImage } from "./cast-images.js";
import { defaultChannelId } from "./model.js";
import { projectChannelId, setProjectChannel } from "./repo.js";
import { createCastMember, createChannel, updateChannel } from "./service.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);
const fixtures: ReturnType<typeof revisionFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.close();
});

// A project made in the default channel, whose kit is empty, and a second channel "Lore" with
// a brand kit and one cast member with a picture.
function fixture() {
  const h = revisionFixture();
  fixtures.push(h);
  const deps = { db: h.deps.db, clock: h.deps.clock, uuid: randomUUID };
  const lore = randomUUID();
  createChannel(deps, { id: lore, name: "Lore" });
  updateChannel(deps, lore, {
    name: "Lore",
    brand: {
      captionFontId: "barlow",
      captionColor: "#FFD700",
      titleColor: "#FF0000",
      endScreenText: "Subscribe for more lore",
    },
    seriesBrief: "",
    baseVersion: 1,
  });
  const member = randomUUID();
  createCastMember(deps, lore, { id: member, kind: "creature", name: "Cleopatra" });
  uploadCastImage(deps, member, png);
  const config: RunConfig = {
    ...h.config,
    channelId: defaultChannelId,
    subtitles: { mode: "off", language: "en", fontId: "default", fontSize: 48, position: "bottom" },
  };
  h.deps.db
    .prepare("UPDATE projects SET config=? WHERE id=?")
    .run(JSON.stringify(config), h.projectId);
  setProjectChannel(h.deps.db, h.projectId, defaultChannelId);
  const baseline = adoptBaseline(h.deps, h.projectId);
  if (!baseline.ok) throw new Error("Expected a baseline.");
  return { ...h, lore, base: baseline.view };
}

async function save(h: ReturnType<typeof fixture>, config: RunConfig, key = "save") {
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: h.base.revision.id,
    idempotencyKey: key,
    edit: { config, content: h.base.revision.content },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  return saved.view.revision;
}

describe("changing a project's channel in Edit project", () => {
  it("takes the new channel's cast and brand kit, and moves the project", async () => {
    const h = fixture();
    const revision = await save(h, { ...h.base.revision.config, channelId: h.lore });
    expect(revision.config).toMatchObject({
      channelId: h.lore,
      cast: [{ name: "Cleopatra", aliases: [], description: "", images: [expect.any(String)] }],
      subtitles: { fontId: "barlow", color: "#FFD700" },
      titleStyle: { color: "#FF0000" },
      endScreen: { text: "Subscribe for more lore" },
    });
    expect(revision.config).not.toHaveProperty("useBrandKit");
    expect(projectChannelId(h.deps.db, h.projectId)).toBe(h.lore);
  });

  it("keeps what the person set themselves", async () => {
    const h = fixture();
    const own = h.base.revision.config.subtitles;
    if (own === undefined) throw new Error("Expected subtitles.");
    const revision = await save(h, {
      ...h.base.revision.config,
      channelId: h.lore,
      subtitles: { ...own, fontId: "inter", color: "#00FF00" },
    });
    expect(revision.config.subtitles).toMatchObject({ fontId: "inter", color: "#00FF00" });
    expect(revision.config.titleStyle).toEqual({ color: "#FF0000" });
  });

  it("with the brand kit off takes the cast but none of the kit, and saves the switch", async () => {
    const h = fixture();
    const revision = await save(h, {
      ...h.base.revision.config,
      channelId: h.lore,
      useBrandKit: false,
    });
    expect(revision.config).toMatchObject({ channelId: h.lore, useBrandKit: false });
    expect(revision.config.cast).toHaveLength(1);
    expect(revision.config).not.toHaveProperty("titleStyle");
    expect(revision.config).not.toHaveProperty("endScreen");
    expect(revision.config.subtitles?.fontId).toBe("default");
  });

  it("takes the kit back off a project when it moves to a channel without one", async () => {
    const h = fixture();
    const moved = await save(h, { ...h.base.revision.config, channelId: h.lore });
    const back = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: moved.id,
      idempotencyKey: "back",
      edit: { config: { ...moved.config, channelId: defaultChannelId }, content: moved.content },
    });
    if (!back.ok) throw new Error(JSON.stringify(back));
    const { config } = back.view.revision;
    expect(config.subtitles).toMatchObject({ fontId: "default" });
    expect(config.subtitles).not.toHaveProperty("color");
    expect(config).not.toHaveProperty("titleStyle");
    expect(config).not.toHaveProperty("endScreen");
    expect(config).not.toHaveProperty("cast");
    expect(projectChannelId(h.deps.db, h.projectId)).toBe(defaultChannelId);
  });

  it("changes nothing about the channel, cast or brand when the channel stays", async () => {
    const h = fixture();
    const revision = await save(h, { ...h.base.revision.config, title: "Renamed" });
    const { title: _before, ...before } = h.base.revision.config;
    const { title: _after, subjectTitle, ...after } = revision.config;
    expect(after).toEqual(before);
    // The rename keeps what the project is about (`revisions/subject.ts`).
    expect(subjectTitle).toBe(h.base.revision.config.title);
    expect(revision.fingerprints).toEqual(h.base.revision.fingerprints);
    expect(projectChannelId(h.deps.db, h.projectId)).toBe(defaultChannelId);
  });
});
