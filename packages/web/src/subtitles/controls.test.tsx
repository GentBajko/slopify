import type { Format } from "@app/kernel/pipeline.js";
import { defaultSubtitles, type SubtitleConfig } from "@app/slices/subtitles/model.js";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { SubtitleControls } from "./controls";
import { SubtitlePreview } from "./style-preview";

export const fonts = [
  { id: "default", name: "Default", family: "Arial", source: "bundled" },
  { id: "system-sans", name: "System sans", family: "DejaVu Sans", source: "system" },
];

afterEach(cleanup);

function Form({
  video = true,
  audio = true,
  onUploading,
  format = "16:9",
}: {
  readonly format?: Format;
  readonly video?: boolean;
  readonly audio?: boolean;
  readonly onUploading?: (pending: boolean) => void;
}) {
  const [value, setValue] = useState<SubtitleConfig>(defaultSubtitles);
  return (
    <>
      <SubtitleControls
        value={value}
        format={format}
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
  it("starts Off, loads fonts only when enabled, and keeps changed font and size", async () => {
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

it("previews all five saved positions in the selected video frame", async () => {
  const user = userEvent.setup();
  const mounted = renderApp(
    <Form format="9:16" />,
    testDeps({ "GET /api/fonts": jsonAnswer({ fonts }) }),
  );
  await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "burn-in");
  const preview = screen.getByRole("img", { name: "Subtitle style preview" });
  expect(preview.style.aspectRatio).toBe("1080 / 1920");
  const position = screen.getByLabelText("Subtitle position");
  expect(position.querySelectorAll("option")).toHaveLength(5);
  for (const [value, top] of [
    ["top", 3.125],
    ["upper-middle", 25],
    ["center", 50],
    ["lower-middle", 75],
    ["bottom", 96.875],
  ] as const) {
    await user.selectOptions(position, value);
    expect(preview.querySelector("span")?.style.top).toBe(`${top}%`);
    expect(screen.getByLabelText("Selected subtitles").textContent).toContain(
      `"position":"${value}"`,
    );
  }
  mounted.unmount();
  renderApp(<Form format="16:9" />, testDeps({ "GET /api/fonts": jsonAnswer({ fonts }) }));
  await user.selectOptions(screen.getByLabelText("Subtitles", { selector: "select" }), "burn-in");
  expect(screen.getByRole("img", { name: "Subtitle style preview" }).style.aspectRatio).toBe(
    "1920 / 1080",
  );
});

it("renders externally owned upload state without releasing it on unmount", async () => {
  const notify = vi.fn();
  const pick = vi.fn();
  const mounted = renderApp(
    <SubtitleControls
      value={{ ...defaultSubtitles, mode: "files" }}
      audioEnabled
      videoEnabled
      onChange={() => {}}
      onUploading={notify}
      fontUpload={{ pending: true, error: "Try again", pick }}
    />,
    testDeps({ "GET /api/fonts": jsonAnswer({ fonts }) }),
  );
  expect(screen.getByText("Uploading font…")).not.toBeNull();
  expect(screen.getByText("Try again")).not.toBeNull();
  mounted.unmount();
  expect(notify).not.toHaveBeenCalled();
});

it("lets Play suppress the embedded preview while project controls keep it by default", () => {
  const props = {
    value: { ...defaultSubtitles, mode: "files" as const },
    audioEnabled: true,
    videoEnabled: true,
    onChange: () => {},
  };
  const mounted = renderApp(
    <SubtitleControls {...props} showPreview={false} />,
    testDeps({ "GET /api/fonts": jsonAnswer({ fonts }) }),
  );
  expect(screen.queryByRole("img", { name: "Subtitle style preview" })).toBeNull();
  mounted.unmount();
  renderApp(<SubtitleControls {...props} />, testDeps({ "GET /api/fonts": jsonAnswer({ fonts }) }));
  expect(screen.getAllByRole("img", { name: "Subtitle style preview" })).toHaveLength(1);
  expect(screen.getByLabelText("Caption sample").textContent).toBe(
    "Every story begins with a word.",
  );
});

it("reports failed font loading, removes the face, and never adds a late loaded face", async () => {
  const add = vi.fn();
  const remove = vi.fn();
  const descriptor = Object.getOwnPropertyDescriptor(document, "fonts");
  Object.defineProperty(document, "fonts", { configurable: true, value: { add, delete: remove } });
  let release: ((value: object) => void) | undefined;
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("Unavailable font"))
    .mockImplementationOnce(
      () =>
        new Promise<object>((resolve) => {
          release = resolve;
        }),
    );
  vi.stubGlobal(
    "FontFace",
    vi.fn(function (this: { load: typeof load }) {
      this.load = load;
    }),
  );
  try {
    const failed = renderApp(
      <SubtitlePreview value={defaultSubtitles} format="16:9" />,
      testDeps({}),
    );
    await screen.findByText(/Font preview unavailable/);
    failed.unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    const pending = renderApp(
      <SubtitlePreview value={defaultSubtitles} format="9:16" />,
      testDeps({}),
    );
    pending.unmount();
    await act(async () => {
      release?.({});
    });
    expect(remove).toHaveBeenCalledTimes(2);
    expect(add).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    if (descriptor) Object.defineProperty(document, "fonts", descriptor);
    else Reflect.deleteProperty(document, "fonts");
  }
});
