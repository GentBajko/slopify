import { legacyVideoEdit } from "@app/slices/video/edit-settings.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import {
  type Answer,
  jsonAnswer,
  problemAnswer,
  renderApp,
  testDeps,
  testOrigin,
} from "@/test-app";
import { StylePreview, type StylePreviewSettings } from "./style-preview";

afterEach(cleanup);

const hash = "a".repeat(64);
const settings: StylePreviewSettings = {
  format: "16:9",
  subtitles: { mode: "burn-in", fontId: "system-sans", fontSize: 52, position: "lower-middle" },
  videoEdit: { ...legacyVideoEdit, grain: "subtle" },
};
const fonts = jsonAnswer({
  fonts: [{ id: "system-sans", name: "System sans", family: "DejaVu Sans", source: "system" }],
});

function recording(answer: Answer): { readonly answer: Answer; readonly bodies: unknown[] } {
  const bodies: unknown[] = [];
  return {
    bodies,
    answer: async (request) => {
      bodies.push(await request.clone().json());
      return answer(request);
    },
  };
}

it("renders the preview with the settings and plays it", async () => {
  let release = (): void => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const posted = recording(async (request) => {
    await gate;
    const count = String(posted.bodies.length);
    return jsonAnswer({
      hash,
      url: `/api/style-preview/${hash}.mp4?v=${count}`,
      cached: false,
      seconds: 6,
    })(request);
  });
  renderApp(
    <StylePreview settings={settings} />,
    testDeps({ "GET /api/fonts": fonts, "POST /api/style-preview": posted.answer }),
  );
  expect(screen.getByRole("heading", { name: "Style preview" })).toBeTruthy();
  expect(screen.getByText("6 seconds rendered with your settings")).toBeTruthy();
  expect(await screen.findByRole("status")).toHaveProperty("textContent", "Rendering the preview…");
  release();
  const video = await screen.findByLabelText("Style preview", { selector: "video" });
  expect(video.getAttribute("src")).toBe(`${testOrigin}/api/style-preview/${hash}.mp4?v=1`);
  expect(posted.bodies[0]).toEqual({
    format: "16:9",
    subtitles: settings.subtitles,
    videoEdit: settings.videoEdit,
  });
  expect(await screen.findByText("Captions: System sans 52 · Lower middle")).toBeTruthy();

  await userEvent.click(screen.getByRole("button", { name: "Render again" }));
  await waitFor(() => {
    expect(video.getAttribute("src")).toBe(`${testOrigin}/api/style-preview/${hash}.mp4?v=2`);
  });
  expect(posted.bodies[1]).toMatchObject({ force: true });
  expect(posted.bodies).toHaveLength(2);
});

it("says in words what failed and how to fix it", async () => {
  renderApp(
    <StylePreview settings={settings} />,
    testDeps({
      "GET /api/fonts": fonts,
      "POST /api/style-preview": problemAnswer(
        "The style preview couldn't render because ffmpeg wasn't found. Install ffmpeg, or use the Docker image, then press Render again.",
        503,
      ),
    }),
  );
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("ffmpeg wasn't found");
  expect(alert.textContent).toContain("press Render again");
  expect(screen.queryByLabelText("Style preview", { selector: "video" })).toBeNull();
});

it("waits for a valid caption size before rendering", async () => {
  const posted = recording(
    jsonAnswer({ hash, url: `/api/style-preview/${hash}.mp4`, cached: true, seconds: 6 }),
  );
  renderApp(
    <StylePreview
      settings={{ ...settings, subtitles: { ...settings.subtitles, fontSize: Number.NaN } }}
    />,
    testDeps({ "GET /api/fonts": fonts, "POST /api/style-preview": posted.answer }),
  );
  expect(
    await screen.findByText(
      "The preview renders again once the caption size is between 16 and 120.",
    ),
  ).toBeTruthy();
  await new Promise((resolve) => setTimeout(resolve, 800));
  expect(posted.bodies).toHaveLength(0);
});
