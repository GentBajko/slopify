import { subtitleFrame, subtitlePlacement } from "@app/slices/subtitles/layout.js";
import { subtitlePositions } from "@app/slices/subtitles/model.js";
import { act, cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { mountSupplied } from "./draft-upload-test-fixture";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage?.clear();
});

it.each(
  (["16:9", "9:16"] as const).flatMap((format) =>
    subtitlePositions.map((position) => ({ format, position })),
  ),
)("uses shared placement for $format $position in one preview", async ({ format, position }) => {
  const { requests } = await mountSupplied();
  await userEvent.click(screen.getByRole("button", { name: "Style" }));
  await userEvent.selectOptions(
    screen.getByLabelText("Subtitles", { selector: "select" }),
    "files",
  );
  await userEvent.click(screen.getByRole("radio", { name: position }));
  const formatControl = screen.getByRole("radio", { name: format });
  await userEvent.click(formatControl);
  expect(document.activeElement).toBe(formatControl);
  const preview = screen.getByRole("img", { name: "Subtitle style preview" });
  const frame = subtitleFrame(format);
  const placement = subtitlePlacement(position, frame.height);
  const sample = screen.getByLabelText("Caption sample");
  expect(preview.dataset.position).toBe(position);
  expect(preview.style.aspectRatio).toBe(`${frame.width} / ${frame.height}`);
  expect(sample.style.top).toBe(`${(placement.y / frame.height) * 100}%`);
  expect(sample.style.transform).toBe(`translate(-50%, ${placement.translateY}%)`);
  expect(screen.getAllByRole("img", { name: "Subtitle style preview" })).toHaveLength(1);
  expect(
    requests.filter(
      (r) => r.method === "POST" && /alignment|subtitles|providers|projects/.test(r.url),
    ),
  ).toHaveLength(0);
});

it("keeps the sample and raw invalid size across sections and viewport moves", async () => {
  let change: (() => void) | undefined;
  const media = {
    matches: true,
    addEventListener: vi.fn((_event: string, listener: () => void) => {
      change = listener;
    }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", () => media);
  const { requests } = await mountSupplied();
  await userEvent.click(screen.getByRole("button", { name: "Style" }));
  await userEvent.selectOptions(
    screen.getByLabelText("Subtitles", { selector: "select" }),
    "files",
  );
  await userEvent.clear(screen.getByLabelText("Preview text"));
  await userEvent.type(screen.getByLabelText("Preview text"), "Only a sample");
  await userEvent.clear(screen.getByLabelText("Subtitle font size"));
  expect((screen.getByLabelText("Subtitle font size") as HTMLInputElement).value).toBe("");
  await act(async () => {
    media.matches = false;
    change?.();
  });
  expect(screen.getAllByRole("img", { name: "Subtitle style preview" })).toHaveLength(1);
  expect(screen.getByLabelText("Caption sample").textContent).toBe("Only a sample");
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(screen.getByRole("list", { name: "Setup errors" }).textContent).toMatch(/font size/i);
  await userEvent.click(screen.getByRole("button", { name: "Style" }));
  expect((screen.getByLabelText("Preview text") as HTMLInputElement).value).toBe("Only a sample");
  expect((screen.getByLabelText("Subtitle font size") as HTMLInputElement).value).toBe("");
  expect(requests.some((r) => r.url.includes("alignment"))).toBe(false);
  cleanup();
  expect(media.removeEventListener).toHaveBeenCalled();
});

it.each(["pending", "copying", "reattach", "ready"] as const)(
  "uses only a ready owned image endpoint (%s)",
  async (state) => {
    const { draftView, mountPlay } = await import("./play-test-fixture");
    const { jsonAnswer } = await import("@/test-app");
    const id = "00000000-0000-4000-8000-000000000001";
    const imageId = "00000000-0000-4000-8000-000000000003";
    const view = draftView(id, "Image draft");
    const form = view.draft.document.form;
    await mountPlay({
      "GET /api/drafts": jsonAnswer({
        drafts: [{ id, title: "Image draft", version: 1, updatedAt: "2026-09-13", readable: true }],
      }),
      [`GET /api/drafts/${id}`]: jsonAnswer({
        ...view,
        draft: {
          ...view.draft,
          document: {
            ...view.draft.document,
            form: {
              ...form,
              sources: { ...form.sources, images: "provide" },
              provided: {
                ...form.provided,
                images: [{ attachmentId: imageId, name: "scene.png" }],
              },
            },
          },
        },
        attachments: [
          {
            id: imageId,
            kind: "images",
            name: "scene.png",
            state,
            stagedFileId: state === "ready" ? "00000000-0000-4000-8000-000000000099" : null,
            bytes: 10,
            error: null,
          },
        ],
      }),
    });
    await userEvent.click(screen.getByRole("button", { name: "Drafts" }));
    await userEvent.click(await screen.findByRole("button", { name: "Image draft" }));
    await userEvent.click(screen.getByRole("button", { name: "Style" }));
    const frame = screen.getByRole("img", { name: "Subtitle style preview" });
    expect(frame.querySelector("img")?.getAttribute("src") ?? null).toBe(
      state === "ready" ? `http://slopify.test/api/drafts/${id}/attachments/${imageId}/file` : null,
    );
    expect(screen.queryByLabelText("Caption sample")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
    // The frame preview belongs to Style alone.
    expect(screen.queryByRole("img", { name: "Subtitle style preview" })).toBeNull();
  },
);
