import type { PostPack } from "@app/slices/social/model.js";
import type { UploadPack } from "@app/slices/studio/model.js";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioSettingsBody } from "@/api";
import { PrepareUpload } from "@/studio/prepare-upload";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { packs, xPack } from "./post.fake";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const youtube: UploadPack = {
  projectId: "p1",
  projectTitle: "The Fox",
  series: "",
  missing: [],
  playlistChoices: [],
  items: [
    {
      kind: "video",
      video: null,
      title: "The Fox",
      titles: [],
      description: "A fox.",
      tags: [],
      thumbnails: [],
      audience: "not_made_for_kids",
      alteredContent: { altered: false, why: "No." },
      playlists: [],
      playlist: null,
    },
  ],
};

const settings: StudioSettingsBody = {
  playlists: [],
  channelPlaylists: {},
  pairing: { token: "t".repeat(32), origin: "chrome-extension://abc", pairedAt: "2026-09-27" },
};

function routes(social: Readonly<Record<string, Answer>>) {
  return testDeps({
    "GET /api/studio/settings": jsonAnswer(settings),
    "GET /api/studio/queue": jsonAnswer({ queue: [] }),
    "GET /api/studio/packs/p1": jsonAnswer(youtube),
    ...social,
  });
}

async function openDrawer() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Copy for YouTube Studio" }));
  return { user, drawer: await screen.findByRole("dialog", { name: "Copy for YouTube Studio" }) };
}

