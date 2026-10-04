import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoudnessControls, type LoudnessValue, typedDb } from "./loudness-controls.js";

afterEach(cleanup);

describe("typedDb", () => {
  it("reads dB and percentages as the same volume, snapped to half a dB", () => {
    expect(typedDb("−6", "db")).toBe(-6);
    expect(typedDb("+2.3 dB", "db")).toBe(2.5);
    expect(typedDb("50", "percent")).toBe(-6);
    expect(typedDb("158%", "percent")).toBe(4);
    expect(typedDb("100", "percent")).toBe(0);
  });

  it("refuses what is not a volume in range", () => {
    expect(typedDb("", "db")).toBeUndefined();
    expect(typedDb("loud", "db")).toBeUndefined();
    expect(typedDb("-12", "db")).toBeUndefined();
    expect(typedDb("300", "percent")).toBeUndefined();
    expect(typedDb("0", "percent")).toBeUndefined();
  });
});

function Harness({ onChange }: { readonly onChange: (next: LoudnessValue) => void }) {
  const [value, setValue] = useState<LoudnessValue>({
    enabled: true,
    videoLufs: -14,
    audioFilesLufs: -18,
  });
  return (
    <LoudnessControls
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

describe("LoudnessControls", () => {
  it("keeps one target: a percentage typed moves the dB, and the LUFS stored", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const percent = screen.getByRole("textbox", {
      name: "Video volume as a percentage of the recommended level",
    });
    await userEvent.clear(percent);
    await userEvent.type(percent, "50");
    expect(onChange).toHaveBeenLastCalledWith({
      enabled: true,
      videoLufs: -20,
      audioFilesLufs: -18,
    });
    expect(screen.getByRole("textbox", { name: "Video volume" })).toHaveProperty("value", "−6");
    expect(screen.getByText(/this is −20 LUFS/)).toBeTruthy();
  });

  it("says the range when a volume is out of it, and keeps the last good one", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const db = screen.getByRole("textbox", { name: "Audio files volume" });
    await userEvent.clear(db);
    await userEvent.type(db, "9");
    expect(
      screen.getByText(/Enter a volume between −10 dB and \+4 dB \(32% to 158%\)/),
    ).toBeTruthy();
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ audioFilesLufs: -9 }));
  });

  it("hides the volumes while levelling is off", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(screen.getByRole("switch", { name: "Level the volume" }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));
    expect(screen.queryByRole("textbox", { name: "Video volume" })).toBeNull();
  });

  it("says when a volume left its default and resets it", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const reset = screen.getByRole("button", { name: "Reset video volume to 0 dB" });
    expect(reset).toHaveProperty("disabled", true);
    const db = screen.getByRole("textbox", { name: "Video volume" });
    await userEvent.clear(db);
    await userEvent.type(db, "-3");
    expect(screen.getByText("Changed · default 0 dB")).toBeTruthy();
    await userEvent.click(reset);
    expect(onChange).toHaveBeenLastCalledWith({
      enabled: true,
      videoLufs: -14,
      audioFilesLufs: -18,
    });
    expect(screen.getByRole("textbox", { name: "Video volume" })).toHaveProperty("value", "0");
  });
});
