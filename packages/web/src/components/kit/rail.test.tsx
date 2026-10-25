import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Rail, RailLink } from "./rail.js";

afterEach(cleanup);

// The rail on its own at an address: the router's own view of which link is current.
async function at(address: string, rail: ReactNode): Promise<HTMLElement> {
  const root = createRootRoute({ component: () => rail });
  const prompts = createRoute({
    getParentRoute: () => root,
    path: "prompts",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([prompts]),
    history: createMemoryHistory({ initialEntries: [address] }),
  });
  render(<RouterProvider router={router} />);
  return screen.findByRole("navigation", { name: "Kinds" });
}

const mark = (nav: HTMLElement, name: string) =>
  within(nav).getByRole("link", { name }).getAttribute("aria-current");

describe("a rail link", () => {
  it("is current where the address leads, left to the router", async () => {
    const nav = await at(
      "/prompts?kind=image",
      <Rail label="Kinds">
        <RailLink to="/prompts">Prompts</RailLink>
      </Rail>,
    );
    expect(mark(nav, "Prompts")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Prompts" }).className).toBe("sl-rail__item");
  });

  it("follows the caller's mark, even off a link the address matches", async () => {
    // A search for every kind keeps the kind it was typed on lit, not the one in the address.
    const nav = await at(
      "/prompts?kind=article",
      <Rail label="Kinds">
        <RailLink to="/prompts" search={{ kind: "article" }} current={false}>
          Article
        </RailLink>
        <RailLink to="/prompts" search={{ kind: "image" }} current>
          Image
        </RailLink>
        <RailLink to="/prompts" search={{ kind: "short" }} current="step">
          Short
        </RailLink>
      </Rail>,
    );
    expect(mark(nav, "Article")).toBeNull();
    expect(within(nav).getByRole("link", { name: "Article" }).hasAttribute("data-status")).toBe(
      false,
    );
    expect(mark(nav, "Image")).toBe("page");
    expect(mark(nav, "Short")).toBe("step");
    expect(within(nav).getByRole("link", { name: "Image" }).getAttribute("href")).toBe(
      "/prompts?kind=image",
    );
  });
});
