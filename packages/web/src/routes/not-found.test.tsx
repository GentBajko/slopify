import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createAppRouter } from "@/router";
import { renderApp, testDeps } from "@/test-app";

afterEach(cleanup);

it("answers an address no screen has inside the shell, with somewhere to go", async () => {
  const router = createAppRouter();
  router.update({ history: createMemoryHistory({ initialEntries: ["/no/such/page"] }) });
  renderApp(<RouterProvider router={router} />, testDeps({}));
  expect(await screen.findByText("There is no page at this address")).not.toBeNull();
  expect(screen.getByText(/^\/no\/such\/page is not a screen in Slopify/)).not.toBeNull();
  expect(screen.getAllByRole("link", { name: "Open Home" }).length).toBeGreaterThan(0);
  // The shell is still around it.
  expect(screen.getAllByRole("navigation", { name: /Main navigation/ }).length).toBeGreaterThan(0);
  expect(document.title).toBe("Page not found · Slopify");
});
