import { legacyVideoEdit, type VideoEditSettings } from "@app/slices/video/edit-settings.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { renderApp, testDeps } from "@/test-app";
import { useVideoEditControls } from "./edit-controls";

afterEach(cleanup);

function Codec({
  value,
  onChange,
}: {
  readonly value: VideoEditSettings | undefined;
  readonly onChange: (next: VideoEditSettings) => void;
}): ReactElement {
  const edit = useVideoEditControls({ value, narrated: true, imageProvider: "", onChange });
  return edit.codec;
}

it("offers the video codec as a select, Automatic for a project without one, with one plain line", async () => {
  const onChange = vi.fn();
  renderApp(<Codec value={undefined} onChange={onChange} />, testDeps({}));
  const select = screen.getByLabelText("Video codec") as HTMLSelectElement;
  expect([...select.options].map((option) => option.text)).toEqual([
    "Automatic (AV1 on the graphics card, else H.264)",
    "H.264",
    "HEVC",
    "AV1",
  ]);
  expect(select.value).toBe("auto");
  expect(screen.getByText(/H\.264 works everywhere/)).toBeTruthy();
  expect(screen.getByText(/SVT-AV1/)).toBeTruthy();
  await userEvent.selectOptions(select, "av1");
  expect(onChange).toHaveBeenCalledWith({ ...legacyVideoEdit, codec: "av1" });
  onChange.mockClear();
  await userEvent.selectOptions(select, "h264");
  expect(onChange).toHaveBeenCalledWith({ ...legacyVideoEdit, codec: "h264" });
});

it("stores Automatic as no codec at all, so the project saves what it had", async () => {
  const onChange = vi.fn();
  renderApp(
    <Codec value={{ ...legacyVideoEdit, codec: "hevc" }} onChange={onChange} />,
    testDeps({}),
  );
  const select = screen.getByLabelText("Video codec") as HTMLSelectElement;
  expect(select.value).toBe("hevc");
  await userEvent.selectOptions(select, "auto");
  expect(onChange).toHaveBeenCalledWith(legacyVideoEdit);
});
