import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createPortal } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "@/components/confirm";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spotlight } from "./spotlight";

let targetBox = new DOMRect(40, 80, 500, 180);
let measureBox: ReturnType<typeof vi.spyOn>;
let scroll: ReturnType<typeof vi.spyOn>;
const observers: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }[] = [];

beforeEach(() => {
  targetBox = new DOMRect(40, 80, 500, 180);
  observers.length = 0;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
      constructor(public callback: ResizeObserverCallback) {
        observers.push(this);
      }
    },
  );
  measureBox = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this.dataset.tutorial === "card") return new DOMRect(0, 0, 360, 280);
      if (this.hasAttribute("data-test-target")) return targetBox;
      if (this.dataset.slot === "select-content") return new DOMRect(40, 160, 250, 200);
      return new DOMRect();
    });
  scroll = vi.spyOn(HTMLElement.prototype, "scrollIntoView").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function tour(overrides: Partial<Parameters<typeof Spotlight>[0]> = {}) {
  return (
    <Spotlight
      stepId="keys"
      target="#highlight"
      title="Connect a provider"
      progress="1 of 3"
      onNext={vi.fn()}
      onClose={vi.fn()}
      {...overrides}
    >
      <p>Use the real form, then continue.</p>
    </Spotlight>
  );
}

