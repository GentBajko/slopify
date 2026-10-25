import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useShellLocation } from "./shell-location.js";

afterEach(cleanup);

function Frame() {
  const main = useRef<HTMLElement>(null);
  useShellLocation(main);
  return (
    <main ref={main}>
      <Outlet />
    </main>
  );
}

function mount() {
  const root = createRootRoute({ component: Frame });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <h1>Home</h1>,
  });
  const welcome = createRoute({
    getParentRoute: () => root,
    path: "welcome",
    component: () => <h1>Welcome to Slopify</h1>,
  });
  const projects = createRoute({
    getParentRoute: () => root,
    path: "projects",
    component: () => <h1>Projects</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([home, welcome, projects]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
  return router;
}

// One frame for the focus move, which waits for the new screen to draw.
const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

describe("focus on a change of screen", () => {
  it("stays where the browser put it when the app moves on before the person did anything", async () => {
    const router = mount();
    await screen.findByRole("heading", { name: "Home" });
    // A fresh install's Home sends it on to Welcome by itself.
    await act(() => router.navigate({ to: "/welcome" }));
    await screen.findByRole("heading", { name: "Welcome to Slopify" });
    await nextFrame();
    expect(document.activeElement).toBe(document.body);
    expect(
      screen.getByRole("heading", { name: "Welcome to Slopify" }).hasAttribute("tabindex"),
    ).toBe(false);
  });

  it("moves to the new screen's heading once the person has pressed something", async () => {
    const user = userEvent.setup();
    const router = mount();
    await screen.findByRole("heading", { name: "Home" });
    await user.keyboard("{Tab}");
    await act(() => router.navigate({ to: "/projects" }));
    const heading = await screen.findByRole("heading", { name: "Projects" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.getAttribute("tabindex")).toBe("-1");
  });

  it("moves there too after a click that came with no key or pointer press, as a screen reader's does", async () => {
    const router = mount();
    await screen.findByRole("heading", { name: "Home" });
    fireEvent.click(document.body);
    await act(() => router.navigate({ to: "/projects" }));
    const heading = await screen.findByRole("heading", { name: "Projects" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});
