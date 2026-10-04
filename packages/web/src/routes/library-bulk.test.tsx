import type { SavedDocumentTheme } from "@app/slices/document/model.js";
import { builtInTheme } from "@app/slices/document/theme.js";
import type { Prompt } from "@app/slices/library/model.js";
import { libraryFile } from "@app/slices/library/transfer.js";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import type { Answer } from "@/test-app";
import { emptyAnswer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { DocumentThemesRoute } from "./document-themes.js";
import { NarrationAliasesRoute } from "./narration-aliases.js";
import { PromptsRoute } from "./prompts.js";
import { TemplatesRoute } from "./templates.js";

// Library tabs: ticked rows, the selection bar's Duplicate / Export / Delete selected, and
// Import or export (docs/ux-audit-2026-10.md, Lists and collections).

const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const withToasts = (ui: ReactNode) => <ToastProvider>{ui}</ToastProvider>;

const prompt = (id: string, name: string): Prompt => ({
  id,
  kind: "article",
  name,
  body: `About {{topic}} by ${name}.`,
  slots: ["topic"],
  updatedAt: "2026-09-01T10:00:00.000Z",
});
const dossier = prompt("p1", "Dossier");
const essay = prompt("p2", "Essay");

function recorder() {
  const calls: string[] = [];
  const bodies: unknown[] = [];
  const record =
    (answer: Answer): Answer =>
    async (request) => {
      calls.push(`${request.method} ${new URL(request.url).pathname}`);
      if (request.method !== "DELETE" && request.method !== "GET")
        bodies.push(await request.clone().json());
      return answer(request);
    };
  return { calls, bodies, record };
}

function promptDeps(extra: Readonly<Record<string, Answer>> = {}) {
  return testDeps({ "GET /api/prompts": jsonAnswer({ prompts: [dossier, essay] }), ...extra });
}

const box = (name: string) => screen.findByRole("checkbox", { name: `Select row: ${name}` });

describe("selecting prompts", () => {
  it("keeps the bar away until a row is ticked, and Esc clears the selection", async () => {
    const user = userEvent.setup();
    renderRouted(withToasts(<PromptsRoute kind="article" onKind={() => {}} />), promptDeps());
    await user.click(await box("Dossier"));
    expect(screen.queryByText("1 of 2 prompts selected")).not.toBeNull();
    const all = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    await user.click(all);
    expect(screen.queryByText("2 of 2 prompts selected")).not.toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: /Delete selected/u })).toBeNull();
  });

  it("moves the selected prompts to the trash, and Undo restores them", async () => {
    const user = userEvent.setup();
    const seen = recorder();
    renderRouted(
      withToasts(<PromptsRoute kind="article" onKind={() => {}} />),
      promptDeps({
        "DELETE /api/prompts/p1": seen.record(emptyAnswer()),
        "DELETE /api/prompts/p2": seen.record(emptyAnswer()),
        "POST /api/trash/bulk/restore": seen.record(jsonAnswer({ restored: [], failed: [] })),
      }),
    );
    await user.click(await box("Dossier"));
    await user.click(await box("Essay"));
    await user.click(screen.getByRole("button", { name: /Delete selected/u }));
    expect(await screen.findByText("Moved 2 prompts to the trash.")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(seen.calls).toContain("POST /api/trash/bulk/restore"));
    expect(seen.bodies).toEqual([
      {
        items: [
          { kind: "prompt", id: "p1" },
          { kind: "prompt", id: "p2" },
        ],
      },
    ]);
  });

  it("duplicates the selected prompts under free names", async () => {
    const user = userEvent.setup();
    const seen = recorder();
    renderRouted(
      withToasts(<PromptsRoute kind="article" onKind={() => {}} />),
      promptDeps({ "POST /api/prompts": seen.record(jsonAnswer(dossier, 201)) }),
    );
    await user.click(await box("Dossier"));
    await user.click(screen.getByRole("button", { name: /Duplicate selected/u }));
    expect(await screen.findByText("Duplicated as “Dossier copy”.")).not.toBeNull();
    expect(seen.bodies).toEqual([{ kind: "article", name: "Dossier copy", body: dossier.body }]);
  });

  it("exports the selected prompts as a library file", async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:x";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    renderRouted(withToasts(<PromptsRoute kind="article" onKind={() => {}} />), promptDeps());
    await user.click(await box("Essay"));
    await user.click(screen.getByRole("button", { name: /Export selected/u }));
    const file = JSON.parse(await (blobs[0] as Blob).text()) as { prompts: unknown[] };
    expect(file.prompts).toEqual([{ kind: "article", name: "Essay", body: essay.body }]);
  });
});

