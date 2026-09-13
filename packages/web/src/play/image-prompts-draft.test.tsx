import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

beforeEach(() =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() }),
);
afterEach(cleanup);
it("restores a missing image selection and keeps its raw count until explicit removal", async () => {
  const h = reviewHarness();
  const picked = [{ name: "Deleted image prompt", number: "03" }];
  await h.prepare({
    ...suppliedDocument,
    form: {
      ...suppliedDocument.form,
      sources: { ...suppliedDocument.form.sources, images: "generate" },
      imagePrompts: picked,
    },
  });
  await act(async () => {
    await h.session().flush();
  });
  await h.restart();
  await waitFor(() => expect(h.session().document.form.imagePrompts).toEqual(picked));
  await act(async () => {
    await h.session().navigate("outputs");
  });
  expect(screen.getByText(/Missing template/)).not.toBeNull();
  expect((screen.getByLabelText("Number for Deleted image prompt") as HTMLInputElement).value).toBe(
    "3",
  );
  await userEvent.click(screen.getByRole("checkbox", { name: "Maps" }));
  expect(h.session().document.form.imagePrompts[0]).toEqual(picked[0]);
  await userEvent.click(screen.getByRole("checkbox", { name: "Deleted image prompt" }));
  expect(h.session().document.form.imagePrompts).toEqual([{ name: "Maps", number: "1" }]);
  expect(h.session().document.form.sources.images).toBe("generate");
});
