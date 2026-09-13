import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { freshDraftDocument } from "@/play/draft-state";
import { renderApp, testDeps } from "@/test-app";
import { SaveProjectTemplate } from "./save-template";

afterEach(cleanup);
const projectId = "11111111-1111-4111-8111-111111111111";
const revisionId = "22222222-2222-4222-8222-222222222222";

it("saves a named current revision without invoking project work", async () => {
  const user = userEvent.setup();
  const save = vi.fn(async (request: Request) => {
    const input: unknown = await request.json();
    expect(input).toEqual({ id: expect.any(String), name: "Reusable film", revisionId });
    return Response.json({
      id: projectId,
      name: "Reusable film",
      version: 1,
      updatedAt: "now",
      document: freshDraftDocument,
    });
  });
  renderApp(
    <SaveProjectTemplate projectId={projectId} revisionId={revisionId} title="Film" />,
    testDeps({ [`POST /api/project-templates/from-project/${projectId}`]: save }),
  );
  const button = screen.getByRole("button", { name: "Save as template" });
  button.focus();
  await user.keyboard("{Enter}");
  const dialog = await screen.findByRole("dialog");
  const input = within(dialog).getByLabelText("Template name");
  await user.clear(input);
  await user.type(input, "Reusable film");
  await user.click(within(dialog).getByRole("button", { name: "Save template" }));
  await screen.findByText("Template saved.");
  expect(save).toHaveBeenCalledOnce();
});

it("keeps the named revision and request identity when a response is lost", async () => {
  const user = userEvent.setup();
  const bodies: unknown[] = [];
  renderApp(
    <SaveProjectTemplate projectId={projectId} revisionId={revisionId} title="Film" />,
    testDeps({
      [`POST /api/project-templates/from-project/${projectId}`]: async (request) => {
        bodies.push(await request.json());
        if (bodies.length === 1) throw new Error("Connection lost");
        return Response.json(
          { title: "Conflict", detail: "Reload the project revision.", reason: "conflict" },
          { status: 409 },
        );
      },
    }),
  );
  await user.click(screen.getByRole("button", { name: "Save as template" }));
  await user.click(screen.getByRole("button", { name: "Save template" }));
  await screen.findByRole("alert");
  await user.click(screen.getByRole("button", { name: "Save template" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Reload the project revision.",
  );
  expect(bodies[0]).toEqual(bodies[1]);
});
