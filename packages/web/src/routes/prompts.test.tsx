import type { Prompt } from "@app/slices/library/model.js";
import { type AnyRouter, useLocation, useRouter } from "@tanstack/react-router";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
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
  return testDeps({ "GET /api/prompts": jsonAnswer({ prompts }), ...extra });
}

// The tab lives in the URL, so router.tsx owns the move; this stands in for it.
function Screen({ start = "article" as PromptKind }) {
  const [kind, setKind] = useState<PromptKind>(start);
  return <PromptsRoute kind={kind} onKind={setKind} />;
}

// A row is found by its title, which is the button that shows it in the detail column.
async function findRow(name: string): Promise<HTMLElement> {
  const title = await screen.findByRole("button", { name });
  const row = title.closest("li");
  if (row === null) throw new Error(`${name} is not in a list row`);
  return row;
}

describe("the prompts list", () => {
  it("offers every kind and shows only the one that is on", async () => {
    const user = userEvent.setup();
    renderRouted(<Screen />, deps([dossier, oil, card]));

    expect(await findRow("Documentary dossier")).not.toBeNull();
    expect(screen.queryByText("Oil painting scenes")).toBeNull();
    expect(screen.queryByText("Bold title card")).toBeNull();

    const kinds = screen.getByRole("combobox", { name: "Prompt kind" });
    await user.selectOptions(kinds, "Image");
    expect(await findRow("Oil painting scenes")).not.toBeNull();
    expect(screen.queryByText("Documentary dossier")).toBeNull();

    await user.selectOptions(kinds, "Thumbnail");
    expect(await findRow("Bold title card")).not.toBeNull();
    expect(screen.queryByText("Oil painting scenes")).toBeNull();
  });

  it("offers YouTube Description as its own kind", async () => {
    const user = userEvent.setup();
    const hook: Prompt = {
      id: "p4",
      kind: "description",
      name: "Hooky chapters",
      body: "Hook {{topic}} fans.",
      slots: ["topic"],
      updatedAt: "2026-09-01T10:00:00.000Z",
    };
    renderRouted(<Screen />, deps([dossier, hook]));
    await findRow("Documentary dossier");
    expect(screen.queryByText("Hooky chapters")).toBeNull();
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Prompt kind" }),
      "YouTube Description",
    );
    expect(await findRow("Hooky chapters")).not.toBeNull();
    expect(screen.queryByText("Documentary dossier")).toBeNull();
  });

  it("says each row's kind and keyword count on its meta line", async () => {
    renderRouted(<Screen />, deps([dossier]));

    const row = await findRow("Documentary dossier");
    const meta = row.querySelector(".sl-row__meta");
    expect(meta?.textContent).toMatch(/^Article · 2 keywords · updated /u);
    // The short date shows the whole moment on hover.
    const stamp = meta?.querySelector("time");
    expect(stamp?.getAttribute("dateTime")).toBe(dossier.updatedAt);
    expect(stamp?.getAttribute("title")).toMatch(/2026/u);
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

    expect((await names()).map((name) => name.slice(0, 4))).toEqual(["Alph", "Zulu"]);
    await user.click(screen.getByRole("button", { name: "Sort prompts: Name" }));
    await user.click(await screen.findByRole("menuitem", { name: /^Sort by last changed/u }));
    expect((await names()).map((name) => name.slice(0, 4))).toEqual(["Zulu", "Alph"]);
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

  it("shows the selected prompt's text and keywords beside the list", async () => {
    const user = userEvent.setup();
    const second: Prompt = {
      ...dossier,
      id: "p5",
      name: "Short dossier",
      body: "Brief {{era}}.",
      slots: ["era"],
    };
    renderRouted(<Screen />, deps([dossier, second]));

    // The first row is shown until another is picked.
    const first = await findRow("Documentary dossier");
    expect(first.getAttribute("aria-current")).toBe("true");
    const detail = screen.getByRole("region", { name: "Documentary dossier details" });
    expect(within(detail).getByText(dossier.body)).not.toBeNull();
    expect(within(detail).getByText("{{minWords}}")).not.toBeNull();
    expect(within(detail).getByText("{{topic}}")).not.toBeNull();
    expect(within(detail).getByRole("link", { name: "Edit prompt" }).getAttribute("href")).toBe(
      "/prompts/p1",
    );

    await user.click(screen.getByRole("button", { name: "Short dossier" }));
    const next = await screen.findByRole("region", { name: "Short dossier details" });
    expect(within(next).getByText("Brief {{era}}.")).not.toBeNull();
    expect((await findRow("Short dossier")).getAttribute("aria-current")).toBe("true");
    expect(first.getAttribute("aria-current")).toBeNull();
  });

  it("narrows the list to the prompts whose name or text matches the search", async () => {
    const user = userEvent.setup();
    const second: Prompt = { ...dossier, id: "p5", name: "Short dossier", body: "Brief {{era}}." };
    renderRouted(<Screen />, deps([dossier, second]));

    await findRow("Documentary dossier");
    const search = screen.getByRole("searchbox", { name: "Search prompts" });
    await user.type(search, "brief");
    expect(screen.queryByRole("button", { name: "Documentary dossier" })).toBeNull();
    expect(await findRow("Short dossier")).not.toBeNull();

    await user.clear(search);
    await user.type(search, "nothing like it");
    expect(await screen.findByText('No article prompts match "nothing like it".')).not.toBeNull();
  });

  it("teaches what a prompt is when the kind is empty, with the one action in the toolbar", async () => {
    renderRouted(<Screen start="image" />, deps([dossier]));

    expect(await screen.findByRole("heading", { name: "No image prompts yet" })).not.toBeNull();
    expect(
      screen.getByText("A prompt is text with {{keywords}}; each keyword becomes a field on Play."),
    ).not.toBeNull();
    expect(screen.getAllByRole("link", { name: "New prompt" })).toHaveLength(1);
  });

  it("points New prompt and Edit at the editor, carrying the tab that is on", async () => {
    renderRouted(<Screen />, deps([dossier]));

    await findRow("Documentary dossier");
    expect(screen.getByRole("link", { name: "New prompt" }).getAttribute("href")).toBe(
      "/prompts/new?kind=article",
    );
    expect(
      screen.getByRole("link", { name: "Edit Documentary dossier" }).getAttribute("href"),
    ).toBe("/prompts/p1");
  });

  it("shows every row action on the row, Duplicate as a copy opened for editing, and Delete behind a confirmation", async () => {
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
      "Use Documentary dossier in Play",
      "More actions for Documentary dossier",
    ]);
    expect(
      within(actions).getByRole("link", { name: "Edit Documentary dossier" }).getAttribute("href"),
    ).toBe("/prompts/p1");
    await user.click(
      within(actions).getByRole("button", { name: "More actions for Documentary dossier" }),
    );
    expect(
      (await screen.findByRole("menuitem", { name: "Duplicate Documentary dossier" })).getAttribute(
        "href",
      ),
    ).toBe("/prompts/new?kind=article&from=p1");
    expect(screen.getByRole("menuitem", { name: "History of Documentary dossier" })).not.toBeNull();

    await user.click(screen.getByRole("menuitem", { name: "Delete Documentary dossier" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText('Delete "Documentary dossier"?')).not.toBeNull();
    // Nothing a past project made is touched by this.
    expect(
      within(dialog).getByText(
        "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.",
      ),
    ).not.toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "Delete prompt" }));
    await waitFor(() => {
      expect(deleted).toBe("/api/prompts/p1");
    });
  });

  it("hands the prompt to Play from Use in Play, and says why it can't while a run starts", async () => {
    const user = userEvent.setup();
    const used: string[] = [];
    const { unmount } = renderRouted(
      <PromptsRoute kind="article" onKind={() => {}} onUseInPlay={(one) => used.push(one.name)} />,
      deps([dossier]),
    );
    await user.click(
      await screen.findByRole("button", { name: "Use Documentary dossier in Play" }),
    );
    expect(used).toEqual(["Documentary dossier"]);
    unmount();

    renderRouted(
      <PromptsRoute
        kind="article"
        onKind={() => {}}
        onUseInPlay={(one) => used.push(one.name)}
        playBlocked="Play is starting a run from its draft."
      />,
      deps([dossier]),
    );
    const blocked = await screen.findByRole("button", { name: "Use Documentary dossier in Play" });
    expect(blocked.hasAttribute("disabled")).toBe(true);
    expect(blocked.getAttribute("title")).toBe("Play is starting a run from its draft.");
  });

  it("shows what uses the prompt and its latest change beside the list, and every version in History", async () => {
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
    expect(await within(detail).findByText("1 template, 1 schedule, 1 project")).not.toBeNull();
    expect(within(detail).getByRole("link", { name: "Cats" }).getAttribute("href")).toBe(
      "/projects/x1",
    );
    expect(within(detail).getByText(/2 of 3 revisions, including the current one/u)).not.toBeNull();
    expect(within(detail).getByText("Schedule · paused")).not.toBeNull();
    // The latest change, in place.
    expect((await within(detail).findByText("short")).tagName).toBe("DEL");
    expect(within(detail).getByText("long").tagName).toBe("INS");

    await user.click(screen.getByRole("button", { name: "More actions for Documentary dossier" }));
    await user.click(
      await screen.findByRole("menuitem", { name: "History of Documentary dossier" }),
    );
    const drawer = await screen.findByRole("dialog", { name: "History of Documentary dossier" });
    expect(within(drawer).getByText("short").tagName).toBe("DEL");
    expect(within(drawer).getByText("long").tagName).toBe("INS");
    expect(within(drawer).getByText("1 word added, 1 removed.")).not.toBeNull();

    await user.click(within(drawer).getByRole("button", { name: "Restore version 1" }));
    await waitFor(() => {
      expect(restored).toBe("/api/prompts/p1/history/1/restore");
    });
    expect(await within(drawer).findByText("Restored version 1 as a new version.")).not.toBeNull();
  });

  it("opens the same History from Compare versions in the detail", async () => {
    const user = userEvent.setup();
    renderRouted(<Screen />, deps([dossier]));

    await findRow("Documentary dossier");
    await user.click(
      screen.getByRole("button", { name: "Compare versions of Documentary dossier" }),
    );
    expect(
      await screen.findByRole("dialog", { name: "History of Documentary dossier" }),
    ).not.toBeNull();
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