describe("interactive spotlight", () => {
  it("leaves actual inputs, native selects and save buttons usable while blocking unrelated clicks", async () => {
    const save = vi.fn();
    const outside = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <section id="highlight" data-test-target>
          <label>
            API key
            <input type="password" />
          </label>
          <label>
            Provider
            <select>
              <option>First</option>
              <option>Second</option>
            </select>
          </label>
          <button type="button" onClick={save}>
            Save key
          </button>
        </section>
        <button type="button" onClick={outside}>
          Delete project
        </button>
        {tour()}
      </>,
    );
    await user.type(screen.getByLabelText("API key"), "private-key-value");
    await user.selectOptions(screen.getByLabelText("Provider"), "Second");
    await user.click(screen.getByRole("button", { name: "Save key" }));
    await user.click(screen.getByRole("button", { name: "Delete project" }));
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("private-key-value");
    expect((screen.getByLabelText("Provider") as HTMLSelectElement).value).toBe("Second");
    expect(save).toHaveBeenCalledOnce();
    expect(outside).not.toHaveBeenCalled();
    expect(
      screen.getByRole("region", { name: "Interactive getting started guide" }).textContent,
    ).not.toContain("private-key-value");
    expect(document.querySelector('[data-tutorial="hole"]')).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("exposes back, next, skip and exit controls and exits on Escape", async () => {
    const onBack = vi.fn();
    const onNext = vi.fn();
    const onSkip = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <>
        <div id="highlight" data-test-target />
        {tour({
          onBack,
          onNext,
          onSkip,
          onClose,
          nextLabel: "Continue",
          skipLabel: "Set up later",
        })}
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Set up later" }));
    await user.click(screen.getByRole("button", { name: "Exit guide" }));
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps focus in the real target and instruction controls without trapping it in the card", async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outside</button>
        <div id="highlight" data-test-target>
          <input aria-label="Name" />
          <button type="button">Save</button>
        </div>
        {tour()}
      </>,
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Connect a provider" }),
    );
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Save" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Exit guide" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Next" }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Name" }));
    act(() => screen.getByRole("button", { name: "Outside" }).focus());
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Connect a provider" }),
    );
  });

  it("waits safely for a missing target and finds it after delayed mounting", async () => {
    const onNext = vi.fn();
    const onBack = vi.fn();
    const view = render(tour({ onNext, onBack }));
    expect(screen.getByRole("status").textContent).toContain("not available yet");
    expect((screen.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('[data-tutorial="hole"]')).toBeNull();
    expect((screen.getByRole("button", { name: "Back" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    view.rerender(
      <>
        <div id="highlight" data-test-target />
        {tour({ onNext, onBack })}
      </>,
    );
    await waitFor(() => expect(document.querySelector('[data-tutorial="hole"]')).not.toBeNull());
    expect(screen.queryByRole("status")).toBeNull();
    await waitFor(() => expect(scroll).toHaveBeenCalledOnce());
  });

  it("handles invalid selectors with the same safe fallback", () => {
    render(tour({ target: "[invalid" }));
    expect(screen.getByRole("status")).not.toBeNull();
    expect(document.querySelector('[data-tutorial="hole"]')).toBeNull();
  });

  it("respects action gating and keeps an explicit skip available", async () => {
    const onNext = vi.fn();
    const onSkip = vi.fn();
    render(
      <>
        <div id="highlight" data-test-target />
        {tour({ onNext, nextDisabled: true, onSkip })}
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip this step" }));
    expect(onNext).not.toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalledOnce();
  });

  it("preserves scroll room when a large section moves above the dock and cleans it up on exit", async () => {
    targetBox = new DOMRect(0, 0, 1000, 1100);
    const view = render(
      <>
        <div id="highlight" data-test-target />
        {tour()}
      </>,
    );
    expect(document.documentElement.style.scrollPaddingBottom).toBe("304px");
    const hole = document.querySelector('[data-tutorial="hole"]');
    const card = document.querySelector<HTMLElement>('[data-tutorial="card"]');
    expect(Number(hole?.getAttribute("height"))).toBeLessThan(
      Number.parseFloat(card?.style.top ?? "0"),
    );
    targetBox = new DOMRect(0, -900, 1000, 1100);
    fireEvent.scroll(window);
    await waitFor(() =>
      expect(
        screen.queryByText("Scroll the page to work through the highlighted section."),
      ).toBeNull(),
    );
    expect(document.documentElement.style.scrollPaddingBottom).toBe("304px");
    view.unmount();
    expect(document.documentElement.style.scrollPaddingBottom).toBe("");
  });

  it("positions a newly highlighted section after the dock's scrolling room is committed", async () => {
    targetBox = new DOMRect(0, 900, 1000, 1100);
    let roomWhenScrolled: string | undefined;
    scroll.mockImplementation(() => {
      roomWhenScrolled = document.documentElement.style.scrollPaddingBottom;
    });
    render(
      <>
        <div id="highlight" data-test-target />
        {tour()}
      </>,
    );
    await waitFor(() => expect(scroll).toHaveBeenCalledOnce());
    expect(roomWhenScrolled).toBe("304px");
    expect(scroll).toHaveBeenCalledWith({ block: "start", inline: "nearest", behavior: "instant" });
  });

  it("remeasures resize, scroll and DOM changes without repeatedly scrolling the user's page", async () => {
    render(
      <>
        <div id="highlight" data-test-target />
        {tour()}
      </>,
    );
    const hole = () => document.querySelector('[data-tutorial="hole"]');
    expect(hole()?.getAttribute("x")).toBe("34");
    targetBox = new DOMRect(70, 100, 500, 180);
    fireEvent.scroll(window);
    await waitFor(() => expect(hole()?.getAttribute("x")).toBe("64"));
    targetBox = new DOMRect(90, 100, 500, 180);
    fireEvent.resize(window);
    await waitFor(() => expect(hole()?.getAttribute("x")).toBe("84"));
    targetBox = new DOMRect(110, 100, 500, 180);
    act(() => {
      document.getElementById("highlight")?.setAttribute("class", "expanded");
    });
    await waitFor(() => expect(hole()?.getAttribute("x")).toBe("104"));
    targetBox = new DOMRect(130, 100, 500, 180);
    act(() => {
      for (const observer of observers) observer.callback([], {} as ResizeObserver);
    });
    await waitFor(() => expect(hole()?.getAttribute("x")).toBe("124"));
    expect(scroll).toHaveBeenCalledOnce();
  });

  it("scrolls each new step into view once and removes old highlights immediately", async () => {
    const view = render(
      <>
        <div id="highlight" data-test-target />
        {tour()}
      </>,
    );
    await waitFor(() => expect(scroll).toHaveBeenCalledOnce());
    view.rerender(
      <>
        <div id="highlight" data-test-target />
        {tour({ stepId: "prompt", target: "#not-loaded" })}
      </>,
    );
    expect(document.querySelector('[data-tutorial="hole"]')).toBeNull();
    expect(screen.getByRole("status")).not.toBeNull();
    view.rerender(
      <>
        <div id="not-loaded" data-test-target />
        {tour({ stepId: "prompt", target: "#not-loaded" })}
      </>,
    );
    await waitFor(() => expect(scroll).toHaveBeenCalledTimes(2));
  });

  it("leaves owned portalled controls undimmed and clickable while keeping unrelated portals blocked", async () => {
    const selected = vi.fn();
    const unrelated = vi.fn();
    const view = render(
      <>
        <div id="highlight" data-test-target>
          <button type="button" aria-controls="provider-menu">
            Provider
          </button>
        </div>
        {createPortal(
          <div data-radix-popper-content-wrapper style={{ zIndex: 50 }}>
            <div id="provider-menu" data-slot="select-content">
              <button type="button" onClick={selected}>
                Choose provider
              </button>
            </div>
          </div>,
          document.body,
        )}
        {createPortal(
          <div id="unrelated-menu" data-slot="select-content">
            <button type="button" onClick={unrelated}>
              Unrelated choice
            </button>
          </div>,
          document.body,
        )}
        {tour()}
      </>,
    );
    const layer = document.getElementById("provider-menu")?.parentElement;
    expect(layer?.style.zIndex).toBe("102");
    expect(document.querySelectorAll("mask rect").length).toBe(3);
    await userEvent.click(screen.getByRole("button", { name: "Choose provider" }));
    await userEvent.click(screen.getByRole("button", { name: "Unrelated choice" }));
    expect(selected).toHaveBeenCalledOnce();
    expect(unrelated).not.toHaveBeenCalled();
    view.rerender(
      <>
        <div id="highlight" data-test-target />
        {createPortal(
          <div data-radix-popper-content-wrapper style={{ zIndex: 50 }}>
            <div id="provider-menu" data-slot="select-content" />
          </div>,
          document.body,
        )}
      </>,
    );
    expect(layer?.style.zIndex).toBe("50");
  });

  it("supports a real Radix select opening and changing its value during the guide", async () => {
    const onClose = vi.fn();
    function Page() {
      const [value, setValue] = useState("first");
      return (
        <>
          <div id="highlight" data-test-target>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger aria-label="Text provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="first">First provider</SelectItem>
                <SelectItem value="second">Second provider</SelectItem>
              </SelectContent>
            </Select>
            <output aria-label="Selected provider">{value}</output>
          </div>
          {tour({ onClose })}
        </>
      );
    }
    render(<Page />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Text provider" }));
    const second = await screen.findByRole("option", { name: "Second provider" });
    await user.click(second);
    await waitFor(() =>
      expect(screen.getByLabelText("Selected provider").textContent).toBe("second"),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("suspends for a real confirmation dialog and resumes after Cancel or Escape", async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <div id="highlight" data-test-target>
            <button type="button" onClick={() => setOpen(true)}>
              Remove saved voice
            </button>
            <ConfirmDialog
              open={open}
              title="Remove this voice?"
              consequence="Existing audio stays."
              verb="Remove"
              onConfirm={onConfirm}
              onCancel={() => setOpen(false)}
            />
          </div>
          {tour({ onClose })}
        </>
      );
    }
    render(<Page />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Remove saved voice" }));
    await screen.findByRole("dialog", { name: "Remove this voice?" });
    await waitFor(() =>
      expect(document.querySelector<HTMLElement>('[data-tutorial="spotlight"]')?.hidden).toBe(true),
    );
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.querySelector<HTMLElement>('[data-tutorial="spotlight"]')?.hidden).toBe(
        false,
      ),
    );
    expect(screen.getByRole("heading", { name: "Connect a provider" })).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Remove saved voice" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(document.querySelector<HTMLElement>('[data-tutorial="spotlight"]')?.hidden).toBe(
        false,
      ),
    );
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disconnects observers and interaction boundaries on exit, restoring focus to the opener", async () => {
    const outside = vi.fn();
    const view = render(
      <button type="button" onClick={outside}>
        Open guide
      </button>,
    );
    screen.getByRole("button", { name: "Open guide" }).focus();
    view.rerender(
      <>
        <button type="button" onClick={outside}>
          Open guide
        </button>
        <div id="highlight" data-test-target />
        {tour()}
      </>,
    );
    const before = measureBox.mock.calls.length;
    view.rerender(
      <button type="button" onClick={outside}>
        Open guide
      </button>,
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole("button", { name: "Open guide" })),
    );
    expect(observers.every((observer) => observer.disconnect.mock.calls.length === 1)).toBe(true);
    fireEvent.resize(window);
    fireEvent.scroll(window);
    expect(measureBox.mock.calls.length).toBe(before);
    await userEvent.click(screen.getByRole("button", { name: "Open guide" }));
    expect(outside).toHaveBeenCalledOnce();
  });
});
