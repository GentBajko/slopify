import type { Prompt } from "@app/slices/library/model.js";
import { type AnyRouter, useLocation, useRouter } from "@tanstack/react-router";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PromptKind } from "@/api";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { PromptsRoute } from "./prompts.js";

// happy-dom here has no localStorage, so the remembered sort gets a plain one.
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
  });
});
afterEach(cleanup);

// Shows the test router's address, and keeps the router so a test can change it.
const probed: { router?: AnyRouter } = {};
function UrlProbe() {
  probed.router = useRouter();
  return <output aria-label="URL">{useLocation().searchStr}</output>;
}

const dossier: Prompt = {
  id: "p1",
  kind: "article",
  name: "Documentary dossier",
  body: "Compose a {{minWords}} word dossier on {{topic}}.",
  slots: ["minWords", "topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const oil: Prompt = {
  id: "p2",
  kind: "image",
  name: "Oil painting scenes",
  body: "An oil painting of {{topic}} in the {{era}}.",
  slots: ["topic", "era"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const card: Prompt = {
  id: "p3",
  kind: "thumbnail",
  name: "Bold title card",
  body: "A bold title card for {{topic}}.",
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function deps(prompts: readonly Prompt[], extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/prompts": jsonAnswer({ prompts }),
    "GET /api/entries": jsonAnswer({ entries: [] }),
    ...extra,
  });
}

// The kind lives in the URL (router.tsx reads it); a test names it.
function Screen({ start = "article" as PromptKind }) {
  return <PromptsRoute kind={start} />;
}

// A row is found by its title, which is the button that shows it in the detail column.
async function findRow(name: string): Promise<HTMLElement> {
  const title = await screen.findByRole("button", { name });
  const row = title.closest("li");
  if (row === null) throw new Error(`${name} is not in a list row`);
  return row;
}

const one = (versions = 1) => ({
  versions: Array.from({ length: versions }, (_, at) => ({
    version: versions - at,
    kind: "article",
    mode: null,
    name: "Documentary dossier",
    body: `Version ${String(versions - at)}.`,
    author: "you",
    restoredFrom: null,
    createdAt: "2026-09-01T10:00:00.000Z",
  })),
});
const unused = { templates: [], schedules: [], projects: [] };

describe("the prompts list", () => {
  it("names how many deleted prompts, intros and outros wait in the trash, linking to it", async () => {
    const trashed = (kind: string, id: string) => ({
      kind,
      id,
      name: id,
      detail: null,
      deletedAt: "2026-09-27T10:00:00.000Z",
      purgeAt: "2026-10-27T10:00:00.000Z",
      daysLeft: 30,
    });
    renderRouted(
      <Screen />,
      deps([dossier], {
        "GET /api/trash": jsonAnswer({
          items: [trashed("prompt", "a"), trashed("entry", "b"), trashed("project", "c")],
        }),
      }),
    );
    const link = await screen.findByRole("link", { name: "Trash (2)" });
    expect(link.getAttribute("href")).toBe("/settings?section=trash");
  });

  it("lists every kind down the left with what it writes and how many are saved, and shows the one picked", async () => {
    renderRouted(<Screen />, deps([dossier, oil, card]));

    expect(await findRow("Documentary dossier")).not.toBeNull();
    expect(screen.queryByText("Oil painting scenes")).toBeNull();
    const kinds = screen.getByRole("navigation", { name: "Kinds of prompt" });
    const link = (name: RegExp) => within(kinds).getByRole("link", { name });
    await waitFor(() =>
      expect(link(/^Intros/u).textContent).toBe("IntrosSaid before the video, 0"),
    );
    // Each kind's name over what it writes, so a kind says what it is before it is picked.
    expect(
      within(kinds)
        .getAllByRole("link")
        .map((one) => one.textContent),
    ).toEqual([
      "ArticleThe text the narrator reads, 1",
      "ImageThe pictures in the video, 1",
      "ThumbnailThe video's thumbnail, 1",
      "Narration preparationPauses and stress, 0",
      "YouTube descriptionDescription, chapters, tags, 0",
      "ShortsMoments cut as shorts, 0",
      "ReviewWhat the AI checks, 0",
      "ScriptLines for several voices, 0",
      "PostPosts for social sites, 0",
      "IntrosSaid before the video, 0",
      "OutrosSaid after the video, 0",
    ]);
    expect(link(/^Article/u).getAttribute("aria-current")).toBe("page");
    expect(link(/^Image/u).getAttribute("aria-current")).toBeNull();
    expect(link(/^Image/u).getAttribute("href")).toBe("/prompts?kind=image");
    expect(link(/^Intros/u).getAttribute("href")).toBe("/entries?category=intro");
  });

  it("offers every kind on a phone as one Showing choice with its count, the one on show picked", async () => {
    const user = userEvent.setup();
    renderRouted(
      <>
        <Screen start="image" />
        <UrlProbe />
      </>,
      deps([dossier, oil, card]),
    );

    await findRow("Oil painting scenes");
    const showing = screen.getByRole("combobox", { name: "Showing:" }) as HTMLSelectElement;
    await waitFor(() =>
      expect([...showing.options].map((one) => one.textContent)).toEqual([
        "Article prompts (1)",
        "Image prompts (1)",
        "Thumbnail prompts (1)",
        "Narration preparation prompts (0)",
        "YouTube description prompts (0)",
        "Shorts prompts (0)",
        "Review prompts (0)",
        "Script prompts (0)",
        "Post prompts (0)",
        "Intros (0)",
        "Outros (0)",
      ]),
    );
    expect(showing.selectedOptions[0]?.textContent).toBe("Image prompts (1)");
    await user.selectOptions(showing, "Thumbnail prompts (1)");
    await waitFor(() => expect(screen.getByLabelText("URL").textContent).toBe("?kind=thumbnail"));
  });

  it("says what the kind on show makes, above its list", async () => {
    renderRouted(<Screen start="image" />, deps([oil]));
    expect(await screen.findByRole("heading", { name: "Image prompts" })).not.toBeNull();
    expect(screen.getByText("Describes the pictures shown during the video.")).not.toBeNull();
    expect(await findRow("Oil painting scenes")).not.toBeNull();
  });

  it("says on each row what it asks for and how its text starts", async () => {
    renderRouted(<Screen />, deps([dossier, { ...dossier, id: "p8", name: "Plain", slots: [] }]));

    const row = await findRow("Documentary dossier");
    expect(row.querySelector(".sl-row__meta")?.textContent).toBe(
      "Asks for: minWords, topic ·Compose a {{minWords}} word dossier on {{topic}}.",
    );
    expect((await findRow("Plain")).querySelector(".sl-row__meta")?.textContent).toBe(
      "Compose a {{minWords}} word dossier on {{topic}}.",
    );
  });

  it("sorts by name, or by last change from the Sort menu, and remembers it", async () => {
    const user = userEvent.setup();
    const older = { ...dossier, id: "a1", name: "Alpha", updatedAt: "2026-08-01T10:00:00.000Z" };
    const newer = { ...dossier, id: "z1", name: "Zulu", updatedAt: "2026-09-20T10:00:00.000Z" };
    renderRouted(<Screen />, deps([newer, older]));
    const names = async () =>
      within(await screen.findByRole("list", { name: "Prompts" }))
        .getAllByRole("listitem")
        .map((row) => row.querySelector(".sl-row__title")?.textContent ?? "");

    expect(await names()).toEqual(["Alpha", "Zulu"]);
    const sort = screen.getByRole("button", { name: "Sort prompts: Name" });
    expect(sort.textContent).toBe("Sort: Name");
    await user.click(sort);
    await user.click(await screen.findByRole("menuitem", { name: /^Sort by last changed/u }));
    expect(await names()).toEqual(["Zulu", "Alpha"]);
    expect(stored.get("slopify.library.sort.prompt")).toBe("changed");
  });

  it("keeps the shown prompt in the URL, and opens the one the URL names", async () => {
    const user = userEvent.setup();
    const second = { ...dossier, id: "p9", name: "Second dossier" };
    renderRouted(
      <>
        <Screen />
        <UrlProbe />
      </>,
      deps([dossier, second]),
    );
    expect(
      await screen.findByRole("region", { name: "Documentary dossier details" }),
    ).not.toBeNull();

    await user.click(await screen.findByRole("button", { name: "Second dossier" }));
    await waitFor(() => expect(screen.getByLabelText("URL").textContent).toContain("item=p9"));
    expect(await screen.findByRole("region", { name: "Second dossier details" })).not.toBeNull();

    // A link or a reload: the address alone picks the row.
    act(() => probed.router?.history.push("/?item=p1"));
    expect(
      await screen.findByRole("region", { name: "Documentary dossier details" }),
    ).not.toBeNull();
  });

  it("shows the selected prompt's text and what it asks you for beside the list", async () => {
    const user = userEvent.setup();
    const second: Prompt = {
      ...dossier,
      id: "p5",
      name: "Short dossier",
      body: "Brief {{era}} by {{Slopify_Channel}}.",
      slots: ["era", "Slopify_Channel"],
    };
    renderRouted(<Screen />, deps([dossier, second]));

    // The first row is shown until another is picked.
    const first = await findRow("Documentary dossier");
    expect(first.getAttribute("aria-current")).toBe("true");
    const detail = screen.getByRole("region", { name: "Documentary dossier details" });
    expect(detail.querySelector("[data-slot=prompt-text]")?.textContent).toBe(dossier.body);
    const asks = within(detail).getByRole("region", { name: "Asks you for" });
    expect(
      within(within(asks).getByRole("list", { name: "Keywords" }))
        .getAllByRole("listitem")
        .map((one) => one.textContent),
    ).toEqual(["minWords", "topic"]);
    expect(
      within(asks).getByText("You answer these each time you make a video with it."),
    ).not.toBeNull();
    expect(within(detail).getByRole("link", { name: "Edit" }).getAttribute("href")).toBe(
      "/prompts/p1",
    );

    await user.click(screen.getByRole("button", { name: "Short dossier" }));
    const next = await screen.findByRole("region", { name: "Short dossier details" });
    expect(next.querySelector("[data-slot=prompt-text]")?.textContent).toBe(second.body);
    // Your own keyword is highlighted as the editor highlights it; Slopify's is not.
    expect(
      [...next.querySelectorAll("[data-slot=prompt-text] [data-own-keyword]")].map(
        (one) => one.textContent,
      ),
    ).toEqual(["{{era}}"]);
    expect(within(next).getByText("Slopify fills in: Channel.")).not.toBeNull();
    expect((await findRow("Short dossier")).getAttribute("aria-current")).toBe("true");
    expect(first.getAttribute("aria-current")).toBeNull();
  });

  it("searches every kind by name and text, and says each hit's kind", async () => {
    const user = userEvent.setup();
    renderRouted(<Screen />, deps([dossier, oil, card]));

    await findRow("Documentary dossier");
    const search = screen.getByRole("searchbox", { name: "Search prompts, intros and outros" });
    await user.type(search, "painting");
    expect(screen.queryByRole("button", { name: "Documentary dossier" })).toBeNull();
    const hit = await findRow("Oil painting scenes");
    expect(hit.querySelector(".sl-row__meta")?.textContent).toMatch(/^Image · Asks for: /u);
    expect(screen.getByRole("heading", { name: "1 match for “painting”" })).not.toBeNull();
    expect(screen.getByText("Searched every kind, intros and outros too.")).not.toBeNull();
    // The detail names the kind, as no list head does during a search.
    expect(
      within(screen.getByRole("region", { name: "Oil painting scenes details" })).getByText(
        /^Image prompt · Updated/u,
      ),
    ).not.toBeNull();

    await user.clear(search);
    await user.type(search, "nothing like it");
    expect(
      await screen.findByRole("heading", { name: "No matches for “nothing like it”" }),
    ).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Matches" })).toBeNull();
  });

  it("finds intros and outros from any kind, counts the matches beside each kind and lights none", async () => {
    const user = userEvent.setup();
    const welcome = {
      id: "e1",
      category: "intro",
      mode: "text",
      name: "Calm welcome",
      body: "Welcome back. Today: {{topic}}.",
      slots: ["topic"],
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    renderRouted(
      <Screen start="image" />,
      deps([dossier, oil, card], { "GET /api/entries": jsonAnswer({ entries: [welcome] }) }),
    );

    await findRow("Oil painting scenes");
    await user.type(
      screen.getByRole("searchbox", { name: "Search prompts, intros and outros" }),
      "welcome",
    );
    const hit = await findRow("Calm welcome");
    expect(hit.querySelector(".sl-row__meta")?.textContent).toMatch(/^Intro · Asks for: topic/u);
    expect(screen.getByRole("heading", { name: "1 match for “welcome”" })).not.toBeNull();
    expect(
      within(screen.getByRole("group", { name: "Actions for Calm welcome" }))
        .getByRole("link", { name: "Edit Calm welcome" })
        .getAttribute("href"),
    ).toBe("/entries/e1");

    const kinds = screen.getByRole("navigation", { name: "Kinds of prompt" });
    const link = (name: RegExp) => within(kinds).getByRole("link", { name });
    expect(link(/^Image/u).textContent).toBe("ImageThe pictures in the video, 0");
    expect(link(/^Intros/u).textContent).toBe("IntrosSaid before the video, 1");
    expect(
      within(kinds)
        .getAllByRole("link")
        .filter((one) => one.getAttribute("aria-current") !== null),
    ).toEqual([]);

    // Picking a kind, even the one the words were typed on, ends the search.
    await user.click(link(/^Image/u));
    expect(await findRow("Oil painting scenes")).not.toBeNull();
    expect(
      (
        screen.getByRole("searchbox", {
          name: "Search prompts, intros and outros",
        }) as HTMLInputElement
      ).value,
    ).toBe("");
    expect(link(/^Image/u).getAttribute("aria-current")).toBe("page");
  });

  it("teaches what an empty kind is for, with the one button that makes the first", async () => {
    renderRouted(<Screen start="image" />, deps([dossier]));

    const empty = await screen.findByRole("heading", { name: "No image prompts yet" });
    expect(
      screen.getByText("An image prompt describes the pictures shown during the video."),
    ).not.toBeNull();
    const news = screen.getAllByRole("link", { name: "New image prompt" });
    expect(news).toHaveLength(1);
    expect(empty.parentElement?.contains(news[0] as HTMLElement)).toBe(true);
    expect(news[0]?.getAttribute("href")).toBe("/prompts/new?kind=image");
  });

  it("points New and Edit at the editor, carrying the kind on show", async () => {
    renderRouted(<Screen start="description" />, deps([{ ...dossier, kind: "description" }]));

    await findRow("Documentary dossier");
    expect(
      screen.getByRole("link", { name: "New YouTube description prompt" }).getAttribute("href"),
    ).toBe("/prompts/new?kind=description");
    expect(
      screen.getByRole("link", { name: "Edit Documentary dossier" }).getAttribute("href"),
    ).toBe("/prompts/p1");
  });

  it("shows Edit and Make a video on the row, Duplicate as a copy opened for editing, and Delete behind a confirmation", async () => {
    const user = userEvent.setup();
    let deleted: string | undefined;
    renderRouted(
      <Screen />,
      deps([dossier], {
        "DELETE /api/prompts/p1": (request) => {
          deleted = new URL(request.url).pathname;
          return emptyAnswer()(request);
        },
      }),
    );

    await findRow("Documentary dossier");
    const actions = screen.getByRole("group", { name: "Actions for Documentary dossier" });
    // What the row is for stays on it; the occasional actions sit behind More.
    expect(
      [...actions.querySelectorAll("a, button")].map((one) => one.getAttribute("aria-label")),
    ).toEqual([
      "Edit Documentary dossier",
      "Make a video with Documentary dossier",
      "More actions for Documentary dossier",
    ]);
    // Renaming is done in the editor's Name field: the row has no pencil.
    expect(screen.queryByRole("button", { name: "Rename Documentary dossier" })).toBeNull();
    await user.click(
      within(actions).getByRole("button", { name: "More actions for Documentary dossier" }),
    );
    expect(
      (await screen.findByRole("menuitem", { name: "Duplicate Documentary dossier" })).getAttribute(
        "href",
      ),
    ).toBe("/prompts/new?kind=article&from=p1");
    expect(
      screen.getByRole("menuitem", { name: "Versions of Documentary dossier" }),
    ).not.toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "Delete Documentary dossier" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Documentary dossier"?')).not.toBeNull();
    // Nothing a past project made is touched by this.
    expect(dialog.textContent).toContain(
      "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
    );
    expect(within(dialog).getByRole("link", { name: "Settings → Trash" })).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Delete prompt" }));
    await waitFor(() => {
      expect(deleted).toBe("/api/prompts/p1");
    });
  });

  it("hands the prompt to Create from Make a video, and says why it can't while a video starts", async () => {
    const user = userEvent.setup();
    const used: string[] = [];
    const { unmount } = renderRouted(
      <PromptsRoute kind="article" onMakeVideo={(picked) => used.push(picked.name)} />,
      deps([dossier]),
    );
    await user.click(
      await screen.findByRole("button", { name: "Make a video with Documentary dossier" }),
    );
    expect(used).toEqual(["Documentary dossier"]);
    unmount();

    renderRouted(
      <PromptsRoute
        kind="article"
        onMakeVideo={(picked) => used.push(picked.name)}
        makeBlocked="Create is starting a video from its draft."
      />,
      deps([dossier]),
    );
    const blocked = await screen.findByRole("button", {
      name: "Make a video with Documentary dossier",
    });
    expect(blocked.hasAttribute("disabled")).toBe(true);
    expect(blocked.getAttribute("title")).toBe("Create is starting a video from its draft.");
  });

  it("says its versions on one line, lists what uses it once, and opens every version in Versions", async () => {
    const user = userEvent.setup();
    let restored: string | undefined;
    const version = (n: number, body: string, restoredFrom: number | null = null) => ({
      version: n,
      kind: "article",
      mode: null,
      name: "Documentary dossier",
      body,
      author: "you",
      restoredFrom,
      createdAt: "2026-09-01T10:00:00.000Z",
    });
    renderRouted(
      <Screen />,
      deps([dossier], {
        "GET /api/prompts/p1/history": jsonAnswer({
          versions: [version(2, "Compose a long dossier."), version(1, "Compose a short dossier.")],
        }),
        "GET /api/prompts/p1/used-by": jsonAnswer({
          templates: [{ id: "t1", name: "Weekly essay" }],
          schedules: [{ id: "s1", name: "Mondays", status: "paused" }],
          projects: [{ id: "x1", title: "Cats", revisions: 2, totalRevisions: 3, current: true }],
        }),
        "POST /api/prompts/p1/history/1/restore": (request) => {
          restored = new URL(request.url).pathname;
          return jsonAnswer(dossier)(request);
        },
      }),
    );

    await findRow("Documentary dossier");
    const detail = screen.getByRole("region", { name: "Documentary dossier details" });
    expect(await within(detail).findByText(/· 2 versions$/u)).not.toBeNull();
    // What uses it is said once, in its list, not again on the line above.
    const users = await within(detail).findByRole("region", { name: "Used by" });
    expect(detail.textContent).not.toContain("used by");
    expect(within(users).getByRole("link", { name: "Cats" }).getAttribute("href")).toBe(
      "/projects/x1",
    );
    expect(within(users).getByText(/2 of 3 revisions, including the current one/u)).not.toBeNull();
    expect(within(users).getByText("Schedule · paused")).not.toBeNull();

    await user.click(
      within(detail).getByRole("button", { name: "Compare versions of Documentary dossier" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Versions of Documentary dossier" });
    expect(within(drawer).getByText("short").tagName).toBe("DEL");
    expect(within(drawer).getByText("long").tagName).toBe("INS");
    expect(within(drawer).getByText("1 word added, 1 removed.")).not.toBeNull();

    await user.click(within(drawer).getByRole("button", { name: "Restore version 1" }));
    await waitFor(() => {
      expect(restored).toBe("/api/prompts/p1/history/1/restore");
    });
    expect(await within(drawer).findByText("Restored version 1 as a new version.")).not.toBeNull();
  });

  it("offers Compare versions only once there are two, and says when nothing uses it", async () => {
    renderRouted(
      <Screen />,
      deps([dossier], {
        "GET /api/prompts/p1/history": jsonAnswer(one(1)),
        "GET /api/prompts/p1/used-by": jsonAnswer(unused),
      }),
    );

    await findRow("Documentary dossier");
    const detail = screen.getByRole("region", { name: "Documentary dossier details" });
    expect(await within(detail).findByText(/1 version · not used yet$/u)).not.toBeNull();
    expect(within(detail).queryByRole("button", { name: /Compare versions/u })).toBeNull();
    expect(within(detail).queryByRole("region", { name: "Used by" })).toBeNull();
  });

  it("says what went wrong when the list cannot be read", async () => {
    renderRouted(
      <Screen />,
      deps([], { "GET /api/prompts": problemAnswer("The disk is full.", 500) }),
    );

    expect(await screen.findByText("The disk is full.")).not.toBeNull();
    expect(screen.getByText("The prompts couldn't be loaded.")).not.toBeNull();
  });
});
