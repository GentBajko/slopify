import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import type { Log } from "../../kernel/log.js";
import type { RunConfig } from "../../slices/admission/model.js";
import { defaultChoices } from "../../slices/social/defaults.js";
import type { ActivePost, FillResponse, SocialPacksResponse } from "../../slices/social/model.js";
import type { Reshaper } from "../../slices/social/reshape.js";
import { type PackFixture, packFixture } from "../../slices/social/social.fake.js";
import { setRelease } from "../../slices/studio/releases.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const extension = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";
const open: PackFixture[] = [];
afterEach(() => {
  for (const one of open.splice(0)) one.close();
});

function harness(config: Partial<RunConfig> = {}, reshaper?: Reshaper) {
  const fixture = packFixture({ youtubeDescription: true, ...config });
  open.push(fixture);
  fixture.output("youtube_description", "description.txt", "A tower on a rock.\n\n0:00 Rock\n");
  fixture.output("youtube_tags", "tags.txt", "towers, sea");
  fixture.output("video", "video.mp4", "mp4", {}, 60_000);
  fixture.output("image", "images/image-001.png", "png", { index: 1 });
  let n = 0;
  const ids = { next: (): string => `id${String(++n)}` };
  const app = createApp({
    db: fixture.db,
    paths: fixture.paths,
    hub: createHub({ ids, log }),
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortProject: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    clock,
    ids,
    log,
    version: "1.2.3",
    webDist: join(fixture.paths.dataDir, "missing"),
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
    ...(reshaper === undefined ? {} : { social: { reshaper } }),
  });
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`http://127.0.0.1:4545/api${path}`, init);
  const send = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    call(path, {
      method,
      headers: { "content-type": "application/json", ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const pair = async (): Promise<Record<string, string>> => {
    const settings = (await (await call("/studio/settings")).json()) as {
      pairing: { token: string };
    };
    const headers = { authorization: `Bearer ${settings.pairing.token}`, origin: extension };
    expect((await call("/studio/ext/pair", { method: "POST", headers })).status).toBe(200);
    return headers;
  };
  return { fixture, call, send, pair };
}

const packsOf = async (response: Response) => (await response.json()) as SocialPacksResponse;
const detail = async (response: Response) => ((await response.json()) as { detail: string }).detail;

describe("the page's routes", () => {
  it("answers no posts and an unpaired extension for a project that posts nowhere", async () => {
    const { call } = harness();
    const body = await packsOf(await call("/social/packs/p1"));
    expect(body).toEqual({
      projectId: "p1",
      packs: [],
      extension: { paired: false, sites: null, seenAt: null },
    });
    expect((await call("/social/packs/nope")).status).toBe(404);
  });

  it("turns a site on and off for the project, and back to the template's", async () => {
    const { send } = harness({ social: { x: defaultChoices.x } });
    const on = await packsOf(
      await send("PUT", "/social/packs/p1/bluesky/choice", { choice: defaultChoices.bluesky }),
    );
    expect(on.packs.map((pack) => [pack.platform, pack.chosenHere])).toEqual([
      ["x", false],
      ["bluesky", true],
    ]);
    const off = await packsOf(
      await send("PUT", "/social/packs/p1/x/choice", { choice: { off: true } }),
    );
    expect(off.packs.map((pack) => pack.platform)).toEqual(["bluesky"]);
    const back = await packsOf(await send("PUT", "/social/packs/p1/x/choice", { choice: null }));
    expect(back.packs.map((pack) => pack.platform)).toEqual(["x", "bluesky"]);
  });

  it("leaves turning on a post prompt to Edit project, where Save shows its cost", async () => {
    const { send } = harness({ social: { x: defaultChoices.x } });
    const response = await send("PUT", "/social/packs/p1/x/choice", {
      choice: { ...defaultChoices.x, text: "prompt" },
    });
    expect(response.status).toBe(409);
    expect(await detail(response)).toMatch(/paid step, so it is set in Edit project → Upload pack/);
  });

  it("refuses a change from another page, and a body it doesn't take", async () => {
    const { send } = harness({ social: { x: defaultChoices.x } });
    const elsewhere = await send(
      "PUT",
      "/social/packs/p1/x/choice",
      { choice: null },
      { origin: "https://evil.example" },
    );
    expect(elsewhere.status).toBe(403);
    expect(
      (await send("PUT", "/social/packs/p1/x/choice", { choice: { off: false } })).status,
    ).toBe(400);
    expect((await send("PUT", "/social/packs/p1/myspace/choice", { choice: null })).status).toBe(
      400,
    );
  });

  it("keeps a hand edit until Reset", async () => {
    const { send } = harness({ social: { x: defaultChoices.x } });
    const edited = await packsOf(
      await send("PUT", "/social/packs/p1/x/text", { text: "Mine.", base: "Theirs." }),
    );
    expect(edited.packs[0]).toMatchObject({ text: "Mine.", edited: true });
    const reset = await packsOf(await send("DELETE", "/social/packs/p1/x/text"));
    expect(reset.packs[0]?.edited).toBe(false);
    expect(
      (await send("PUT", "/social/packs/p1/tiktok/text", { text: "a", base: "b" })).status,
    ).toBe(404);
  });

  it("sets Reddit's own fields, only on the Reddit post", async () => {
    const { send } = harness({ social: { reddit: defaultChoices.reddit, x: defaultChoices.x } });
    const reddit = { subreddit: "r/towers", title: "A tower", flair: "", kind: "link" };
    const saved = await packsOf(await send("PUT", "/social/packs/p1/reddit/reddit", { reddit }));
    expect(saved.packs.find((pack) => pack.platform === "reddit")?.reddit?.subreddit).toBe(
      "towers",
    );
    const wrong = await send("PUT", "/social/packs/p1/x/reddit", { reddit });
    expect(wrong.status).toBe(400);
    expect(await detail(wrong)).toMatch(/Only a Reddit post has a subreddit/);
  });

  it("records a pasted link as posted by the person, refuses another site's, and forgets it", async () => {
    const { send } = harness({ social: { x: defaultChoices.x } });
    const bad = await send("PUT", "/social/packs/p1/x/link", { url: "https://bsky.app/x" });
    expect(bad.status).toBe(400);
    expect(await detail(bad)).toMatch(/isn't a link to a post on X\./);
    const posted = await packsOf(
      await send("PUT", "/social/packs/p1/x/link", { url: "https://x.com/me/status/12" }),
    );
    expect(posted.packs[0]?.status).toMatchObject({ state: "posted", by: "person" });
    const forgot = await packsOf(await send("PUT", "/social/packs/p1/x/link", { url: null }));
    expect(forgot.packs[0]?.status.state).toBe("none");
  });

  it("puts a post in the extension's queue with Fill, and refuses one already posted", async () => {
    const { send } = harness({ social: { x: defaultChoices.x } });
    const filled = await send("POST", "/social/packs/p1/x/fill");
    expect(filled.status).toBe(200);
    const body = (await filled.json()) as FillResponse;
    expect(body).toMatchObject({ waitsForRelease: false, url: "https://x.com/compose/post" });
    expect(body.pack.status.state).toBe("waiting");
    expect((await send("POST", "/social/packs/p1/tiktok/fill")).status).toBe(404);
    await send("PUT", "/social/packs/p1/x/link", { url: "https://x.com/me/status/12" });
    const again = await send("POST", "/social/packs/p1/x/fill");
    expect(again.status).toBe(409);
    expect(await detail(again)).toMatch(/already on X\. To post it again, remove its link/);
  });

  it("waits for the release time on a site without a scheduler", async () => {
    const { send, fixture } = harness({ social: { instagram: defaultChoices.instagram } });
    setRelease(fixture.db, "p1", 0, "2026-10-18T20:00:00.000Z", null, clock.now());
    const body = (await (
      await send("POST", "/social/packs/p1/instagram/fill")
    ).json()) as FillResponse;
    expect(body.waitsForRelease).toBe(true);
  });

  it("serves only a post's own files, cutting a picture to the site's shape", async () => {
    const reshaped: string[] = [];
    const reshaper: Reshaper = {
      picture: async (_projectId, source, shape) => {
        reshaped.push(shape);
        const target = `${source}.cut.jpg`;
        writeFileSync(target, "jpeg");
        return { ok: true, path: target };
      },
    };
    const { call } = harness(
      { social: { instagram: defaultChoices.instagram, x: defaultChoices.x } },
      reshaper,
    );
    const video = await call("/social/media/p1/video");
    expect(video.status).toBe(200);
    expect(await video.text()).toBe("mp4");
    const picture = await call("/social/media/p1/image-1--4x5");
    expect(picture.headers.get("content-type")).toBe("image/jpeg");
    expect(await picture.text()).toBe("jpeg");
    expect(reshaped).toEqual(["4:5"]);
    expect((await call("/social/media/p1/youtube-tags")).status).toBe(404);
    expect((await call("/social/media/p1/image-1--1x1")).status).toBe(404);
  });

  it("says when pictures can't be cut in this copy", async () => {
    const { call } = harness({ social: { instagram: defaultChoices.instagram } });
    const response = await call("/social/media/p1/image-1--4x5");
    expect(response.status).toBe(503);
    expect(await detail(response)).toMatch(/can't be cut to the site's shape/);
  });
});

describe("the extension's routes", () => {
  it("refuses an unpaired caller and names only the paired extension in CORS", async () => {
    const { call, pair } = harness({ social: { x: defaultChoices.x } });
    const unpaired = await call("/social/ext/next?platform=x", { headers: { origin: extension } });
    expect(unpaired.status).toBe(401);
    expect(await detail(unpaired)).toMatch(/isn't paired with this Slopify/);
    const headers = await pair();
    const preflight = await call("/social/ext/next", {
      method: "OPTIONS",
      headers: { origin: extension, "access-control-request-method": "GET" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBe(extension);
    const evil = await call("/social/ext/next?platform=x", {
      headers: { ...headers, origin: "https://evil.example" },
    });
    expect(evil.status).toBe(401);
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("hands the oldest waiting post to the site's tab, once, then says nothing waits", async () => {
    const { call, send, pair } = harness({ social: { x: defaultChoices.x } });
    const headers = await pair();
    await send("POST", "/social/packs/p1/x/fill");
    const next = await call("/social/ext/next?platform=x", { headers });
    expect(next.status).toBe(200);
    const body = (await next.json()) as ActivePost;
    expect(body).toMatchObject({
      waiting: 0,
      pack: { platform: "x", status: { state: "filling" } },
    });
    const none = await call("/social/ext/next?platform=x", { headers });
    expect(none.status).toBe(404);
    expect(await detail(none)).toMatch(/Nothing is waiting to be filled on this site/);
  });

  it("records what the extension reports, refusing what nobody asked for", async () => {
    const { call, send, pair } = harness({ social: { x: defaultChoices.x } });
    const headers = { ...(await pair()), "content-type": "application/json" };
    const report = (body: unknown) =>
      call("/social/ext/result", { method: "POST", headers, body: JSON.stringify(body) });
    const unasked = await report({ projectId: "p1", platform: "x", state: "filled" });
    expect(unasked.status).toBe(409);
    await send("POST", "/social/packs/p1/x/fill");
    expect(
      await (await report({ projectId: "p1", platform: "x", state: "filled" })).json(),
    ).toEqual({
      status: "filled",
    });
    const bad = await report({
      projectId: "p1",
      platform: "x",
      state: "posted",
      url: "https://evil.example",
    });
    expect(bad.status).toBe(400);
    const posted = await report({
      projectId: "p1",
      platform: "x",
      state: "posted",
      url: "https://x.com/me/status/9",
    });
    expect(await posted.json()).toEqual({ status: "posted" });
    expect((await report({ projectId: "gone", platform: "x", state: "filled" })).status).toBe(404);
  });

  it("serves the extension a post's files and its pack, nothing else", async () => {
    const { call, pair } = harness({ social: { x: defaultChoices.x } });
    const headers = await pair();
    expect((await call("/social/ext/files/p1/video", { headers })).status).toBe(200);
    expect((await call("/social/ext/files/p1/image-1", { headers })).status).toBe(404);
    expect((await call("/social/ext/packs/p1/x", { headers })).status).toBe(200);
    expect((await call("/social/ext/packs/p1/tiktok", { headers })).status).toBe(404);
  });

  it("lists the due fills of sites without a scheduler", async () => {
    const { call, send, pair, fixture } = harness({ social: { bluesky: defaultChoices.bluesky } });
    const headers = await pair();
    setRelease(fixture.db, "p1", 0, "2026-10-18T11:00:00.000Z", null, clock.now());
    await send("POST", "/social/packs/p1/bluesky/fill");
    const due = (await (await call("/social/ext/due?hours=2", { headers })).json()) as {
      posts: unknown[];
    };
    expect(due.posts).toEqual([
      {
        projectId: "p1",
        projectTitle: "Episode one",
        platform: "bluesky",
        at: "2026-10-18T10:58:00.000Z",
        late: false,
        composeUrl: "https://bsky.app/",
      },
    ]);
    expect((await call("/social/ext/next?platform=bluesky", { headers })).status).toBe(404);
  });

  it("remembers which sites the extension may post on, for the page", async () => {
    const { call, pair } = harness();
    const headers = { ...(await pair()), "content-type": "application/json" };
    const sites = await call("/social/ext/sites", {
      method: "POST",
      headers,
      body: JSON.stringify({ sites: ["x", "bluesky"] }),
    });
    expect(sites.status).toBe(200);
    expect((await packsOf(await call("/social/packs/p1"))).extension).toEqual({
      paired: true,
      sites: ["x", "bluesky"],
      seenAt: "2026-10-18T10:00:00.000Z",
    });
  });

  it("lists nothing to look up without the channel's account", async () => {
    const { call, pair } = harness({ social: { x: defaultChoices.x } });
    const headers = await pair();
    expect(await (await call("/social/ext/find-links", { headers })).json()).toEqual({ posts: [] });
  });
});
