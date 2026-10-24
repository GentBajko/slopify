import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { freshDraftDocument } from "@/play/draft-state";
import { TemplatesRoute } from "@/routes/templates";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { InlineName } from "./inline-name";

afterEach(cleanup);

// A name renamed in place, as a list row holds it: `answer` stands in for the server.
function Named({
  start,
  answer,
}: {
  readonly start: string;
  readonly answer: (next: string) => string | null;
}) {
  const [name, setName] = useState(start);
  return (
    <ToastProvider>
      <InlineName
        name={name}
        onRename={async (next) => {
          const refused = answer(next);
          if (refused === null) setName(next);
          return refused;
        }}
      />
    </ToastProvider>
  );
}

it("renames in place on Enter, and Undo on the notice renames it back", async () => {
  const user = userEvent.setup();
  const sent: string[] = [];
  render(
    <Named
      start="Documentary dossier"
      answer={(next) => {
        sent.push(next);
        return null;
      }}
    />,
  );
  await user.click(screen.getByRole("button", { name: "Rename Documentary dossier" }));
  const field = screen.getByRole("textbox", { name: "New name for Documentary dossier" });
  await user.clear(field);
  await user.type(field, "Field dossier{Enter}");
  await screen.findByRole("button", { name: "Rename Field dossier" });
  expect(sent).toEqual(["Field dossier"]);

  const toast = await screen.findByText("Renamed “Documentary dossier” to “Field dossier”.");
  await user.click(
    within(toast.parentElement as HTMLElement).getByRole("button", { name: "Undo" }),
  );
  await screen.findByRole("button", { name: "Rename Documentary dossier" });
  expect(sent).toEqual(["Field dossier", "Documentary dossier"]);
});

it("keeps the field open with the server's reason when a name is taken, and Escape keeps the old name", async () => {
  const user = userEvent.setup();
  render(
    <Named
      start="Cold open"
      answer={() =>
        "The name wasn't saved. An intro named Warm open already exists. Pick another name."
      }
    />,
  );
  await user.click(screen.getByRole("button", { name: "Rename Cold open" }));
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

it("renames a template by saving its setup as it is under the new name", async () => {
  const user = userEvent.setup();
  const templateId = "11111111-1111-4111-8111-111111111111";
  const summary = {
    id: templateId,
    name: "Weekly documentary",
    version: 2,
    createdAt: "2026-09-12T00:00:00Z",
    updatedAt: "2026-09-13T00:00:00Z",
  };
  let name = summary.name;
  const sent: { baseVersion: number; name: string; document: unknown }[] = [];
  renderRouted(
    <TemplatesRoute onApplied={() => undefined} />,
    testDeps({
      "GET /api/design-templates": jsonAnswer({ templates: [] }),
      "GET /api/project-templates": (request) =>
        jsonAnswer({ templates: [{ ...summary, name }] })(request),
      "GET /api/drafts": jsonAnswer({ drafts: [] }),
      [`GET /api/project-templates/${templateId}`]: jsonAnswer({
        template: { ...summary, document: freshDraftDocument },
      }),
      [`PUT /api/project-templates/${templateId}`]: async (request) => {
        const body = (await request.json()) as (typeof sent)[number];
        sent.push(body);
        name = body.name;
        return jsonAnswer({
          template: { ...summary, name, version: 3, document: freshDraftDocument },
        })(request);
      },
    }),
  );
  await user.click(await screen.findByRole("button", { name: "Rename Weekly documentary" }));
  const field = screen.getByRole("textbox", { name: "New name for Weekly documentary" });
  await user.clear(field);
  await user.type(field, "Monthly documentary{Enter}");
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.baseVersion).toBe(2);
  expect(sent[0]?.name).toBe("Monthly documentary");
  expect(sent[0]?.document).toEqual(JSON.parse(JSON.stringify(freshDraftDocument)));
  expect(await screen.findByRole("button", { name: "Rename Monthly documentary" })).toBeTruthy();
});
