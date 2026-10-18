import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createOpensSimple } from "@/routes/play";
import { jsonAnswer } from "@/test-app";
import { reviewHarness, reviewStorage, suppliedDocument } from "./review-test-harness";

// Create: a template, a topic and Start. More settings opens the whole Play form as it was,
// and that form still starts a run exactly as before.

beforeEach(() =>
  Object.defineProperty(window, "localStorage", { configurable: true, value: reviewStorage() }),
);
afterEach(cleanup);

const saved = jsonAnswer({
  templates: [
    {
      id: "66666666-6666-4666-8666-666666666666",
      name: "Weekly",
      version: 1,
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
  ],
});

// As the harness's prepare, but Create shows no prompt list to wait for.
async function simpleCreate(document: PlayDraftDocument = suppliedDocument) {
  const h = reviewHarness(
    undefined,
    { "GET /api/project-templates": saved },
    { simpleByDefault: true },
  );
  await screen.findByRole("option", { name: "Weekly" });
  await screen.findByRole("button", { name: "More settings" });
  await act(async () => {
    h.session().edit(document);
    await h.session().navigate("review");
  });
  return h;
}

const starts = (requests: readonly Request[]) =>
  requests.filter((request) => request.url.endsWith("/start"));

it("shows only the template, the topic and Start, and starts a run from there", async () => {
  const h = await simpleCreate();
  expect(screen.getByLabelText("Template")).not.toBeNull();
  expect(screen.queryByRole("list", { name: "Setup" })).toBeNull();
  expect(screen.getByRole("button", { name: "More settings" })).not.toBeNull();
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Start run" }));
  await waitFor(() => expect(h.created).toHaveBeenCalledTimes(1));
  expect(starts(h.requests)).toHaveLength(1);
});

it("opens today's whole form with More settings, which still starts the run, and remembers it", async () => {
  const h = await simpleCreate();
  await userEvent.click(screen.getByRole("button", { name: "More settings" }));
  const setup = await screen.findByRole("list", { name: "Setup" });
  expect(within(setup).getAllByRole("listitem").length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "More settings" })).toBeNull();
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Start run" }));
  await waitFor(() => expect(h.created).toHaveBeenCalledTimes(1));
  expect(starts(h.requests)).toHaveLength(1);
  // The route opens Create on the whole form next time in this browser.
  expect(createOpensSimple()).toBe(false);
});

it("says how many settings need fixing first, and More settings opens them", async () => {
  await simpleCreate({
    ...suppliedDocument,
    form: {
      ...suppliedDocument.form,
      sources: { ...suppliedDocument.form.sources, audio: "generate" },
    },
  });
  const note = await screen.findByText(/need(s)? you before this can start/u);
  expect(note).not.toBeNull();
  await userEvent.click(screen.getByRole("button", { name: "More settings" }));
  expect(await screen.findByRole("list", { name: "Setup" })).not.toBeNull();
});

it("says a template wasn't checked in the studio, and still starts it", async () => {
  const templateId = "55555555-5555-4555-8555-555555555555";
  const h = reviewHarness(
    undefined,
    {
      "GET /api/project-templates": jsonAnswer({
        templates: [
          {
            id: templateId,
            name: "Weekly",
            version: 2,
            updatedAt: "2026-10-01T00:00:00.000Z",
            gate: { head: 2, runs: 1, gate: "legacy" },
          },
        ],
      }),
    },
    { simpleByDefault: true },
  );
  await screen.findByRole("option", { name: "Weekly" });
  await act(async () => {
    h.session().edit({ ...suppliedDocument, templateSource: { id: templateId, version: 2 } });
    await h.session().navigate("review");
  });
  expect(await screen.findByText(/version 2 · Not checked in the studio/u)).not.toBeNull();
  await waitFor(() =>
    expect((screen.getByRole("button", { name: "Start run" }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Start run" }));
  await waitFor(() => expect(h.created).toHaveBeenCalledTimes(1));
});

it("opens the whole form while no template is saved yet", async () => {
  reviewHarness(undefined, {}, { simpleByDefault: true });
  expect(await screen.findByRole("list", { name: "Setup" })).not.toBeNull();
  expect(screen.queryByRole("button", { name: "More settings" })).toBeNull();
});
