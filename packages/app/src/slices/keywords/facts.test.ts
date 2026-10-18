import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunDraft } from "../admission/model.js";
import { startRun } from "../admission/start.js";
import { defaultChannelId } from "../channels/model.js";
import { channelById, setProjectChannel } from "../channels/repo.js";
import { createCastMember, createChannel, updateChannel } from "../channels/service.js";
import type { StorageDeps } from "../storage/staging.js";
import { setRelease } from "../studio/releases.js";
import { recordVideo } from "../studio/videos.js";
import { keywordFactsFor } from "./facts.js";
import { usesFacts } from "./rules.js";

const clock = fixedClock("2026-10-01T10:00:00.000Z");

function harness() {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-facts-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: () => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  // Each project a minute after the one before, so "newest" is never a tie.
  let at = Date.parse("2026-09-01T00:00:00.000Z");
  const ticking = {
    now: () => {
      at += 60_000;
      return new Date(at);
    },
    sleep: () => Promise.resolve(),
  };
  const storage: StorageDeps = {
    db,
    paths,
    ids,
    clock: ticking,
    log: { write: () => {} },
    emit: () => {},
  };
  return { db, paths, storage };
}

function draft(title: string, over: Partial<RunDraft> = {}): RunDraft {
  return {
    title,
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    imagePrompts: [],
    values: {},
    provided: { article: "Text." },
    silenceGapSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0,
    ...over,
  };
}

describe("usesFacts", () => {
  it("is true only for a body asking for a fact Slopify copies", () => {
    expect(usesFacts(["{{Slopify_Channel}}"])).toBe(true);
    expect(usesFacts(["{{Slopify_Title}} {{Slopify_Summary}} {{Channel}}"])).toBe(false);
    expect(usesFacts([])).toBe(false);
  });
});

describe("keywordFactsFor", () => {
  it("copies the channel, its links, cast, brand kit and neighbouring videos", () => {
    const h = harness();
    const channel = channelById(h.db, defaultChannelId);
    if (channel === undefined) throw new Error("no default channel");
    expect(
      updateChannel({ db: h.db, clock, uuid: randomUUID }, defaultChannelId, {
        name: "Night Archive",
        brand: {
          captionColor: "#ffffff",
          titleColor: "#f5c542",
          titleFontId: "default",
          links: [{ name: "Website", url: "https://example.com" }],
        },
        seriesBrief: " Calm legends. ",
        baseVersion: channel.version,
      }).ok,
    ).toBe(true);
    createCastMember({ db: h.db, clock, uuid: randomUUID }, defaultChannelId, {
      id: randomUUID(),
      kind: "character",
      name: "Mira",
      description: "an archivist",
    });
    const first = startRun(h.storage, draft("The Bridge | Legends"), {}).project;
    recordVideo(h.db, first.id, null, "abcdefghijk", "2026-09-20T00:00:00.000Z");
    const other = startRun(h.storage, draft("A cooking show"), {}).project;
    const planned = startRun(h.storage, draft("The Queen | Legends"), {}).project;
    setRelease(h.db, planned.id, 0, "2026-10-08T18:00:00.000Z", null, clock.now());

    expect(
      keywordFactsFor(h, { title: "The Gate | Legends", channelId: defaultChannelId }, clock.now()),
    ).toEqual({
      channel: "Night Archive",
      series: "Calm legends.",
      links: [{ name: "Website", url: "https://example.com" }],
      previousVideo: { title: "The Queen | Legends" },
      nextVideo: { title: "The Queen | Legends" },
      cast: [{ name: "Mira", description: "an archivist" }],
      coveredBefore: [planned.title, other.title, first.title],
      episode: 3,
      brand: { colours: ["#FFFFFF", "#F5C542"], fonts: ["Barlow"] },
    });
  });

  it("links the previous video in the series when it is on YouTube", () => {
    const h = harness();
    const first = startRun(h.storage, draft("The Bridge | Legends"), {}).project;
    recordVideo(h.db, first.id, null, "abcdefghijk", "2026-09-20T00:00:00.000Z");
    expect(keywordFactsFor(h, { title: "The Gate | Legends" }, clock.now()).previousVideo).toEqual({
      title: "The Bridge | Legends",
      url: "https://youtu.be/abcdefghijk",
    });
  });

  it("counts episodes and neighbours in the project's own channel and series only", () => {
    const h = harness();
    const lore = randomUUID();
    createChannel({ db: h.db, clock, uuid: randomUUID }, { id: lore, name: "Other" });
    const elsewhere = startRun(h.storage, draft("Far | Legends"), {}).project;
    setProjectChannel(h.db, elsewhere.id, lore);
    startRun(h.storage, draft("Unrelated | Cooking"), {});
    const facts = keywordFactsFor(h, { title: "The Gate | Legends" }, clock.now());
    expect(facts.episode).toBe(1);
    expect(facts.previousVideo).toBeUndefined();
    expect(facts.nextVideo).toBeUndefined();
    expect(facts.coveredBefore).toEqual(["Unrelated | Cooking"]);
  });

  it("reads the series from the title pattern, and leaves out the project itself", () => {
    const h = harness();
    const own = startRun(h.storage, draft("The Gate | Legends"), {}).project;
    const facts = keywordFactsFor(
      h,
      { title: "The Gate | Legends", titlePattern: "{{Topic}} | Legends" },
      clock.now(),
      own.id,
    );
    expect(facts.episode).toBe(1);
    expect(facts.coveredBefore).toBeUndefined();
  });

  it("copies no brand kit for a run with the kit turned off, and nothing a channel lacks", () => {
    const h = harness();
    const facts = keywordFactsFor(h, { title: "T", useBrandKit: false }, clock.now());
    expect(facts.brand).toBeUndefined();
    expect(facts.series).toBeUndefined();
    expect(facts.links).toBeUndefined();
    expect(facts.cast).toBeUndefined();
  });

  it("names no font it can't read without scanning the computer", () => {
    const h = harness();
    const channel = channelById(h.db, defaultChannelId);
    if (channel === undefined) throw new Error("no default channel");
    updateChannel({ db: h.db, clock, uuid: randomUUID }, defaultChannelId, {
      name: channel.name,
      brand: {
        titleFontId: `system-${"a".repeat(64)}`,
        captionFontId: `uploaded-${"b".repeat(64)}`,
      },
      seriesBrief: "",
      baseVersion: channel.version,
    });
    expect(keywordFactsFor(h, { title: "T" }, clock.now()).brand).toBeUndefined();
  });
});

describe("keywordFactsFor on a refresh", () => {
  it("sees only the episodes made before the project, and plans after it", () => {
    const h = harness();
    const first = startRun(h.storage, draft("The Bridge | Legends"), {}).project;
    const own = startRun(h.storage, draft("The Gate | Legends"), {}).project;
    const after = startRun(h.storage, draft("The Queen | Legends"), {}).project;
    setRelease(h.db, after.id, 0, "2026-10-08T18:00:00.000Z", null, clock.now());
    const facts = keywordFactsFor(h, { title: own.title }, clock.now(), own.id);
    expect(facts.episode).toBe(2);
    expect(facts.previousVideo).toEqual({ title: first.title });
    expect(facts.coveredBefore).toEqual([first.title]);
    expect(facts.nextVideo).toEqual({ title: after.title });
  });
});
