import { defaultSubtitles, type SubtitleConfig } from "@app/slices/subtitles/model.js";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { SubtitleControls } from "./controls";

export const fonts = [
  { id: "default", name: "Default", family: "Arial", source: "bundled" },
  { id: "system-sans", name: "System sans", family: "DejaVu Sans", source: "system" },
];

afterEach(cleanup);

function Form({
  video = true,
  audio = true,
  onUploading,
}: {
  readonly video?: boolean;
  readonly audio?: boolean;
  readonly onUploading?: (pending: boolean) => void;
}) {
  const [value, setValue] = useState<SubtitleConfig>(defaultSubtitles);
  return (
    <>
      <SubtitleControls
        value={value}
        videoEnabled={video}
        audioEnabled={audio}
        onChange={setValue}
        {...(onUploading ? { onUploading } : {})}
      />
      <output aria-label="Selected subtitles">{JSON.stringify(value)}</output>
    </>
  );
}

describe("subtitle controls", () => {
  it("starts Off, loads fonts only when enabled, and previews changed font and size", async () => {
    const user = userEvent.setup();
    const list = vi.fn(jsonAnswer({ fonts }));
    renderApp(<Form />, testDeps({ "GET /api/fonts": list }));
    expect(
      (screen.getByLabelText("Subtitles", { selector: "select" }) as HTMLSelectElement).value,
    ).toBe("off");
    expect(list).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "burn-in");
    await screen.findByRole("option", { name: "System sans · system" });
    await user.selectOptions(screen.getByLabelText("Subtitle font"), "system-sans");
    const size = screen.getByLabelText("Subtitle font size");
    await user.clear(size);
    await user.type(size, "64");
    expect(screen.getByLabelText("Selected subtitles").textContent).toContain('"fontSize":64');
    expect(
      screen.getByRole("img", { name: "Subtitle style preview" }).querySelector("span")?.style
        .fontSize,
    ).toBe("32px");
    expect(screen.getByText(/approximately 95 MB/)).not.toBeNull();
  });

  it("uploads and selects a custom font after the server accepts it", async () => {
    const user = userEvent.setup();
    const uploaded = { id: "custom-font", name: "My font", family: "My font", source: "uploaded" };
    const upload = vi.fn(async (request: Request) => {
      const body = await request.formData();
      expect(body.get("file")).toMatchObject({ name: "my-font.ttf" });
      return jsonAnswer({ font: uploaded })(request);
    });
    renderApp(
      <Form />,
      testDeps({
        "GET /api/fonts": jsonAnswer({ fonts: [...fonts, uploaded] }),
        "POST /api/fonts": upload,
      }),
    );
    await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "burn-in");
    await user.upload(
      screen.getByLabelText("Upload font (.ttf or .otf)"),
      new File(["testfont"], "my-font.ttf", { type: "font/ttf" }),
    );
    await waitFor(() =>
      expect((screen.getByLabelText("Subtitle font") as HTMLSelectElement).value).toBe(
        "custom-font",
      ),
    );
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it("keeps the selected font and exposes an upload failure", async () => {
    const user = userEvent.setup();
    renderApp(
      <Form />,
      testDeps({
        "GET /api/fonts": jsonAnswer({ fonts }),
        "POST /api/fonts": problemAnswer("This file is not a font."),
      }),
    );
    await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "files");
    await user.upload(
      screen.getByLabelText("Upload font (.ttf or .otf)"),
      new File(["bad"], "broken.otf", { type: "font/otf" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByText("This file is not a font.")).not.toBeNull();
    expect((screen.getByLabelText("Subtitle font") as HTMLSelectElement).value).toBe("default");
  });

  it("holds mode changes during an upload and releases its pending signal on unmount", async () => {
    const user = userEvent.setup();
    let release: ((response: Response) => void) | undefined;
    const response = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const busy = vi.fn();
    const mounted = renderApp(
      <Form onUploading={busy} />,
      testDeps({ "GET /api/fonts": jsonAnswer({ fonts }), "POST /api/fonts": () => response }),
    );
    await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "files");
    await user.upload(
      screen.getByLabelText("Upload font (.ttf or .otf)"),
      new File(["font"], "file.ttf", { type: "font/ttf" }),
    );
    await screen.findByText("Uploading font…");
    expect(
      (screen.getByLabelText("Subtitles", { selector: "select" }) as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(busy).toHaveBeenLastCalledWith(true);
    mounted.unmount();
    expect(busy).toHaveBeenLastCalledWith(false);
    await act(async () => {
      release?.(
        new Response(JSON.stringify({ font: fonts[0] }), {
          headers: { "content-type": "application/json" },
        }),
      );
    });
  });

  it("disables subtitles without audio and burn-in without video", async () => {
    const user = userEvent.setup();
    const mounted = renderApp(<Form audio={false} />, testDeps({}));
    expect(
      screen.getByLabelText("Subtitles", { selector: "select" }).closest("fieldset")?.disabled,
    ).toBe(true);
    mounted.unmount();
    renderApp(<Form video={false} />, testDeps({ "GET /api/fonts": jsonAnswer({ fonts }) }));
    expect(
      (screen.getByRole("option", { name: "Burn into video + files" }) as HTMLOptionElement)
        .disabled,
    ).toBe(true);
    await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "files");
    expect(screen.getByText(/Audio exports support separate subtitle files/)).not.toBeNull();
  });
});
