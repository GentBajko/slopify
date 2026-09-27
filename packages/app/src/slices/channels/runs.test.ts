import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RunDraft } from "../admission/model.js";
import type { Entry } from "../library/model.js";
import { draftFixture, must, reviewFixture } from "../play-drafts/draft.fake.js";
import { reviewDraft } from "../play-drafts/review.js";
import { createDraft } from "../play-drafts/service.js";
import {
  createTemplate,
  instantiateTemplate,
  listTemplates,
} from "../project-templates/service.js";
import { uploadCastImage } from "./cast-images.js";
import { type Channel, defaultChannelId } from "./model.js";
import { brandedForm, brandedRun, castSnapshot, draftChannel } from "./runs.js";
import { createCastMember, createChannel, moveTemplate, updateChannel } from "./service.js";

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]);
const entry = (category: "intro" | "outro", name: string): Entry => ({
  id: name,
  category,
  mode: "text",
  name,
  body: "Hello",
  slots: [],
  updatedAt: "a",
});
const channel: Channel = {
  id: defaultChannelId,
  name: "My channel",
  isDefault: true,
  brand: {
    captionFontId: "barlow",
    captionColor: "#FFD700",
    captionOutlineColor: "#000000",
    titleFontId: "cinzel",
    titleColor: "#FF0000",
    intro: "Channel intro",
    outro: "Gone outro",
    endScreenText: "Subscribe for more lore",
    documentTheme: "plain",
  },
  seriesBrief: "",
  version: 1,
  createdAt: "a",
  updatedAt: "a",
};

describe("brand kit defaults", () => {
  const h = draftFixture();
  const form = h.document.form;
  h.close();

  it("fills what the setup leaves at its default and skips what no longer exists", () => {
    const branded = brandedForm(h.deps.db, form, channel.brand, [entry("intro", "channel intro")]);
    expect(branded.subtitles.fontId).toBe("barlow");
    expect(branded.intro).toBe("channel intro");
    // The outro entry was deleted, so the setup keeps none rather than being refused.
    expect(branded.outro).toBe("");
    expect(branded.document).toEqual({ theme: "plain" });
  });

  it("leaves what the template set itself, and everything when the kit is off", () => {
    const own = {
      ...form,
      intro: "Own intro",
      subtitles: { ...form.subtitles, fontId: "inter" },
      document: { theme: "plain" as const },
    };
    const branded = brandedForm(h.deps.db, own, channel.brand, [entry("intro", "channel intro")]);
    expect(branded).toEqual(own);
    const off = { ...form, useBrandKit: false };
    expect(brandedForm(h.deps.db, off, channel.brand, [])).toEqual(off);
  });

  it("gives a draft without a language the channel's, even with the kit off", () => {
    const brand = { ...channel.brand, language: "de" };
    expect(brandedForm(h.deps.db, form, brand, []).language).toBe("de");
    expect(brandedForm(h.deps.db, { ...form, useBrandKit: false }, brand, []).language).toBe("de");
    // English picked on Play is the draft's own choice.
    expect(brandedForm(h.deps.db, { ...form, language: "en" }, brand, []).language).toBe("en");
    expect(brandedForm(h.deps.db, form, channel.brand, []).language).toBeUndefined();
  });

  const draft = {
    title: "T",
    subtitles: {
      mode: "burn-in",
      language: "en",
      fontId: "barlow",
      fontSize: 48,
      position: "bottom",
    },
  } as unknown as RunDraft;
  const cast = [{ name: "Tiamat", aliases: [], description: "", images: ["a".repeat(64)] }];

  it("adds caption colours, the title style, the end screen, the channel and the cast", () => {
    expect(brandedRun(draft, channel, cast, true)).toMatchObject({
      channelId: defaultChannelId,
      subtitles: { fontId: "barlow", color: "#FFD700", outlineColor: "#000000" },
      titleStyle: { fontId: "cinzel", color: "#FF0000" },
      endScreen: { text: "Subscribe for more lore" },
      cast,
    });
  });

  it("adds only the channel and cast with the kit off, and nothing for an empty kit", () => {
    const off = brandedRun(draft, channel, cast, false);
    expect(off).toEqual({ ...draft, channelId: defaultChannelId, cast });
    expect(brandedRun(draft, { ...channel, brand: {} }, [], true)).toEqual({
      ...draft,
      channelId: defaultChannelId,
    });
  });
});

describe("runs from a channel", () => {
  it("resolve the Play pick first, then the template's channel, then the default", () => {
    const h = draftFixture();
    try {
      const other = randomUUID();
      createChannel(h.deps, { id: other, name: "Other" });
      const templateId = randomUUID();
      expect(
        createTemplate(h.deps, {
          id: templateId,
          name: "Setup",
          document: { ...h.document, channelId: other },
        }).ok,
      ).toBe(true);
      expect(listTemplates(h.deps)).toMatchObject([{ id: templateId, channelId: other }]);
      const draft = instantiateTemplate(h.deps, {
        templateId,
        id: randomUUID(),
        version: 1,
      });
      if (!draft.ok) throw new Error("instantiate failed");
      // The template's stored setup does not carry the channel; the draft is given its current one.
      expect(draft.value.draft.document.channelId).toBe(other);
      moveTemplate(h.deps, templateId, { channelId: defaultChannelId });
      const { channelId: _picked, ...unpicked } = draft.value.draft.document;
      expect(draftChannel(h.deps.db, unpicked).id).toBe(defaultChannelId);
      expect(draftChannel(h.deps.db, draft.value.draft.document).id).toBe(other);
      expect(draftChannel(h.deps.db, h.document).id).toBe(defaultChannelId);
    } finally {
      h.close();
    }
  });

  it("carry the channel's kit and cast into the reviewed run", async () => {
    const h = reviewFixture();
    try {
      const id = randomUUID();
      createChannel(h.deps, { id, name: "Lore" });
      updateChannel(h.deps, id, {
        name: "Lore",
        brand: { endScreenText: "Subscribe", titleColor: "#FFD700" },
        seriesBrief: "",
        baseVersion: 1,
      });
      const member = randomUUID();
      createCastMember(h.deps, id, { id: member, kind: "creature", name: "Tiamat" });
      // A member without a finished picture is left out.
      createCastMember(h.deps, id, { id: randomUUID(), kind: "place", name: "Avernus" });
      uploadCastImage(h.deps, member, png);
      expect(castSnapshot(h.deps.db, id)).toEqual([
        { name: "Tiamat", aliases: [], description: "", images: [expect.any(String)] },
      ]);
      const draftId = randomUUID();
      must(createDraft(h.deps, { id: draftId, document: { ...h.document, channelId: id } }));
      const reviewed = must(await reviewDraft(h.deps, { id: draftId, baseVersion: 1 }));
      expect(reviewed.runs[0]?.draft).toMatchObject({
        channelId: id,
        endScreen: { text: "Subscribe" },
        titleStyle: { color: "#FFD700" },
        cast: [{ name: "Tiamat" }],
      });
      const plainId = randomUUID();
      must(createDraft(h.deps, { id: plainId, document: h.document }));
      const plain = must(await reviewDraft(h.deps, { id: plainId, baseVersion: 1 }));
      expect(plain.runs[0]?.draft).not.toHaveProperty("cast");
      expect(plain.runs[0]?.draft).not.toHaveProperty("endScreen");
      expect(plain.runs[0]?.draft.channelId).toBe(defaultChannelId);
    } finally {
      h.close();
    }
  });
});
