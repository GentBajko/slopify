import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Button } from "./button.js";
import { actionToastMs, lifetimeOf, ToastProvider, toastMs, useToast } from "./toast.js";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function Trigger() {
  const notify = useToast();
  return (
    <>
      <Button onClick={() => notify("Template saved.", "success")}>Say saved</Button>
      <Button onClick={() => notify("The key was refused by OpenAI.", "error")}>Say failed</Button>
      <Button onClick={() => notify("Moved to Trash.", "info", { label: "Undo", run: () => {} })}>
        Say moved
      </Button>
    </>
  );
}

function setup() {
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
}

describe("toasts", () => {
  it("live in regions that are on the page before anything is said", () => {
    setup();
    const region = screen.getByRole("region", { name: "Notifications" });
    const live = [...region.querySelectorAll("[aria-live]")].map((one) =>
      one.getAttribute("aria-live"),
    );
    expect(live).toEqual(["assertive", "polite"]);
  });

  it("keeps an error until it is dismissed", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Say failed" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText("The key was refused by OpenAI.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));
    expect(screen.queryByText("The key was refused by OpenAI.")).toBeNull();
  });

  it("lets an acknowledgement leave on its own", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Say saved" }));
    act(() => vi.advanceTimersByTime(toastMs + 10));
    expect(screen.queryByText("Template saved.")).toBeNull();
  });

  it("gives Undo longer, and waits while the pointer is on it", () => {
    expect(lifetimeOf("info", { label: "Undo", run: () => {} })).toBe(actionToastMs);
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Say moved" }));
    const region = screen.getByRole("region", { name: "Notifications" });
    fireEvent.pointerEnter(screen.getByText("Moved to Trash."));
    act(() => vi.advanceTimersByTime(actionToastMs * 2));
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeNull();
    fireEvent.pointerLeave(region);
    act(() => vi.advanceTimersByTime(actionToastMs + 10));
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("waits while focus is on its button", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Say moved" }));
    fireEvent.focus(screen.getByRole("button", { name: "Undo" }));
    act(() => vi.advanceTimersByTime(actionToastMs * 2));
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeNull();
  });
});
