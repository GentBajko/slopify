import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Connection } from "@/events";
import { backOnlineMs, ConnectionStatus, graceMs, unreachableMs } from "./connection-status.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function mount(connection: Connection | undefined) {
  const view = render(<ConnectionStatus connection={connection} />);
  return (next: Connection) => view.rerender(<ConnectionStatus connection={next} />);
}

it("says nothing while live, nor for a blip shorter than a moment", () => {
  const set = mount("open");
  expect(screen.queryByText(/Reconnecting/)).toBeNull();
  set("lost");
  act(() => vi.advanceTimersByTime(graceMs - 100));
  set("open");
  act(() => vi.advanceTimersByTime(backOnlineMs));
  expect(document.querySelector(".sl-connection")).toBeNull();
});

it("says it is reconnecting, then that Slopify cannot be reached, then that it is back", () => {
  const set = mount("open");
  set("lost");
  act(() => vi.advanceTimersByTime(graceMs));
  expect(
    screen.getByText(/Reconnecting… Numbers on this page may be out of date\./),
  ).not.toBeNull();
  act(() => vi.advanceTimersByTime(unreachableMs));
  expect(screen.getByText(/Can't reach Slopify/)).not.toBeNull();
  set("open");
  expect(screen.getByText("Back online. The page is up to date.")).not.toBeNull();
  act(() => vi.advanceTimersByTime(backOnlineMs));
  expect(screen.queryByText(/Back online/)).toBeNull();
});

it("says so when the browser goes offline", () => {
  mount("open");
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
  expect(screen.getByText(/^Offline\. Numbers on this page may be out of date/)).not.toBeNull();
  online.mockReturnValue(true);
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
  expect(screen.getByText("Back online. The page is up to date.")).not.toBeNull();
  online.mockRestore();
});

it("keeps its live region on the page while there is nothing to say", () => {
  mount("open");
  expect(document.querySelector('.sl-connection-slot[aria-live="polite"]')).not.toBeNull();
});
