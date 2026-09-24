import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderRouted, testDeps } from "@/test-app";
import { NarrationPreparation } from "./narration-preparation";

afterEach(cleanup);
const prompts = [
  {
    id: "a",
    kind: "article" as const,
    name: "Article",
    body: "Words",
    slots: [],
    updatedAt: "now",
  },
  {
    id: "n",
    kind: "narration" as const,
    name: "Delivery",
    body: "Calm",
    slots: [],
    updatedAt: "now",
  },
];
it("defaults to Off and offers only narration prompts", async () => {
  const onChange = vi.fn();
  renderRouted(
    <NarrationPreparation value="" prompts={prompts} supported onChange={onChange} />,
    testDeps({}),
  );
  const picker = await screen.findByLabelText("Narration Preparation");
  expect((picker as HTMLSelectElement).value).toBe("");
  expect(screen.queryByRole("option", { name: "Article" })).toBeNull();
  fireEvent.change(picker, { target: { value: "Delivery" } });
  expect(onChange).toHaveBeenCalledWith("Delivery");
});
it("keeps an unavailable saved selection visible and explains model incompatibility", async () => {
  renderRouted(
    <NarrationPreparation value="Missing" prompts={[]} supported={false} onChange={() => {}} />,
    testDeps({}),
  );
  expect(((await screen.findByLabelText("Narration Preparation")) as HTMLSelectElement).value).toBe(
    "Missing",
  );
  expect(screen.getByText(/Choose Inworld TTS-2 or turn preparation Off/)).not.toBeNull();
});