describe("Copy for YouTube Studio's other sites", () => {
  it("is YouTube's alone for a project that posts nowhere", async () => {
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      routes({ "GET /api/social/packs/p1": jsonAnswer(packs([])) }),
    );
    const { drawer } = await openDrawer();
    await within(drawer).findByText("In the order Studio asks");
    expect(within(drawer).queryByRole("group", { name: "Where" })).toBeNull();
    expect(within(drawer).getByRole("button", { name: "Fill in YouTube Studio" })).not.toBeNull();
  });

  it("is YouTube's alone when Slopify has no posting routes", async () => {
    renderRouted(<PrepareUpload projectId="p1" ready />, routes({}));
    const { drawer } = await openDrawer();
    await within(drawer).findByText("In the order Studio asks");
    expect(within(drawer).queryByRole("group", { name: "Where" })).toBeNull();
  });

  it("shows the post as X shows it, counts it live, and fills it", async () => {
    const opened = vi.spyOn(window, "open").mockReturnValue(null);
    const filled: string[] = [];
    const saved: unknown[] = [];
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      routes({
        "GET /api/social/packs/p1": jsonAnswer(packs([xPack])),
        "PUT /api/social/packs/p1/x/text": async (request) => {
          saved.push(await request.json());
          return jsonAnswer(packs([{ ...xPack, text: "Mine", edited: true }]))(request);
        },
        "POST /api/social/packs/p1/x/fill": async (request) => {
          filled.push(request.url);
          return jsonAnswer({ pack: xPack, waitsForRelease: false, url: xPack.composeUrl })(
            request,
          );
        },
      }),
    );
    const { user, drawer } = await openDrawer();
    const where = await within(drawer).findByRole("group", { name: "Where" });
    expect(
      within(where)
        .getAllByRole("button")
        .map((one) => one.textContent),
    ).toEqual(["YouTube", "X"]);
    await user.click(within(where).getByRole("button", { name: "X" }));
    expect(within(drawer).getByText(/X Free takes 2 min 20 s/)).not.toBeNull();
    expect(within(drawer).getByText("AI label on")).not.toBeNull();
    expect(within(drawer).getByLabelText("X length").textContent).toBe(
      "22 / 280 · links count as 23",
    );
    expect(within(drawer).getByText(/Scheduled in X's own scheduler/)).not.toBeNull();
    const box = within(drawer).getByLabelText("X post");
    await user.clear(box);
    await user.type(box, "Mine");
    expect(within(drawer).getByLabelText("X length").textContent).toBe(
      "4 / 280 · links count as 23",
    );
    fireEvent.blur(box);
    await waitFor(() => expect(saved).toEqual([{ text: "Mine", base: xPack.generated }]));
    expect(
      await within(drawer).findByRole("button", { name: "Reset to the written text" }),
    ).not.toBeNull();
    await user.click(within(drawer).getByRole("button", { name: "Fill in X" }));
    // The tab carries the mark the extension fills by; a post form opened by hand has none.
    expect(opened).toHaveBeenCalledWith(
      "https://x.com/compose/post#slopify-post=p1:x",
      "_blank",
      "noopener",
    );
    await waitFor(() => expect(filled).toHaveLength(1));
    expect(within(drawer).queryByRole("button", { name: "Fill in YouTube Studio" })).toBeNull();
  });

  it("says why Fill can't be pressed while the site isn't allowed in the extension", async () => {
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      routes({ "GET /api/social/packs/p1": jsonAnswer(packs([xPack], [])) }),
    );
    const { user, drawer } = await openDrawer();
    await user.click(await within(drawer).findByRole("button", { name: "X" }));
    const fill = within(drawer).getByRole("button", { name: "Fill in X" });
    expect(fill.getAttribute("aria-disabled")).toBe("true");
    expect(fill.textContent).toContain(
      "In the extension's options, press Allow posting on X, then reload this page",
    );
  });

  it("takes a pasted link only when it is the site's own post link", async () => {
    const sent: unknown[] = [];
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      routes({
        "GET /api/social/packs/p1": jsonAnswer(packs([xPack])),
        "PUT /api/social/packs/p1/x/link": async (request) => {
          sent.push(await request.json());
          return jsonAnswer(
            packs([
              {
                ...xPack,
                status: {
                  state: "posted",
                  url: "https://x.com/fox/status/1",
                  message: null,
                  at: "2026-10-20T18:00:00.000Z",
                  by: "person",
                },
              },
            ]),
          )(request);
        },
      }),
    );
    const { user, drawer } = await openDrawer();
    await user.click(await within(drawer).findByRole("button", { name: "X" }));
    const field = within(drawer).getByLabelText("Posted it yourself? Paste its link");
    await user.type(field, "https://example.com/1");
    expect(within(drawer).getByText(/That isn't an X post's link/)).not.toBeNull();
    expect(within(drawer).getByRole("button", { name: "Save link" }).hasAttribute("disabled")).toBe(
      true,
    );
    await user.clear(field);
    await user.type(field, "https://x.com/fox/status/1");
    await user.click(within(drawer).getByRole("button", { name: "Save link" }));
    await waitFor(() => expect(sent).toEqual([{ url: "https://x.com/fox/status/1" }]));
    expect(await within(drawer).findByText(/Posted on X/)).not.toBeNull();
    expect(within(drawer).getByRole("link", { name: "Open the post" }).getAttribute("href")).toBe(
      "https://x.com/fox/status/1",
    );
    expect(
      within(drawer).getByRole("button", { name: "Fill in X" }).getAttribute("aria-disabled"),
    ).toBe("true");
  });

  it("keeps Reddit's fields with a live-check note and saves them on leaving a box", async () => {
    const sent: unknown[] = [];
    const reddit: PostPack = {
      ...xPack,
      platform: "reddit",
      xTier: undefined,
      aiLabel: false,
      media: [],
      warnings: [],
      reddit: { subreddit: "", title: "The Fox", flair: "", kind: "link" },
    };
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      routes({
        "GET /api/social/packs/p1": jsonAnswer(packs([reddit], ["reddit"])),
        "PUT /api/social/packs/p1/reddit/reddit": async (request) => {
          sent.push(await request.json());
          return jsonAnswer(packs([reddit], ["reddit"]))(request);
        },
      }),
    );
    const { user, drawer } = await openDrawer();
    await user.click(await within(drawer).findByRole("button", { name: "Reddit" }));
    expect(within(drawer).getByText("Needs a live check")).not.toBeNull();
    await user.type(within(drawer).getByLabelText("Subreddit"), "r/history");
    fireEvent.blur(within(drawer).getByLabelText("Subreddit"));
    await waitFor(() =>
      expect(sent).toEqual([
        { reddit: { subreddit: "r/history", title: "The Fox", flair: "", kind: "link" } },
      ]),
    );
  });

  it("picks the project's designs for a post", async () => {
    const choices: unknown[] = [];
    const design = (id: string, name: string) => ({ id, name, projectId: "p1", steps: [] });
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      routes({
        "GET /api/social/packs/p1": jsonAnswer(packs([xPack])),
        "GET /api/designs": (request) =>
          jsonAnswer({
            designs:
              new URL(request.url).searchParams.get("projectId") === "p1"
                ? [design("d1", "Launch poster"), design("d2", "Quote card")]
                : [],
          })(request),
        "PUT /api/social/packs/p1/x/choice": async (request) => {
          choices.push(await request.json());
          return jsonAnswer(packs([xPack]))(request);
        },
      }),
    );
    const { user, drawer } = await openDrawer();
    await user.click(await within(drawer).findByRole("button", { name: "X" }));
    const settings = await within(drawer).findByRole("region", { name: "X post settings" });
    const poster = await within(settings).findByRole("checkbox", { name: "Launch poster" });
    expect((poster as HTMLInputElement).checked).toBe(false);
    await user.click(poster);
    await waitFor(() =>
      expect(choices).toEqual([
        { choice: { ...xPack.choice, media: { ...xPack.choice.media, designs: ["d1"] } } },
      ]),
    );
  });

  it("says where to make a design when the project has none", async () => {
    renderRouted(
      <PrepareUpload projectId="p1" ready />,
      routes({
        "GET /api/social/packs/p1": jsonAnswer(packs([xPack])),
        "GET /api/designs": jsonAnswer({ designs: [] }),
      }),
    );
    const { user, drawer } = await openDrawer();
    await user.click(await within(drawer).findByRole("button", { name: "X" }));
    const settings = await within(drawer).findByRole("region", { name: "X post settings" });
    expect(
      await within(settings).findByText(/No designs are made for this project yet/),
    ).not.toBeNull();
  });
});
