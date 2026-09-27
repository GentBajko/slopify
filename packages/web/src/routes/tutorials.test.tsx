import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { TutorialsRoute } from "@/routes/tutorials";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import type { TutorialsIndex } from "@/tutorials/api";

afterEach(cleanup);

const index: TutorialsIndex = {
  home: { id: "Home", title: "Home" },
  groups: [
    {
      title: "Getting started",
      pages: [
        { id: "Install", title: "Install" },
        { id: "Your-First-Short", title: "Your first short" },
      ],
    },
    { title: "Making a video", pages: [{ id: "Play-Overview", title: "Play overview" }] },
  ],
  pages: [
    { id: "Home", title: "Home" },
    { id: "Install", title: "Install" },
    { id: "Your-First-Short", title: "Your first short" },
    { id: "Play-Overview", title: "Play overview" },
  ],
  footer: "Slopify is free and open source.",
};

const markdown =
  (text: string): Answer =>
  () =>
    new Response(text, { headers: { "content-type": "text/markdown" } });

function deps(extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({
    "GET /api/tutorials": jsonAnswer(index),
    "GET /api/tutorials/Install": markdown(
      "# Install\n\nThen make [your first short](Your-First-Short#pick-a-topic), or read [below](#with-docker).\n\n## With Docker\n\nRun the Docker command.\n\n## Without Docker\n\nRun npx.\n",
    ),
    "GET /api/tutorials/search": (request) =>
      jsonAnswer({
        hits:
          new URL(request.url).searchParams.get("q") === "docker"
            ? [
                {
                  page: "Install",
                  pageTitle: "Install",
                  anchor: "with-docker",
                  heading: "With Docker",
                  snippet: "Run the Docker command.",
                },
              ]
            : [],
      })(request),
    ...extra,
  });
}

describe("Help → Tutorials", () => {
  it("shows the sidebar's groups beside the page, in the reading view", async () => {
    renderRouted(<TutorialsRoute page="Install" anchor={undefined} words={undefined} />, deps());
    expect(await screen.findByRole("heading", { name: "With Docker" })).not.toBeNull();
    const nav = screen.getByRole("navigation", { name: "Tutorials" });
    expect(within(nav).getByText("Getting started")).not.toBeNull();
    expect(within(nav).getByRole("link", { name: "Install" }).getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByRole("navigation", { name: "Tutorial contents" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Copy section: With Docker" })).not.toBeNull();
    expect(screen.getByText("Slopify is free and open source.")).not.toBeNull();
  });

  it("keeps the wiki's links in the app, anchors and all", async () => {
    renderRouted(<TutorialsRoute page="Install" anchor={undefined} words={undefined} />, deps());
    const link = await screen.findByRole("link", { name: "your first short" });
    expect(link.getAttribute("href")).toBe("/help/tutorials/Your-First-Short#pick-a-topic");
    expect(screen.getByRole("link", { name: "below" }).getAttribute("href")).toBe(
      "/help/tutorials/Install#with-docker",
    );
  });

  it("searches every page and links each result to its section", async () => {
    renderRouted(<TutorialsRoute page="Install" anchor={undefined} words={undefined} />, deps());
    await userEvent.type(
      await screen.findByRole("searchbox", { name: "Search all tutorials" }),
      "docker",
    );
    const results = await screen.findByRole("list", { name: "Search results" });
    const hit = within(results).getByRole("link", { name: /With Docker/ });
    expect(hit.getAttribute("href")).toBe("/help/tutorials/Install?q=docker#with-docker");
    await userEvent.clear(screen.getByRole("searchbox", { name: "Search all tutorials" }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search all tutorials" }), "zebra");
    expect(await screen.findByText(/No tutorial mentions "zebra"/)).not.toBeNull();
  });

  it("says what failed when a page does not load", async () => {
    renderRouted(<TutorialsRoute page="Gone" anchor={undefined} words={undefined} />, deps({}));
    await waitFor(() => expect(screen.getByText("This tutorial did not load")).not.toBeNull());
    expect(screen.getByRole("button", { name: "Try again" })).not.toBeNull();
  });
});
