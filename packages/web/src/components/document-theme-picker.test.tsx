import { builtInTheme } from "@app/slices/document/theme.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { DocumentThemePicker } from "./document-theme-picker";

afterEach(cleanup);

it("previews the picked theme's sample article in a drawer before a render", async () => {
  const user = userEvent.setup();
  const plain = builtInTheme("plain");
  let previewed: unknown;
  renderApp(
    <DocumentThemePicker
      id="theme"
      value={{ theme: "plain" }}
      disabled={false}
      onChange={vi.fn()}
    />,
    testDeps({
      "GET /api/document-themes": jsonAnswer({
        builtIns: [{ name: "plain", label: "Plain", values: plain }],
        themes: [],
      }),
      "POST /api/document-themes/preview": async (request) => {
        previewed = await request.json();
        return new Response(new Blob(["%PDF"]));
      },
    }),
  );
  const preview = await screen.findByRole("button", { name: "Preview the Plain look" });
  await waitFor(() => expect(preview.hasAttribute("disabled")).toBe(false));
  await user.click(preview);
  expect(screen.getByRole("dialog", { name: "Preview: Plain" })).not.toBeNull();
  await waitFor(() => expect(previewed).toEqual({ values: plain }));
});

// A project saved before the PDF setting existed was drawn as DiceMaster and still is; a Create
// draft or a template with no setting is made in today's default, so it reads Plain.
it("reads a draft with no PDF setting as Plain, and a project with none as its retired look", async () => {
  const deps = () =>
    testDeps({
      "GET /api/document-themes": jsonAnswer({ builtIns: [], themes: [] }),
    });
  const picked = () => screen.getByRole<HTMLSelectElement>("combobox").value;
  renderApp(
    <DocumentThemePicker id="theme" value={undefined} draft disabled={false} onChange={vi.fn()} />,
    deps(),
  );
  expect(picked()).toBe("builtin:plain");
  expect(screen.queryByRole("option", { name: /DiceMaster/ })).toBeNull();
  cleanup();
  renderApp(
    <DocumentThemePicker id="theme" value={undefined} disabled={false} onChange={vi.fn()} />,
    deps(),
  );
  expect(picked()).toBe("builtin:dicemaster");
});