describe("importing prompts", () => {
  it("renames a clash, skips what doesn't fit and says so", async () => {
    const seen = recorder();
    renderRouted(
      withToasts(<PromptsRoute kind="article" onKind={() => {}} />),
      promptDeps({ "POST /api/prompts": seen.record(jsonAnswer(dossier, 201)) }),
    );
    await box("Dossier");
    const text = JSON.stringify({
      ...libraryFile(
        { prompts: [{ kind: "article", name: "Dossier", body: "Fresh {{topic}}." }] },
        new Date(),
      ),
      prompts: [
        { kind: "article", name: "Dossier", body: "Fresh {{topic}}." },
        { kind: "poem", name: "Odd", body: "x" },
      ],
    });
    const input = screen.getByLabelText("Import prompts from a file");
    fireEvent.change(input, {
      target: { files: [new File([text], "mine.json", { type: "application/json" })] },
    });
    expect(
      await screen.findByText(/^Imported 1 prompt from mine\.json\. 1 was renamed “\(imported\)”/u),
    ).not.toBeNull();
    expect(screen.getByText(/Skipped 1: “Odd”: its kind isn't one of/u)).not.toBeNull();
    expect(seen.bodies).toEqual([
      { kind: "article", name: "Dossier (imported)", body: "Fresh {{topic}}." },
    ]);
  });

  it("refuses a file that isn't a library file, saying what to pick", async () => {
    renderRouted(withToasts(<PromptsRoute kind="article" onKind={() => {}} />), promptDeps());
    await box("Dossier");
    fireEvent.change(screen.getByLabelText("Import prompts from a file"), {
      target: { files: [new File(['{"a":1}'], "other.json")] },
    });
    expect(
      await screen.findByText(/^other\.json wasn't imported: it isn't a Slopify library file/u),
    ).not.toBeNull();
  });
});

const plain = builtInTheme("plain");
const theme = (id: string, name: string): SavedDocumentTheme => ({
  id,
  name,
  values: plain,
  updatedAt: "2026-09-01T10:00:00.000Z",
});

describe("PDF themes", () => {
  it("asks before deleting the selected themes, in permanent words", async () => {
    const user = userEvent.setup();
    const seen = recorder();
    renderRouted(
      withToasts(<DocumentThemesRoute />),
      testDeps({
        "GET /api/document-themes": jsonAnswer({
          builtIns: [{ name: "plain", label: "Plain", values: plain }],
          themes: [theme("d1", "Night"), theme("d2", "Day")],
        }),
        "DELETE /api/document-themes/d1": seen.record(emptyAnswer()),
      }),
    );
    expect(screen.queryByRole("checkbox", { name: "Select row: Plain" })).toBeNull();
    await user.click(await box("Night"));
    await user.click(screen.getByRole("button", { name: /Delete selected/u }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/deleted permanently/u)).not.toBeNull();
    await user.click(within(dialog).getByRole("button", { name: "Delete 1 theme permanently" }));
    expect(await screen.findByText("Deleted 1 PDF theme permanently.")).not.toBeNull();
    expect(seen.calls).toEqual(["DELETE /api/document-themes/d1"]);
  });
});

const alias = (written: string, spoken: string) => ({
  written,
  spoken,
  wholeWord: true,
  caseSensitive: false,
});

describe("narration aliases", () => {
  function aliasDeps() {
    return testDeps({
      "GET /api/pronunciations/aliases": jsonAnswer({
        aliases: [alias("Dr.", "Doctor"), alias("Mt.", "Mount"), alias("St.", "Saint")],
      }),
    });
  }
  const rows = async () =>
    within(await screen.findByRole("list", { name: "Narration aliases" })).getAllByRole("listitem");

  it("removes the selected aliases, and Undo puts them back in place", async () => {
    const user = userEvent.setup();
    renderRouted(withToasts(<NarrationAliasesRoute />), aliasDeps());
    expect(await rows()).toHaveLength(3);
    await user.click(await box("Alias 1 (Dr.)"));
    await user.click(await box("Alias 3 (St.)"));
    await user.click(screen.getByRole("button", { name: /Remove selected/u }));
    expect(await rows()).toHaveLength(1);
    expect(
      screen.getByText("Removed 2 aliases. Press Save aliases to keep the change."),
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    const back = await rows();
    expect(
      back.map((row) => within(row).getAllByRole("textbox")[0]?.getAttribute("value")),
    ).toEqual(["Dr.", "Mt.", "St."]);
  });

  it("imports a two-column CSV into the list on screen", async () => {
    renderRouted(withToasts(<NarrationAliasesRoute />), aliasDeps());
    await rows();
    fireEvent.change(screen.getByLabelText("Import aliases from a file"), {
      target: {
        files: [new File(["Written,Say it as\nMr.,Mister\nDr.,Medic\nlonely\n"], "more.csv")],
      },
    });
    expect(
      await screen.findByText(
        /^Added 1 alias and updated 1 from more\.csv\. Press Save aliases to keep them\. Skipped 1: “Line 4”/u,
      ),
    ).not.toBeNull();
    expect(await rows()).toHaveLength(4);
  });
});

describe("templates", () => {
  it("moves the selected templates to the trash, and Undo restores them", async () => {
    const user = userEvent.setup();
    const seen = recorder();
    const id = "11111111-1111-4111-8111-111111111111";
    renderRouted(
      withToasts(<TemplatesRoute onApplied={() => {}} />),
      testDeps({
        "GET /api/project-templates": jsonAnswer({
          templates: [
            {
              id,
              name: "Weekly",
              version: 2,
              createdAt: "2026-09-12T00:00:00Z",
              updatedAt: "2026-09-13T00:00:00Z",
            },
          ],
        }),
        "GET /api/channels": jsonAnswer({ channels: [] }),
        [`DELETE /api/project-templates/${id}`]: seen.record(emptyAnswer()),
        "POST /api/trash/bulk/restore": seen.record(jsonAnswer({ restored: [], failed: [] })),
      }),
    );
    await user.click(await box("Weekly"));
    await user.click(screen.getByRole("button", { name: /Delete selected/u }));
    expect(await screen.findByText("Moved 1 template to the trash.")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(seen.calls).toContain("POST /api/trash/bulk/restore"));
    expect(seen.calls[0]).toBe(`DELETE /api/project-templates/${id}`);
    expect(seen.bodies).toEqual([{ items: [{ kind: "template", id }] }]);
  });
});
