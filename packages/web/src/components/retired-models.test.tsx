import type { RetiredUsage } from "@app/slices/model-upkeep/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { List } from "@/components/kit/list-row";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { RetiredModelRow } from "./retired-models";

afterEach(cleanup);

const usage = (over: Partial<RetiredUsage>): RetiredUsage => ({
  key: "template:t1:llm",
  kind: "template",
  id: "t1",
  name: "Lore",
  slot: "llm",
  provider: "openrouter",
  model: "old/model",
  why: "retired",
  replacement: { id: "new/model", name: "New Model" },
  blocked: null,
  ...over,
});

it("flags a template's retired model on its row and switches it in one click", async () => {
  let usages: RetiredUsage[] = [
    usage({}),
    usage({ key: "template:t2:llm", id: "t2", name: "Other" }),
  ];
  const sent: unknown[] = [];
  renderApp(
    <List label="Project templates">
      <RetiredModelRow kind="template" id="t1" name="Lore" />
    </List>,
    testDeps({
      "GET /api/providers/catalogue/retired": (request) => jsonAnswer({ usages })(request),
      "POST /api/providers/catalogue/retired/switch": async (request) => {
        sent.push(await request.json());
        usages = [];
        return jsonAnswer({ ok: true, changed: true })(request);
      },
    }),
  );
  const row = await screen.findByRole("listitem", { name: "Retired models in Lore" });
  expect(row.textContent).toContain("Text model old/model is retired.");
  // Only this template's own uses show on its row.
  expect(within(row).getAllByRole("button")).toHaveLength(1);
  await userEvent.click(within(row).getByRole("button", { name: "Switch to New Model" }));
  await waitFor(() =>
    expect(sent).toEqual([
      {
        kind: "template",
        id: "t1",
        slot: "llm",
        from: { provider: "openrouter", model: "old/model" },
        to: "new/model",
      },
    ]),
  );
  await waitFor(() =>
    expect(screen.queryByRole("listitem", { name: "Retired models in Lore" })).toBeNull(),
  );
});

it("says why a schedule's switch is held back, with the button off", async () => {
  const blocked =
    'This schedule runs an older version of the template "Lore". In Library → Schedules, choose Edit, pick the template again so it runs the latest version, then save.';
  renderApp(
    <List label="Saved schedules">
      <RetiredModelRow kind="schedule" id="s1" name="Weekly" />
    </List>,
    testDeps({
      "GET /api/providers/catalogue/retired": jsonAnswer({
        usages: [
          usage({ key: "schedule:s1:images", kind: "schedule", id: "s1", slot: "images", blocked }),
        ],
      }),
    }),
  );
  const row = await screen.findByRole("listitem", { name: "Retired models in Weekly" });
  expect(row.textContent).toContain("Image model old/model is retired.");
  expect(row.textContent).toContain("runs an older version");
  expect(
    within(row).getByRole("button", { name: "Switch to New Model" }).hasAttribute("disabled"),
  ).toBe(true);
});

it("shows nothing while nothing the row names is retired", async () => {
  let asked = false;
  renderApp(
    <List label="Saved schedules">
      <RetiredModelRow kind="schedule" id="s1" name="Weekly" />
    </List>,
    testDeps({
      "GET /api/providers/catalogue/retired": (request) => {
        asked = true;
        return jsonAnswer({ usages: [usage({})] })(request);
      },
    }),
  );
  await waitFor(() => expect(asked).toBe(true));
  expect(screen.queryByRole("listitem")).toBeNull();
});
