import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ChannelAmbientBed, channelBedForm, channelBedOf } from "@/channels/ambient-bed-kit";
import { PlayAmbientBed } from "@/play/ambient-bed";
import { freshForm, type PlayFormState } from "@/play/state";

afterEach(cleanup);

const video: PlayFormState = {
  ...freshForm,
  sources: { ...freshForm.sources, video: "generate", audio: "generate", images: "generate" },
};

function play(form: PlayFormState) {
  const update = vi.fn();
  const onPickFiles = vi.fn();
  render(
    <PlayAmbientBed
      form={form}
      problem={(field) => (field === "ambientBed.level" ? "Enter a level." : undefined)}
      update={update}
      onPickFiles={onPickFiles}
      onRemoveFile={vi.fn()}
      onReattachFile={undefined}
    />,
  );
  return { update, onPickFiles };
}

it("takes the channel's bed until the setup picks one, with the defaults to start from", async () => {
  const { update } = play(video);
  const select = screen.getByLabelText("Ambient sound");
  expect((select as HTMLSelectElement).value).toBe("");
  expect(screen.queryByLabelText("Level (dB)")).toBeNull();
  await userEvent.selectOptions(select, "Rain");
  expect(update).toHaveBeenCalledWith({
    ambientBed: { source: "rain", level: "-18", fadeIn: "3", tail: "6" },
  });
});

it("shows the numbers and the upload for My own file, and says a refused number in place", async () => {
  const { update, onPickFiles } = play({
    ...video,
    ambientBed: { source: "upload", level: "x", fadeIn: "3", tail: "6" },
  });
  expect(screen.getByText("Enter a level.")).not.toBeNull();
  await userEvent.upload(
    screen.getByLabelText(/^Ambient sound file/),
    new File(["mp3"], "rain.mp3", { type: "audio/mpeg" }),
  );
  expect(onPickFiles).toHaveBeenCalledWith("ambientBed", [expect.any(File)]);
  await userEvent.selectOptions(screen.getByLabelText("Ambient sound"), "None");
  expect(update).toHaveBeenLastCalledWith({
    ambientBed: { source: "none", level: "x", fadeIn: "3", tail: "6" },
  });
});

it("offers the channel only the built-in beds and holds the save on a bad number", () => {
  const onChange = vi.fn();
  render(
    <ChannelAmbientBed
      value={{ source: "wind", level: "-60", fadeIn: "3", tail: "6" }}
      onChange={onChange}
    />,
  );
  const options = [...(screen.getByLabelText("Ambient sound") as HTMLSelectElement).options];
  expect(options.map((option) => option.text)).toEqual(["Not set", "Rain", "Fireplace", "Wind"]);
  expect(screen.getByText(/between -40 and -6 dB/)).not.toBeNull();
  expect(channelBedOf({ source: "wind", level: "-60", fadeIn: "3", tail: "6" }).blocked).toBe(true);
  expect(channelBedOf({ source: "wind", level: "-20", fadeIn: "3", tail: "6" })).toEqual({
    brand: { ambientBed: { source: "wind", levelDb: -20, fadeInSeconds: 3, tailSeconds: 6 } },
    blocked: false,
  });
  expect(channelBedOf(undefined)).toEqual({ brand: {}, blocked: false });
  expect(
    channelBedForm({
      ambientBed: { source: "fire", levelDb: -20, fadeInSeconds: 0, tailSeconds: 4 },
    }),
  ).toEqual({ source: "fire", level: "-20", fadeIn: "0", tail: "4" });
});

it("says when the ambient level left its default and resets it", async () => {
  const { update } = play({
    ...video,
    ambientBed: { source: "rain", level: "-10", fadeIn: "3", tail: "6" },
  });
  expect(screen.getByText("Changed · default -18 dB")).toBeTruthy();
  await userEvent.click(screen.getByRole("button", { name: "Reset ambient level to -18 dB" }));
  expect(update).toHaveBeenCalledWith({
    ambientBed: { source: "rain", level: "-18", fadeIn: "3", tail: "6" },
  });
});
