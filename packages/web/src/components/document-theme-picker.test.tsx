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
  const preview = await screen.findByRole("button", { name: "Preview the Plain theme" });
  await waitFor(() => expect(preview.hasAttribute("disabled")).toBe(false));
  await user.click(preview);
  expect(screen.getByRole("dialog", { name: "Preview: Plain" })).not.toBeNull();
  await waitFor(() => expect(previewed).toEqual({ values: plain }));
});
