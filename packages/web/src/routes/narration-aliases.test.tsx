import { Link } from "@tanstack/react-router";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { mergeAliases, parseAliasLines } from "./narration-alias-paste.js";
import { NarrationAliasesRoute } from "./narration-aliases.js";

afterEach(cleanup);

const doctor = { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false };

it("edits, adds and removes aliases and saves the whole list", async () => {
  const user = userEvent.setup();
  const sent: unknown[] = [];
  renderRouted(
    <NarrationAliasesRoute />,
    testDeps({
      "GET /api/pronunciations/aliases": jsonAnswer({
        aliases: [doctor, { ...doctor, written: "Ms.", spoken: "Miss" }],
      }),
      "PUT /api/pronunciations/aliases": async (request) => {
        const body = (await request.json()) as { aliases: unknown[] };
        sent.push(body);
        return jsonAnswer(body)(request);
      },
    }),
  );
  const list = await screen.findByRole("list", { name: "Narration aliases" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  await user.click(screen.getByRole("button", { name: "Remove alias 2" }));
  await user.click(screen.getByRole("button", { name: "Add alias" }));
  const written = within(list).getAllByLabelText("Written");
  const spoken = within(list).getAllByLabelText("Say it as");
  await user.type(written[1] as HTMLElement, "St.");
  await user.type(spoken[1] as HTMLElement, "Saint");
  await user.click(within(list).getAllByRole("checkbox", { name: "Match case" })[1] as HTMLElement);
  await user.click(screen.getByRole("button", { name: "Save aliases" }));
  expect(await screen.findByText(/^Saved\./u)).toBeTruthy();
  expect(sent).toEqual([
    {
      aliases: [doctor, { written: "St.", spoken: "Saint", wholeWord: true, caseSensitive: true }],
    },
  ]);
});

it("marks the rows the server refuses, in its own words", async () => {
  const user = userEvent.setup();
  renderRouted(
    <NarrationAliasesRoute />,
    testDeps({
      "GET /api/pronunciations/aliases": jsonAnswer({ aliases: [] }),
      "PUT /api/pronunciations/aliases": () =>
        new Response(
          JSON.stringify({
            title: "Bad Request",
            status: 400,
            detail: "These aliases can't be saved yet.",
            fields: [
              {
                field: "aliases.0",
                message: "Alias 1: write how the narrator should say it.",
              },
            ],
          }),
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
    }),
  );
  expect(await screen.findByText(/No aliases yet/u)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Add alias" }));
  await user.type(screen.getByLabelText("Written"), "Dr.");
  await user.click(screen.getByRole("button", { name: "Save aliases" }));
  const written = screen.getByLabelText("Written");
  expect(written.getAttribute("aria-invalid")).toBe("true");
  const error = document.getElementById(written.getAttribute("aria-describedby") ?? "");
  expect(error?.textContent).toBe("Alias 1: write how the narrator should say it.");
});

const listed = (aliases: readonly unknown[]) =>
  testDeps({
    "GET /api/pronunciations/aliases": jsonAnswer({ aliases }),
    "PUT /api/pronunciations/aliases": async (request) => jsonAnswer(await request.json())(request),
  });

it("reads pasted lines as written = spoken, tabs too, and names the lines it skips", () => {
  expect(parseAliasLines("Dr. = Doctor\n\nSt.\tSaint\nno separator\n = empty")).toEqual({
    aliases: [
      { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
      { written: "St.", spoken: "Saint", wholeWord: true, caseSensitive: false },
    ],
    skipped: [4, 5],
  });
  const merged = mergeAliases(
    [{ ...doctor, key: 1 }],
    [
      { ...doctor, spoken: "Doc" },
      { ...doctor, written: "Mt.", spoken: "Mount" },
    ],
    (alias) => ({ ...alias, key: 2 }),
  );
  expect(merged.added).toBe(1);
  expect(merged.updated).toBe(1);
  expect(merged.rows.map((row) => row.spoken)).toEqual(["Doc", "Mount"]);
});

it("pastes many aliases at once and searches the list", async () => {
  const user = userEvent.setup();
  renderRouted(<NarrationAliasesRoute />, listed([doctor]));
  const list = await screen.findByRole("list", { name: "Narration aliases" });
  await user.click(screen.getByRole("button", { name: "Paste many" }));
  await user.type(screen.getByLabelText("Aliases, one per line"), "St. = Saint{Enter}Mt. = Mount");
  await user.click(screen.getByRole("button", { name: "Add 2 aliases" }));
  expect(within(list).getAllByRole("listitem")).toHaveLength(3);
  expect(screen.getByText(/Unsaved changes|Added 2 and updated 0/u)).toBeTruthy();
  await user.type(screen.getByRole("searchbox", { name: "Search aliases" }), "saint");
  expect(within(list).getAllByRole("listitem")).toHaveLength(1);
  // The row keeps its number in the whole list.
  expect(within(list).getByText("Alias 2")).toBeTruthy();
});

it("puts the cursor in a new alias and brings a removed one back with Undo", async () => {
  const user = userEvent.setup();
  renderRouted(
    <NarrationAliasesRoute />,
    listed([doctor, { ...doctor, written: "Ms.", spoken: "Miss" }]),
  );
  const list = await screen.findByRole("list", { name: "Narration aliases" });
  await user.click(screen.getByRole("button", { name: "Add alias" }));
  const written = within(list).getAllByLabelText("Written");
  expect(document.activeElement).toBe(written[2]);
  await user.click(screen.getByRole("button", { name: "Remove alias 1" }));
  expect(await screen.findByText(/Removed the alias for “Dr\.”/u)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Undo" }));
  const values = within(list)
    .getAllByLabelText("Written")
    .map((field) => (field as HTMLInputElement).value);
  expect(values).toEqual(["Dr.", "Ms.", ""]);
});

it("asks before leaving with unsaved changes", async () => {
  const user = userEvent.setup();
  renderRouted(
    <>
      <NarrationAliasesRoute />
      <Link to="/projects">Go to projects</Link>
    </>,
    listed([doctor]),
  );
  await screen.findByRole("list", { name: "Narration aliases" });
  expect(screen.queryByText(/Unsaved changes/u)).toBeNull();
  await user.type(screen.getByLabelText("Say it as"), "!");
  expect(screen.getByText(/Unsaved changes/u)).toBeTruthy();
  await user.click(screen.getByRole("link", { name: "Go to projects" }));
  expect(await screen.findByRole("dialog", { name: "Leave without saving?" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Stay here" }));
  expect(screen.getByRole("list", { name: "Narration aliases" })).toBeTruthy();
});
