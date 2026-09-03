import type { Chunking } from "@app/slices/narration/chunk.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChunkingControl } from "@/play/chunking";

afterEach(cleanup);

function control(value: Chunking, onPick = vi.fn()) {
  render(<ChunkingControl value={value} onPick={onPick} />);
  return onPick;
}

describe("the chunking control", () => {
  it("offers the three ways the narration is cut", () => {
    control({ mode: "whole" });

    expect(screen.getByRole("radio", { name: "Whole" }).getAttribute("data-state")).toBe("on");
    expect(screen.getByRole("radio", { name: "Paragraph" })).not.toBeNull();
    expect(screen.getByRole("radio", { name: "Every 500 words" })).not.toBeNull();
  });

  it("hides the word count until the run is cut by words", async () => {
    const onPick = control({ mode: "whole" });

    expect(screen.queryByLabelText("Words")).toBeNull();

    await userEvent.click(screen.getByRole("radio", { name: "Every 500 words" }));
    expect(onPick).toHaveBeenCalledWith({ mode: "words", words: 500 });
  });

  it("shows the count beside the switch once the mode is words", () => {
    control({ mode: "words", words: 800 });

    expect((screen.getByLabelText("Words") as HTMLInputElement).value).toBe("800");
    expect(screen.getByRole("radio", { name: "Every 800 words" })).not.toBeNull();
  });

  it("takes a new count", async () => {
    // Stateful, because typing into a control whose value never moves would type into
    // the old one: this is the harness the real form is.
    function Harness() {
      const [value, setValue] = useState<Chunking>({ mode: "words", words: 500 });
      return <ChunkingControl value={value} onPick={setValue} />;
    }
    render(<Harness />);

    await userEvent.clear(screen.getByLabelText("Words"));
    // An emptied box carries no count, and the switch falls back to the chunker's own.
    expect((screen.getByLabelText("Words") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("radio", { name: "Every 500 words" })).not.toBeNull();

    await userEvent.type(screen.getByLabelText("Words"), "90");

    expect((screen.getByLabelText("Words") as HTMLInputElement).value).toBe("90");
    expect(screen.getByRole("radio", { name: "Every 90 words" })).not.toBeNull();
  });

  it("sends no count at all when the box is emptied", async () => {
    const onPick = control({ mode: "words", words: 500 });

    await userEvent.clear(screen.getByLabelText("Words"));

    expect(onPick).toHaveBeenLastCalledWith({ mode: "words" });
  });

  it("carries the count across a mode change so switching back does not lose it", async () => {
    const onPick = control({ mode: "words", words: 800 });

    await userEvent.click(screen.getByRole("radio", { name: "Paragraph" }));

    expect(onPick).toHaveBeenCalledWith({ mode: "paragraph" });
  });
});
