import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { freshDraftDocument } from "./draft-state";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() }),
);
afterEach(cleanup);

it.each(["title", "values.topic"])(
  "reveals the stable variation control for variants.0.%s",
  async (suffix) => {
    const h = refusal(`variants.0.${suffix}`);
    const id = crypto.randomUUID();
    await h.prepare({
      ...freshDraftDocument,
      form: { ...freshDraftDocument.form, articlePrompt: "Dossier" },
      variants: [{ id, title: "", values: {} }],
    });
    await userEvent.click(await screen.findByRole("button", { name: "Correct this field" }));
    const input = document.querySelector(`[data-play-field="items.${id}.${suffix}"]`);
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(input?.closest("details")?.open).toBe(true);
    expect(input?.getAttribute("aria-invalid")).toBe("true");
  },
);

it("reveals the font upload in Style for a persisted fontUpload refusal", async () => {
  const h = refusal("fontUpload");
  await h.prepare({
    ...freshDraftDocument,
    form: {
      ...freshDraftDocument.form,
      subtitles: { ...freshDraftDocument.form.subtitles, mode: "files" },
    },
  });
  await userEvent.click(await screen.findByRole("button", { name: "Correct this field" }));
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByLabelText("Upload font (.ttf or .otf)")),
  );
  expect(h.session().section).toBe("style");
});

it("focuses the supplied images group for an indexed attachment refusal", async () => {
  const h = refusal("provided.images.0");
  await h.prepare({
    ...suppliedDocument,
    form: {
      ...suppliedDocument.form,
      sources: { ...suppliedDocument.form.sources, images: "provide" },
      provided: {
        ...suppliedDocument.form.provided,
        images: [{ attachmentId: crypto.randomUUID(), name: "Missing.png" }],
      },
    },
  });
  await userEvent.click(await screen.findByRole("button", { name: "Correct this field" }));
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("data-play-field")).toBe("provided.images"),
  );
  expect(document.activeElement?.getAttribute("aria-invalid")).toBe("true");
  expect(h.session().section).toBe("outputs");
});

function refusal(field: string) {
  return reviewHarness(async (request, response) =>
    request.url.endsWith("/review")
      ? new Response(
          JSON.stringify({
            title: "Bad Request",
            status: 400,
            reason: "readiness",
            fields: [{ field, message: "Correct this field" }],
          }),
          { status: 400, headers: { "content-type": "application/problem+json" } },
        )
      : response,
  );
}
