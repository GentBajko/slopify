import type { Prompt } from "@app/slices/library/model.js";
import { defaultReviewPrompts } from "@app/slices/reviews/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { NewPromptDrawer } from "./new-prompt-drawer.js";

afterEach(cleanup);

it("offers the built-in texts of the kind, then yours, and only while the text is empty", async () => {
  const user = userEvent.setup();
  const mine: Prompt = {
    id: "r1",
    kind: "review",
    name: "Strict facts",
    body: "Fail it on any unsupported claim.",
    slots: [],
    updatedAt: "2026-09-01T10:00:00.000Z",
  };
  renderRouted(
    <NewPromptDrawer kind="review" open onClose={vi.fn()} onSaved={vi.fn()} />,
    testDeps({ "GET /api/prompts": jsonAnswer({ prompts: [mine] }) }),
  );
  await user.click(await screen.findByRole("button", { name: "Start from an example" }));
  const menu = await screen.findByRole("menu");
  expect(within(menu).getByText("Built in")).not.toBeNull();
  expect(within(menu).getByText("Your prompts")).not.toBeNull();
  expect((await within(menu).findAllByRole("menuitem")).map((one) => one.textContent).at(-1)).toBe(
    "Strict facts",
  );
  await user.click(within(menu).getByRole("menuitem", { name: "Article check" }));
  expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toBe(
    defaultReviewPrompts.article,
  );
  // Replacing a typed text is the full editor's, so the menu goes once there is text.
  expect(screen.queryByRole("button", { name: "Start from an example" })).toBeNull();
});
