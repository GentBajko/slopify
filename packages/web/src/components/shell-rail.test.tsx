import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppRouter } from "@/router";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const channel = (id: string, name: string) => ({ id, name, isDefault: id === "c1" });
const upToDate = {
  currentVersion: "4.0.0",
  latestVersion: "4.0.0",
  available: false,
  canUpdate: false,
  busy: false,
  status: "idle",
};

function mount(channels = [channel("c1", "My channel")], at = "/nowhere", update = upToDate) {
  const router = createAppRouter();
  router.update({ history: createMemoryHistory({ initialEntries: [at] }) });
  renderApp(
    <RouterProvider router={router} />,
    testDeps({
      "GET /api/channels": jsonAnswer({ channels }),
      "GET /api/update": jsonAnswer(update),
      "GET /api/projects": jsonAnswer({ projects: [] }),
    }),
  );
  return router;
}

// A phone-sized window: the media query the shell asks answers no.
function phone(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

const names = (elements: readonly HTMLElement[]) =>
  elements.map((element) => element.textContent?.trim());

describe("the rail", () => {
  it("puts Create first, then a word under every destination, and Search, Assistant, Help and Support at the foot", async () => {
    mount();
    const rail = await screen.findByRole("complementary", { name: "App" });
    const create = within(rail).getByRole("link", { name: "Create" });
    expect(create.getAttribute("href")).toBe("/play");
    const nav = within(rail).getByRole("navigation", { name: "Main navigation" });
    // One channel: no Channels destination and no channel picker.
    await waitFor(() =>
      expect(names(within(nav).getAllByRole("link"))).toEqual([
        "Home",
        "Projects",
        "Prompts",
        "Templates",
        "Calendar",
        "Settings",
      ]),
    );
    expect(within(rail).queryByRole("combobox")).toBeNull();
    for (const name of ["Search", "Assistant", "Help", "Support Slopify"])
      expect(within(rail).getByRole("button", { name })).not.toBeNull();
    // Updates have a button of their own, which says which version this is.
    expect(within(rail).getByRole("button", { name: "Check for updates" })).not.toBeNull();
    await waitFor(() => expect(rail.textContent).toContain("4.0.0"));
    // No donation rows, slogan or bare glyphs before anything is opened.
    expect(within(rail).queryByRole("link", { name: "GitHub" })).toBeNull();
    expect(rail.textContent).not.toContain("Free. Your keys");
    for (const button of within(rail).getAllByRole("button"))
      expect(button.textContent?.trim()).not.toBe("");
  });

  it("lists Channels with two or more channels, between Calendar and Settings", async () => {
    mount([channel("c1", "My channel"), channel("c2", "Night Myths")]);
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    await waitFor(() =>
      expect(names(within(nav).getAllByRole("link"))).toEqual([
        "Home",
        "Projects",
        "Prompts",
        "Templates",
        "Calendar",
        "Channels",
        "Settings",
      ]),
    );
  });

  it("lights the destination a page belongs to", async () => {
    mount(undefined, "/entries");
    const nav = await screen.findByRole("navigation", { name: "Main navigation" });
    await waitFor(() =>
      expect(within(nav).getByRole("link", { name: "Prompts" }).getAttribute("aria-current")).toBe(
        "page",
      ),
    );
    expect(within(nav).getByRole("link", { name: "Home" }).getAttribute("aria-current")).toBeNull();
  });

  it("opens Help on the tour, the guides, the keys, what's new and the diagnostics, with updates left out", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Help" }));
    const menu = await screen.findByRole("menu", { name: "Help" });
    expect(names(within(menu).getAllByRole("menuitem"))).toEqual([
      "Start the tour",
      "Tutorials",
      "Keyboard shortcuts",
      "What's new",
      "Download diagnostics",
    ]);
    // Updates are not Help's business: the rail's own button carries them.
    expect(menu.textContent).not.toContain("Slopify 4.0.0");
    // The same file Settings → About saves, for a bug report.
    const diagnostics = within(menu).getByRole("menuitem", { name: "Download diagnostics" });
    expect(diagnostics.getAttribute("href")).toBe("http://slopify.test/api/diagnostics");
    expect(diagnostics.getAttribute("download")).toBe("slopify-diagnostics.json");
    await user.click(within(menu).getByRole("menuitem", { name: "Keyboard shortcuts" }));
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).not.toBeNull();
  });

  it("opens Search on Create a video, then Go to in the rail's words and nothing else", async () => {
    const user = userEvent.setup();
    mount();
    const rail = await screen.findByRole("complementary", { name: "App" });
    await user.click(within(rail).getByRole("button", { name: "Search" }));
    const dialog = await screen.findByRole("dialog", { name: "Command palette" });
    // An option's title, without its keys.
    const titles = (name: string) =>
      within(within(dialog).getByRole("group", { name }))
        .getAllByRole("option")
        .map((option) => option.querySelector(".truncate")?.textContent);
    await waitFor(() => expect(titles("Create")).toEqual(["Create a video"]));
    expect(within(dialog).getAllByRole("group")[0]?.getAttribute("aria-label")).toBe("Create");
    expect(titles("Go to")).toEqual([
      "Open Home",
      "Open Projects",
      "Open Prompts",
      "Open Templates",
      "Open Calendar",
      "Open Settings",
    ]);
  });

  it("opens Support on the three links, each in a new tab", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Support Slopify" }));
    const menu = await screen.findByRole("menu", { name: "Support Slopify" });
    expect(within(menu).getByText("Support Slopify")).not.toBeNull();
    const links = within(menu).getAllByRole("menuitem");
    expect(names(links)).toEqual(["GitHub", "Patreon", "Buy Me a Coffee"]);
    for (const link of links) expect(link.getAttribute("target")).toBe("_blank");
  });
});

