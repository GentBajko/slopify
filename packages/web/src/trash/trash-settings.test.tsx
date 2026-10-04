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
  name: "Cleopatra",
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
  expect(rows[0]?.textContent).toContain("Cleopatra");
  expect(rows[0]?.textContent).toContain("Project · deleted");
  expect(rows[0]?.textContent).toContain("30 days left");
  expect(rows[1]?.textContent).toContain("Prompt · article");
  expect(within(list).getAllByRole("button", { name: "Restore" })).toHaveLength(2);
  expect(within(list).getAllByRole("button", { name: "Delete now" })).toHaveLength(2);
});

it("says so when the trash is empty, and what never comes here", async () => {
  renderApp(<TrashSettings />, testDeps({ "GET /api/trash": jsonAnswer({ items: [] }) }));
  expect(await screen.findByText("The trash is empty")).not.toBeNull();
  // F6: not "anything you delete": channels, cast, PDF themes and summaries are permanent.
  expect(screen.queryByText(/Anything you delete/)).toBeNull();
  expect(
    screen.getByText(/Channels, cast members, PDF themes and episode summaries/),
  ).not.toBeNull();
  expect((screen.getByRole("button", { name: "Empty trash" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it("shows the exact deletion time and filters by kind", async () => {
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({
        items: [item({}), item({ kind: "template", id: "t1", name: "Weekly explainer" })],
      }),
    }),
  );
  const list = await screen.findByRole("list", { name: "Deleted items" });
  const time = list.querySelector("time");
  expect(time?.getAttribute("dateTime")).toBe("2026-09-27T10:00:00.000Z");
  expect(time?.getAttribute("title")).toMatch(/^Deleted .+\. Removed for good .+\.$/);
  await userEvent.click(screen.getByRole("button", { name: "Templates" }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  expect(within(list).getByText("Weekly explainer")).not.toBeNull();
  expect(screen.getByRole("checkbox", { name: "Select all 1 shown" })).not.toBeNull();
});

it("restores the selected items in one go and says how many", async () => {
  const bulk = vi.fn(
    jsonAnswer({
      restored: [
        { kind: "project", id: "p1", name: "Cleopatra", renamedFrom: null },
        { kind: "project", id: "p2", name: "Rome", renamedFrom: null },
      ],
      failed: [],
    }),
  );
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({
        items: [item({}), item({ id: "p2", name: "Rome" }), item({ id: "p3", name: "Troy" })],
      }),
      "POST /api/trash/bulk/restore": bulk,
    }),
  );
  await userEvent.click(await screen.findByRole("checkbox", { name: "Select row: Cleopatra" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Select row: Rome" }));
  expect(screen.getByText("2 of 3 items selected")).not.toBeNull();
  const all = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
  expect(all.indeterminate).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Restore selected" }));
  await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Restored 2 items.")).not.toBeNull();
});

it("clears the selection with Esc", async () => {
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({ items: [item({}), item({ id: "p2", name: "Rome" })] }),
    }),
  );
  const box = await screen.findByRole("checkbox", { name: "Select row: Rome" });
  await userEvent.click(box);
  expect(screen.getByText("1 of 2 items selected")).not.toBeNull();
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByText("1 of 2 items selected")).toBeNull();
  expect((box as HTMLInputElement).checked).toBe(false);
});

it("asks before Empty trash, naming the count and that nothing comes back", async () => {
  const bulk = vi.fn(
    jsonAnswer({
      deleted: [
        { kind: "project", id: "p1" },
        { kind: "project", id: "p2" },
      ],
      failed: [],
    }),
  );
  renderApp(
    <TrashSettings />,
    testDeps({
      "GET /api/trash": jsonAnswer({ items: [item({}), item({ id: "p2", name: "Rome" })] }),
      "POST /api/trash/bulk/delete": bulk,
    }),
  );
  await userEvent.click(await screen.findByRole("button", { name: "Empty trash" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/delete all 2 items for good/)).not.toBeNull();
  expect(within(dialog).getByText(/2 projects and every file they produced/)).not.toBeNull();
  expect(within(dialog).getByText(/cannot be undone/)).not.toBeNull();
  expect(bulk).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole("button", { name: "Empty trash" }));
  await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
  expect(await screen.findByText("Deleted 2 items for good.")).not.toBeNull();
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
  expect(await screen.findByText('Deleted "Cleopatra" for good.')).not.toBeNull();
});

it("names kinds and days left plainly", () => {
  expect(kindOf(item({ kind: "entry", detail: "outro" }))).toBe("Outro");
  expect(kindOf(item({ kind: "template" }))).toBe("Template");
  expect(daysLeftText(1)).toBe("1 day left");
  expect(daysLeftText(0)).toBe("removed for good today");
});
