import type { Entry, Prompt } from "@app/slices/library/model.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { EntriesRoute } from "@/routes/entries";
import { PromptsRoute } from "@/routes/prompts";
import { type Answer, jsonAnswer, renderRouted, testDeps, testVersion } from "@/test-app";

afterEach(cleanup);

const dossier: Prompt = {
  id: "p1",
  kind: "article",
  name: "Documentary dossier",
  body: "Compose a dossier on {{topic}}.",
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

const coldOpen: Entry = {
  id: "e1",
  category: "intro",
  mode: "text",
  name: "Cold open",
  body: "Hook them.",
  slots: [],
  updatedAt: "2026-09-01T10:00:00.000Z",
};

function refusal(message: string): Answer {
  return () =>
    new Response(
      JSON.stringify({
        title: "Conflict",
        status: 409,
        detail: "That name is taken.",
        fields: [{ field: "name", message }],
      }),
      {
        status: 409,
        headers: { "content-type": "application/problem+json", "X-Slopify-Version": testVersion },
      },
    );
}

it("renames a prompt in its row with the text as it is, and Undo renames it back", async () => {
  const user = userEvent.setup();
  let saved: Prompt = dossier;
  const sent: unknown[] = [];
  renderRouted(
    <ToastProvider>
      <PromptsRoute kind="article" onKind={() => undefined} />
    </ToastProvider>,
    testDeps({
      "GET /api/prompts": (request) => jsonAnswer({ prompts: [saved] })(request),
      "PUT /api/prompts/p1": async (request) => {
        const body = (await request.json()) as { name: string };
        sent.push(body);
        saved = { ...saved, name: body.name };
        return jsonAnswer(saved)(request);
      },
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Rename Documentary dossier" }));
  const field = screen.getByRole("textbox", { name: "New name for Documentary dossier" });
  await user.clear(field);
  await user.type(field, "Field dossier{Enter}");
  await screen.findByRole("button", { name: "Rename Field dossier" });
  expect(sent).toEqual([
    { kind: "article", name: "Field dossier", body: "Compose a dossier on {{topic}}." },
  ]);
  // The name still picks the row for the detail beside the list.
  expect(screen.getByRole("button", { name: "Field dossier" })).toBeTruthy();

  const toast = await screen.findByText("Renamed “Documentary dossier” to “Field dossier”.");
  await user.click(
    within(toast.parentElement as HTMLElement).getByRole("button", { name: "Undo" }),
  );
  await screen.findByRole("button", { name: "Rename Documentary dossier" });
  expect(sent).toHaveLength(2);
});

it("keeps the field open with the server's reason when a name is taken, and Escape keeps the old name", async () => {
  const user = userEvent.setup();
  renderRouted(
    <EntriesRoute category="intro" onCategory={() => undefined} />,
    testDeps({
      "GET /api/entries": jsonAnswer({ entries: [coldOpen] }),
      "PUT /api/entries/e1": refusal("An intro named Warm open already exists. Pick another name."),
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Rename Cold open" }));
  const field = screen.getByRole("textbox", { name: "New name for Cold open" });
  await user.clear(field);
  await user.type(field, "Warm open");
  await user.click(screen.getByRole("button", { name: "Save name" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "The name wasn't saved. An intro named Warm open already exists. Pick another name.",
  );
  await user.clear(field);
  await user.keyboard("{Enter}");
  expect(screen.getByRole("alert").textContent).toBe(
    "Write a name first, or press Cancel to keep the old one.",
  );
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Rename Cold open" })).toBeTruthy();
});
