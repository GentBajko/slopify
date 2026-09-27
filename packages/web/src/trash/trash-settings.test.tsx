import type { TrashItem } from "@app/slices/trash/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { emptyAnswer, jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
import { daysLeftText, kindOf, TrashSettings } from "./trash-settings.js";

afterEach(cleanup);

const item = (over: Partial<TrashItem>): TrashItem => ({
  kind: "project",
  id: "p1",
  name: "Tiamat",
  detail: null,
  deletedAt: "2026-09-27T10:00:00.000Z",
  purgeAt: "2026-10-27T10:00:00.000Z",
  daysLeft: 30,
  ...over,
});

it("lists each item with its kind, deletion date and days left, and real buttons", async () => {
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({
        items: [item({}), item({ kind: "prompt", id: "x", name: "Explainer", detail: "article" })],
      }),
    }),
  );
  const list = await screen.findByRole("list", { name: "Deleted items" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows[0]?.textContent).toContain("Tiamat");
  expect(rows[0]?.textContent).toContain("Project · deleted");
  expect(rows[0]?.textContent).toContain("30 days left");
  expect(rows[1]?.textContent).toContain("Prompt · article");
  expect(within(list).getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  expect(within(list).getAllByRole("button", { name: "Delete now" })).toHaveLength(2);
});

it("says so when the trash is empty", async () => {
  renderApp(<TrashSettings />, testDeps({ "GET /api/trash": jsonAnswer({ items: [] }) }));
  expect(await screen.findByText("The trash is empty")).not.toBeNull();
});

it("restores an item and says the name it came back under", async () => {
  const restore = vi.fn(
    jsonAnswer({
      restored: {
        kind: "prompt",
        id: "x",
        name: "Explainer (restored)",
        renamedFrom: "Explainer",
      },
    }),
  );
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({
        items: [item({ kind: "prompt", id: "x", name: "Explainer", detail: "article" })],
      }),
      "POST /api/trash/prompt/x/restore": restore,
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Restore" }));
  await waitFor(() => expect(restore).toHaveBeenCalledTimes(1));
  expect(await screen.findByText(/Restored as "Explainer \(restored\)"/)).not.toBeNull();
});

it("shows the server's reason when a restore is refused", async () => {
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({
        items: [item({ kind: "schedule", id: "s1", name: "Weekly" })],
      }),
      "POST /api/trash/schedule/s1/restore": problemAnswer(
        "This schedule's template is in the trash too. Restore the template first.",
        409,
      ),
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Restore" }));
  expect(await screen.findByText(/Restore the template first/)).not.toBeNull();
});

it("asks before Delete now, and removes the item only on confirm", async () => {
  const remove = vi.fn(emptyAnswer());
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({ items: [item({})] }),
      "DELETE /api/trash/project/p1": remove,
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Delete now" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/every file it produced are removed from disk/)).not.toBeNull();
  expect(remove).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Delete for good" }));
  await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
  expect(await screen.findByText('Deleted "Tiamat" for good.')).not.toBeNull();
});

it("names kinds and days left plainly", () => {
  expect(kindOf(item({ kind: "entry", detail: "outro" }))).toBe("Outro");
  expect(kindOf(item({ kind: "template" }))).toBe("Template");
  expect(daysLeftText(1)).toBe("1 day left");
  expect(daysLeftText(0)).toBe("removed for good today");
});
