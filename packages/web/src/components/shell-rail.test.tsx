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
    for (const name of ["Search", "Assistant", "Help", "Support"])
      expect(within(rail).getByRole("button", { name })).not.toBeNull();
    // No donation rows, slogan, version or bare glyphs before anything is opened.
    expect(within(rail).queryByRole("link", { name: "GitHub" })).toBeNull();
    expect(rail.textContent).not.toContain("Free. Your keys");
    expect(rail.textContent).not.toMatch(/v\d/);
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

  it("opens Help on the tour, the guides, the keys, what's new, the update check and the diagnostics", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Help" }));
    const menu = await screen.findByRole("menu", { name: "Help" });
    expect(names(within(menu).getAllByRole("menuitem"))).toEqual([
      "Start the tour",
      "Tutorials",
      "Keyboard shortcuts",
      "What's new",
      "Check for updates",
      "Download diagnostics",
    ]);
    expect(menu.textContent).toContain("You have Slopify 4.0.0.");
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
    await user.click(await screen.findByRole("button", { name: "Support" }));
    const menu = await screen.findByRole("menu", { name: "Support" });
    expect(within(menu).getByText("Support Slopify")).not.toBeNull();
    const links = within(menu).getAllByRole("menuitem");
    expect(names(links)).toEqual(["GitHub", "Patreon", "Buy Me a Coffee"]);
    for (const link of links) expect(link.getAttribute("target")).toBe("_blank");
  });
});

describe("an update", () => {
  const ready = { ...upToDate, latestVersion: "4.1.0", available: true, canUpdate: true };

  it("shows in the rail in words only while there is one", async () => {
    const user = userEvent.setup();
    mount(undefined, undefined, ready);
    const rail = await screen.findByRole("complementary", { name: "App" });
    await user.click(await within(rail).findByRole("button", { name: "Update ready" }));
    const menu = await screen.findByRole("menu", { name: "Update ready" });
    expect(within(menu).getByRole("menuitem", { name: "Install update 4.1.0" })).not.toBeNull();
  });

  it("stays inside Help on a phone, which says so in the accent's ink", async () => {
    phone();
    const user = userEvent.setup();
    mount(undefined, undefined, ready);
    await screen.findByRole("navigation", { name: "Main navigation (phone)" });
    const help = screen.getByRole("button", { name: "Help" });
    await waitFor(() => expect(help.className).toContain("sl-topbar__item--news"));
    expect(screen.queryByRole("button", { name: "Update ready" })).toBeNull();
    await user.click(help);
    const menu = await screen.findByRole("menu", { name: "Help" });
    expect(within(menu).getByRole("menuitem", { name: "Install update 4.1.0" })).not.toBeNull();
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
    expect(names(within(top).getAllByRole("button"))).toEqual(["Search", "Help"]);
    await user.click(within(top).getByRole("button", { name: "Help" }));
    const menu = await screen.findByRole("menu", { name: "Help" });
    expect(names(within(menu).getAllByRole("menuitem"))).toEqual([
      "Start the tour",
      "Tutorials",
      "What's new",
      "Assistant",
      "Check for updates",
      "Download diagnostics",
      "GitHub",
      "Patreon",
      "Buy Me a Coffee",
    ]);
  });
});