describe("an update", () => {
  const ready = { ...upToDate, latestVersion: "4.1.0", available: true, canUpdate: true };

  it("names the new version on the rail's own button, beside the one running", async () => {
    mount(undefined, undefined, ready);
    const rail = await screen.findByRole("complementary", { name: "App" });
    const button = await within(rail).findByRole("button", { name: "Install update 4.1.0" });
    expect(button.querySelector(".sl-navrail__version")?.textContent).toBe("4.0.0");
    expect(button.querySelector(".sl-navrail__next")?.textContent).toBe("\u2192 4.1.0");
    expect(button.className).toContain("sl-navrail__item--news");
  });

  it("has its own button on a phone too, with the versions left off the bar", async () => {
    phone();
    mount(undefined, undefined, ready);
    await screen.findByRole("navigation", { name: "Main navigation (phone)" });
    const button = await screen.findByRole("button", { name: "Install update 4.1.0" });
    await waitFor(() => expect(button.className).toContain("sl-navrail__item--news"));
    expect(button.querySelector(".sl-navrail__version")).toBeNull();
    // Help is left to Help.
    expect(screen.getByRole("button", { name: "Help" }).className).not.toContain("--news");
  });
});

describe("on a phone", () => {
  it("has Create in the centre of the bottom bar, and the rest one tap away under More", async () => {
    phone();
    const user = userEvent.setup();
    mount();
    const bar = await screen.findByRole("navigation", { name: "Main navigation (phone)" });
    expect(screen.queryByRole("complementary", { name: "App" })).toBeNull();
    await waitFor(() =>
      expect(names(within(bar).getAllByRole("link"))).toEqual([
        "Home",
        "Projects",
        "Create",
        "Prompts",
      ]),
    );
    await user.click(within(bar).getByRole("button", { name: "More" }));
    const more = await screen.findByRole("menu", { name: "More" });
    expect(names(within(more).getAllByRole("menuitem"))).toEqual([
      "Templates",
      "Calendar",
      "Settings",
    ]);
  });

  it("names Search and Help in words in the top bar, with the Assistant and support inside Help", async () => {
    phone();
    const user = userEvent.setup();
    mount();
    await screen.findByRole("navigation", { name: "Main navigation (phone)" });
    const top = document.querySelector<HTMLElement>(".sl-topbar");
    if (top === null) throw new Error("No top bar on a phone.");
    // One word each; the update button's own name says what pressing it does.
    expect(names(within(top).getAllByRole("button"))).toEqual(["Search", "Update", "Help"]);
    // One word on the bar; its own name says what pressing it does, once the first check is in.
    expect(await within(top).findByRole("button", { name: "Check for updates" })).not.toBeNull();
    await user.click(within(top).getByRole("button", { name: "Help" }));
    const menu = await screen.findByRole("menu", { name: "Help" });
    expect(names(within(menu).getAllByRole("menuitem"))).toEqual([
      "Start the tour",
      "Tutorials",
      "What's new",
      "Assistant",
      "Download diagnostics",
      "GitHub",
      "Patreon",
      "Buy Me a Coffee",
    ]);
  });
});
