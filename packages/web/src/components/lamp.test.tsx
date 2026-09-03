import type { StageState } from "@app/kernel/pipeline.js";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Lamp, StageLamp } from "./lamp.js";

// The seven states of kernel/pipeline.ts, written out rather than imported: `@app/*` is
// a type-only bridge (see api.ts), and a test that derives its own cases from the code
// under test proves less than one that names them.
const stageStates: readonly StageState[] = [
  "pending",
  "running",
  "done",
  "failed",
  "canceled",
  "provided",
  "skipped",
];

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the lamp", () => {
  it.each(stageStates)("renders %s with its own lit class", (state) => {
    const { container } = render(<Lamp state={state} />);
    const lamp = container.querySelector(`[data-lamp="${state}"]`);
    expect(lamp).not.toBeNull();
    // The lamp is decoration; the word beside it carries the meaning.
    expect(lamp?.getAttribute("aria-hidden")).toBe("true");
  });

  it("pulses only while a stage is running", () => {
    const { container: running } = render(<Lamp state="running" />);
    expect(running.querySelector("[data-lamp]")?.className).toContain("animate-lamp-pulse");
    const { container: done } = render(<Lamp state="done" />);
    expect(done.querySelector("[data-lamp]")?.className).not.toContain("animate-lamp-pulse");
  });

  it("leaves pending, provided and skipped unlit", () => {
    for (const state of ["pending", "provided", "skipped"] as const) {
      const { container } = render(<Lamp state={state} />);
      expect(container.querySelector("[data-lamp]")?.className).toContain("bg-lamp-off");
    }
  });
});

describe("a stage lamp", () => {
  it.each(stageStates)("shows the state word for %s beside the lamp", (state) => {
    render(<StageLamp label="Audio" state={state} />);
    expect(screen.getByText(state)).not.toBeNull();
    expect(screen.getByText(state).getAttribute("data-state")).toBe(state);
  });

  it("announces the stage and its state through a live region", () => {
    render(<StageLamp label="Images" state="failed" />);
    const live = screen.getByRole("status");
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(within(live).getByText("Images: failed")).not.toBeNull();
  });

  it("gives each state a distinct word", () => {
    const words = stageStates.map((state) => {
      const { container } = render(<StageLamp label="Video" state={state} />);
      return container.querySelector("[data-state]")?.textContent;
    });
    expect(new Set(words).size).toBe(stageStates.length);
  });
});
