import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { NamePronunciationsRoute } from "./name-pronunciations.js";

afterEach(cleanup);

it("edits the list, saves it whole and says what narration makes of it", async () => {
  const user = userEvent.setup();
  const sent: unknown[] = [];
  renderRouted(
    <NamePronunciationsRoute />,
    testDeps({
      "GET /api/pronunciations/library": jsonAnswer({
        text: "Gygax: /ˈɡaɪɡæks/",
        terms: 1,
        version: "v1",
      }),
      "PUT /api/pronunciations/library": async (request) => {
        const body = (await request.json()) as { text: string; version: string };
        sent.push(body);
        return jsonAnswer({ text: body.text, terms: 2, version: "v2" })(request);
      },
    }),
  );
  expect(await screen.findByText("1 name is pronounced from this list.")).toBeTruthy();
  const box = screen.getByLabelText("Name pronunciations");
  expect((box as HTMLTextAreaElement).value).toBe("Gygax: /ˈɡaɪɡæks/");
  await user.type(box, "\nFaerûn: /feɪˈruːn/");
  await user.click(screen.getByRole("button", { name: "Save pronunciations" }));
  expect(await screen.findByText(/^Saved 2 names\./u)).toBeTruthy();
  expect(sent).toEqual([{ text: "Gygax: /ˈɡaɪɡæks/\nFaerûn: /feɪˈruːn/", version: "v1" }]);
});

it("names the lines narration skips and keeps the list on screen when a save fails", async () => {
  const user = userEvent.setup();
  renderRouted(
    <NamePronunciationsRoute />,
    testDeps({
      "GET /api/pronunciations/library": jsonAnswer({
        text: "Gygax: /ˈɡaɪɡæks/\nNew York: /njuː/\nToril: —",
        terms: 1,
        version: "v1",
        unpronounced: 1,
        skipped: [{ row: 2, reason: "supply one IPA word for each written word" }],
      }),
      "PUT /api/pronunciations/library": () =>
        new Response(
          JSON.stringify({
            title: "Bad Request",
            status: 400,
            detail: "Keep the list under 100000 characters.",
          }),
          { status: 400, headers: { "content-type": "application/problem+json" } },
        ),
    }),
  );
  expect(await screen.findByText("1 line is skipped")).toBeTruthy();
  expect(
    screen.getByText("1 name is pronounced from this list, and 1 name is read as written."),
  ).toBeTruthy();
  expect(screen.getByText(/Entry 2: supply one IPA word/u)).toBeTruthy();
  await user.type(screen.getByLabelText("Name pronunciations"), "\nIuz: /ˈaɪʊz/");
  await user.click(screen.getByRole("button", { name: "Save pronunciations" }));
  expect(await screen.findByText(/Not saved: Keep the list under/u)).toBeTruthy();
  expect((screen.getByLabelText("Name pronunciations") as HTMLTextAreaElement).value).toContain(
    "Iuz",
  );
});

it("keeps both lists when another window saved first, and saves again from theirs", async () => {
  const user = userEvent.setup();
  const sent: { text: string; version: string }[] = [];
  renderRouted(
    <NamePronunciationsRoute />,
    testDeps({
      "GET /api/pronunciations/library": jsonAnswer({
        text: "Gygax: /ˈɡaɪɡæks/",
        terms: 1,
        version: "v1",
      }),
      "PUT /api/pronunciations/library": async (request) => {
        const body = (await request.json()) as { text: string; version: string };
        sent.push(body);
        if (body.version === "v1")
          return new Response(
            JSON.stringify({
              title: "Conflict",
              status: 409,
              detail: "The list changed since this save was prepared: it has 2 names now.",
              current: {
                text: "Gygax: /ˈɡaɪɡaks/\nIuz: /aɪˈuːz/",
                terms: 2,
                version: "v2",
                savedBy: "agent",
              },
            }),
            { status: 409, headers: { "content-type": "application/problem+json" } },
          );
        return jsonAnswer({ text: body.text, terms: 2, version: "v3" })(request);
      },
    }),
  );
  const box = await screen.findByDisplayValue("Gygax: /ˈɡaɪɡæks/");
  await user.type(box, "\nThay: /θeɪ/");
  await user.click(screen.getByRole("button", { name: "Save pronunciations" }));

  // What they have, what you have, and nothing thrown away.
  expect(await screen.findByText("The list changed somewhere else")).toBeTruthy();
  expect(
    screen.getByText(
      "An agent saved it: it has 1 name you don't have, 1 name said differently, 1 of yours it doesn't have.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText("Not saved: the list changed somewhere else. Choose which to keep, above."),
  ).toBeTruthy();
  expect((screen.getByLabelText("Name pronunciations") as HTMLTextAreaElement).value).toContain(
    "Thay",
  );
  // Saving again goes out against the version the refusal handed back.
  await user.click(screen.getByRole("button", { name: "Save mine anyway" }));
  expect(await screen.findByText(/^Saved 2 names\./u)).toBeTruthy();
  expect(sent.map((row) => row.version)).toEqual(["v1", "v2"]);
});

it("can take the other window's list instead of its own", async () => {
  const user = userEvent.setup();
  renderRouted(
    <NamePronunciationsRoute />,
    testDeps({
      "GET /api/pronunciations/library": jsonAnswer({
        text: "Gygax: /ˈɡaɪɡæks/",
        terms: 1,
        version: "v1",
      }),
      "PUT /api/pronunciations/library": () =>
        new Response(
          JSON.stringify({
            title: "Conflict",
            status: 409,
            detail: "The list changed since this save was prepared: it has 2 names now.",
            current: {
              text: "Gygax: /ˈɡaɪɡæks/\nIuz: /aɪˈuːz/",
              terms: 2,
              version: "v2",
            },
          }),
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
    }),
  );
  await user.type(await screen.findByDisplayValue("Gygax: /ˈɡaɪɡæks/"), "\nThay: /θeɪ/");
  await user.click(screen.getByRole("button", { name: "Save pronunciations" }));
  await user.click(await screen.findByRole("button", { name: "Load theirs instead" }));
  const box = screen.getByLabelText("Name pronunciations") as HTMLTextAreaElement;
  expect(box.value).toBe("Gygax: /ˈɡaɪɡæks/\nIuz: /aɪˈuːz/");
  expect(screen.queryByText("The list changed somewhere else")).toBeNull();
});
