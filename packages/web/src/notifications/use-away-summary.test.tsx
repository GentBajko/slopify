import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { writeSnapshot } from "./away.js";
import { useAwaySummary } from "./use-away-summary.js";

// This runner has no localStorage, so the test brings its own.
beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Subject() {
  useAwaySummary();
  return null;
}

it("says on return what the runs did while the page was away", async () => {
  writeSnapshot({ at: Date.now() - 60 * 60_000, states: { a: "running" } });
  renderRouted(
    <Subject />,
    testDeps({
      "GET /api/projects": jsonAnswer({ projects: [{ id: "a", status: "failed" }] }),
    }),
  );
  expect(await screen.findByText("While you were away: 1 run failed.")).not.toBeNull();
  expect(screen.getByRole("button", { name: "Open Home" })).not.toBeNull();
});

it("says nothing after a short glance away", async () => {
  writeSnapshot({ at: Date.now() - 10_000, states: { a: "running" } });
  const listed = vi.fn(jsonAnswer({ projects: [{ id: "a", status: "failed" }] }));
  renderRouted(<Subject />, testDeps({ "GET /api/projects": listed }));
  await vi.waitFor(() => expect(listed).toHaveBeenCalled());
  expect(screen.queryByText(/While you were away/)).toBeNull();
});
