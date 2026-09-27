import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { NarrationAliasesRoute } from "./narration-aliases.js";

afterEach(cleanup);

const doctor = { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false };

it("edits, adds and removes aliases and saves the whole list", async () => {
  const user = userEvent.setup();
  const sent: unknown[] = [];
  renderApp(
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
  renderApp(
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
