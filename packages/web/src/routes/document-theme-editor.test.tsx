import type { SavedDocumentTheme } from "@app/slices/document/model.js";
import { builtInTheme } from "@app/slices/document/theme.js";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { DocumentThemeEditorRoute } from "./document-theme-editor";

afterEach(cleanup);

const plain = builtInTheme("plain");
const mine: SavedDocumentTheme = {
  id: "d1",
  name: "Night reading",
  values: { ...plain, background: { image: null, color: "#ffffff" } },
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function deps() {
  return testDeps({
    "GET /api/document-themes": jsonAnswer({
      builtIns: [{ name: "plain", label: "Plain", values: plain }],
      themes: [mine],
    }),
    "POST /api/document-themes/preview": () => Promise.resolve(new Response(new Blob(["%PDF"]))),
  });
}

describe("document theme editor", () => {
  it("keeps a partial colour, flags its group, and names the group in the blocked Save", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DocumentThemeEditorRoute themeId="d1" from={undefined} onLeave={vi.fn()} />,
      deps(),
    );
    await screen.findByDisplayValue("Night reading");
    const text = screen.getByLabelText("Body text");
    await user.clear(text);
    await user.type(text, "#12");
    expect((text as HTMLInputElement).value).toBe("#12");
    const jumps = screen.getByRole("navigation", { name: "Theme groups" });
    expect(
      within(jumps).getByRole("button", { name: /^Colours · 1 to fix · 1 changed$/ }),
    ).not.toBeNull();
    expect(screen.getAllByText(/in Colours\./).length).toBeGreaterThan(0);
  });

  it("warns about hard-to-read text and resets a changed setting", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DocumentThemeEditorRoute themeId="d1" from={undefined} onLeave={vi.fn()} />,
      deps(),
    );
    await screen.findByDisplayValue("Night reading");
    const text = screen.getByLabelText("Body text");
    const before = (text as HTMLInputElement).value;
    await user.clear(text);
    await user.type(text, "#eeeeee");
    expect(screen.getByText(/Hard to read on the page colour/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: `Reset Body text to ${before}` }));
    expect((text as HTMLInputElement).value).toBe(before);
    expect(screen.queryByText(/Hard to read on the page colour/)).toBeNull();
  });
});
