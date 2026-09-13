import { resolveReviewInputs } from "@app/slices/play-drafts/review-inputs.js";
import { readDraft } from "@app/slices/play-drafts/service.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { jsonAnswer, problemAnswer } from "@/test-app";
import { sqliteSessionFixture } from "./draft-sqlite-fixture";
import { deferred } from "./play-test-fixture";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() }),
);
afterEach(cleanup);

const cases = (["subtitles-off", "audio-off"] as const).flatMap((mode) =>
  [false, true].map((reload) => ({ mode, reload })),
);
it.each(cases)(
  "recovers a failed font through the Review link with $mode (reload=$reload)",
  async ({ mode, reload }) => {
    const fixture = sqliteSessionFixture();
    try {
      const pending = deferred();
      const harness = reviewHarness(undefined, {
        ...fixture.routes,
        "POST /api/fonts": () => pending.promise,
        "POST /api/drafts/:id/review": async (request) => {
          const view = readDraft(fixture.deps, new URL(request.url).pathname.split("/")[3] ?? "");
          if (!view.ok) throw new Error("Missing saved draft");
          if (!view.value.draft.document.fontUpload)
            return jsonAnswer(
              { title: "Not reviewed", status: 400, reason: "readiness", fields: [] },
              400,
            )(request);
          const unexpected = (): never => {
            throw new Error("Font lock should stop resolution before catalogue access");
          };
          const result = resolveReviewInputs(
            {
              ...fixture.deps,
              resolveFont: async () => unexpected(),
              catalogue: {
                read: unexpected,
                models: unexpected,
                refresh: async () => unexpected(),
                status: unexpected,
              },
            },
            view.value,
            null,
          );
          return jsonAnswer({ title: "Draft refused", status: 400, ...result }, 400)(request);
        },
      });
      await harness.prepare({
        ...suppliedDocument,
        form: {
          ...suppliedDocument.form,
          sources: { ...suppliedDocument.form.sources, audio: "generate" },
          subtitles: {
            ...suppliedDocument.form.subtitles,
            mode: "files",
            fontSize: "67",
            position: "top",
          },
        },
      });
      await userEvent.click(screen.getByRole("button", { name: "Style" }));
      await userEvent.upload(
        screen.getByLabelText("Upload font (.ttf or .otf)"),
        new File(["bad"], "broken.ttf", { type: "font/ttf" }),
      );
      await act(async () =>
        pending.resolve(await problemAnswer("Invalid font")(new Request("http://test"))),
      );
      await screen.findByText("Reattach broken.ttf, or select a font.");
      if (mode === "subtitles-off")
        await userEvent.selectOptions(
          screen.getByLabelText("Subtitles", { selector: "select" }),
          "off",
        );
      else {
        await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
        await userEvent.click(
          within(screen.getByRole("radiogroup", { name: "audio source" })).getByRole("radio", {
            name: "Off",
          }),
        );
      }
      await userEvent.click(screen.getByRole("button", { name: "Review" }));
      if (reload) await harness.restart();
      const link = await screen.findByRole("button", {
        name: "Wait for the font upload to finish or choose another font.",
      });
      expect(
        (screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled,
      ).toBe(true);
      expect(harness.session().document.fontUpload?.name).toBe("broken.ttf");
      await userEvent.click(link);
      const recovery = await screen.findByRole("button", { name: "Keep current font" });
      await waitFor(() => expect(document.activeElement).toBe(recovery));
      expect(document.querySelectorAll('[data-play-field="subtitles.fontUpload"]')).toHaveLength(1);
      expect(screen.getByText("Unfinished font upload: broken.ttf")).not.toBeNull();
      if (!reload) expect(screen.getByText("Invalid font")).not.toBeNull();
      const before = harness.session().document.form;
      await userEvent.click(recovery);
      expect(harness.session().document.fontUpload).toBeNull();
      expect(harness.session().document.form).toEqual(before);
      await act(async () => {
        await harness.session().flush();
      });
      await harness.restart();
      await waitFor(() => expect(harness.session().status).toBe("saved"));
      expect(harness.session().document.fontUpload).toBeNull();
      expect(harness.session().document.form).toEqual(before);
      expect(harness.requests.filter((request) => request.url.endsWith("/start"))).toHaveLength(0);
    } finally {
      cleanup();
      fixture.close();
    }
  },
);

it("keeps an inactive in-flight font locked until explicit recovery and ignores its late result", async () => {
  const pending = deferred();
  const harness = reviewHarness(undefined, { "POST /api/fonts": () => pending.promise });
  await harness.prepare({
    ...suppliedDocument,
    form: {
      ...suppliedDocument.form,
      sources: { ...suppliedDocument.form.sources, audio: "generate" },
      subtitles: { ...suppliedDocument.form.subtitles, mode: "files" },
    },
  });
  await userEvent.click(screen.getByRole("button", { name: "Style" }));
  await userEvent.upload(
    screen.getByLabelText("Upload font (.ttf or .otf)"),
    new File(["font"], "late.ttf", { type: "font/ttf" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(
    within(screen.getByRole("radiogroup", { name: "audio source" })).getByRole("radio", {
      name: "Off",
    }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Review" }));
  expect(harness.session().fontUploading).toBe(true);
  expect((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Wait for uploads to finish before Start" }),
  );
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep current font" })),
  );
  expect(screen.getByText("Uploading late.ttf…")).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "Outputs" }));
  await userEvent.click(screen.getByRole("button", { name: "Fix setup" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep current font" })),
  );
  await userEvent.click(screen.getByRole("button", { name: "Keep current font" }));
  const fontId = harness.session().document.form.subtitles.fontId;
  await act(async () =>
    pending.resolve(
      await jsonAnswer({
        font: { id: "late-font", name: "Late", family: "Late", source: "uploaded" },
      })(new Request("http://test")),
    ),
  );
  expect(harness.session().document.fontUpload).toBeNull();
  expect(harness.session().document.form.subtitles.fontId).toBe(fontId);
  expect(harness.session().fontUploading).toBe(false);
});
