import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { NamesAheadNotice, NamesNarratedNotice } from "./pronunciation-check.js";

afterEach(cleanup);

const gaps = "GET /api/projects/p1/pronunciations/gaps";
const heard = "GET /api/projects/p1/pronunciations/heard";

it("says in one line which names the voice will have to guess, with every mention a press away", async () => {
  renderRouted(
    <NamesAheadNotice projectId="p1" />,
    testDeps({
      [gaps]: jsonAnswer({
        revisionId: "r1",
        ready: true,
        narrated: false,
        ahead: {
          names: [
            { name: "Belwar", plain: 17, possessive: 5, proper: true },
            { name: "drow", plain: 4, possessive: 0, proper: false },
          ],
          mentions: 26,
          proper: 22,
        },
        notice:
          "1 name in this article has no pronunciation anywhere, so the voice will guess it: Belwar. To decide how they are said, add them to Settings → Voices → Name pronunciations, then make the narration.",
      }),
    }),
  );
  await waitFor(() => expect(screen.getByText(/the voice will guess it: Belwar/)).not.toBeNull());
  // The detail is a press away, and only the proper names are in it.
  expect(screen.getByText("Every mention")).not.toBeNull();
  expect(screen.getByRole("cell", { name: "Belwar" })).not.toBeNull();
  expect(screen.getByRole("cell", { name: "17 as written · 5 as a possessive" })).not.toBeNull();
  expect(screen.queryByRole("cell", { name: "drow" })).toBeNull();
  expect(screen.getByRole("link", { name: "Name pronunciations" }).getAttribute("href")).toContain(
    "/name-pronunciations",
  );
});

it("holds nothing up once the narration is made: the upload section's line is the one that counts", async () => {
  renderRouted(
    <NamesAheadNotice projectId="p1" />,
    testDeps({
      [gaps]: jsonAnswer({
        revisionId: "r1",
        ready: true,
        narrated: true,
        ahead: {
          names: [{ name: "Belwar", plain: 1, possessive: 0, proper: true }],
          mentions: 1,
          proper: 1,
        },
        notice: "1 name in this article has no pronunciation anywhere",
      }),
    }),
  );
  await waitFor(() => expect(screen.queryByText(/no pronunciation anywhere/)).toBeNull());
});

it("says nothing at all when every name is pronounced", async () => {
  renderRouted(
    <NamesAheadNotice projectId="p1" />,
    testDeps({
      [gaps]: jsonAnswer({
        revisionId: "r1",
        ready: true,
        narrated: false,
        ahead: { names: [], mentions: 0, proper: 0 },
        notice: null,
      }),
    }),
  );
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
});

it("says what the voice guessed and what it was heard saying more than one way", async () => {
  renderRouted(
    <NamesNarratedNotice projectId="p1" />,
    testDeps({
      [heard]: jsonAnswer({
        revisionId: "r1",
        narrated: {
          names: [{ name: "Drizzt", plain: 0, possessive: 48, proper: true }],
          mentions: 48,
          proper: 48,
        },
        heard: {
          names: [
            {
              name: "Do'Urden",
              mentions: 26,
              mean: 0.53,
              low: 0.33,
              high: 0.69,
              spread: 0.36,
              uneven: true,
              saidAs: [],
              ipa: [],
              different: false,
            },
            {
              name: "Gygax",
              mentions: 9,
              mean: 0.88,
              low: 0.79,
              high: 0.97,
              spread: 0.18,
              uneven: false,
              saidAs: [],
              ipa: [],
              different: false,
            },
          ],
          uneven: [
            {
              name: "Do'Urden",
              mentions: 26,
              mean: 0.53,
              low: 0.33,
              high: 0.69,
              spread: 0.36,
              uneven: true,
              saidAs: [],
              ipa: [],
              different: false,
            },
          ],
          different: [],
          words: 21548,
          confidence: 0.94,
        },
        notice:
          "Names in this narration: the voice guessed 1 name (Drizzt), and 1 name was heard more than one way (Do'Urden). Open the check to see every mention.",
        listened: true,
      }),
    }),
  );
  await waitFor(() => expect(screen.getByText(/the voice guessed 1 name/)).not.toBeNull());
  expect(screen.getByRole("cell", { name: "Drizzt" })).not.toBeNull();
  expect(screen.getByRole("cell", { name: "48 as a possessive" })).not.toBeNull();
  // The spread is what the table shows, and the name heard the same way is not in it.
  expect(screen.getByRole("cell", { name: "33% to 69%" })).not.toBeNull();
  expect(screen.getByRole("cell", { name: "As written" })).not.toBeNull();
  expect(screen.queryByRole("cell", { name: "Gygax" })).toBeNull();
});

it("says nothing after a render whose names all came out right", async () => {
  renderRouted(
    <NamesNarratedNotice projectId="p1" />,
    testDeps({
      [heard]: jsonAnswer({
        revisionId: "r1",
        narrated: null,
        heard: null,
        listened: false,
        notice: null,
      }),
    }),
  );
  await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
});

it("names what came out as another sound, and offers the one place that settles it", async () => {
  const lolth = {
    name: "Lolth",
    mentions: 28,
    mean: 0.91,
    low: 0.86,
    high: 0.95,
    spread: 0.09,
    uneven: false,
    saidAs: [{ letters: "LOTH", mentions: 25 }],
    ipa: ["lɒlθ"],
    different: true,
  };
  renderRouted(
    <NamesNarratedNotice projectId="p1" />,
    testDeps({
      [heard]: jsonAnswer({
        revisionId: "r1",
        narrated: { names: [], mentions: 0, proper: 0 },
        heard: { names: [lolth], uneven: [], different: [lolth], words: 21548, confidence: 0.94 },
        listened: true,
        notice:
          "Names in this narration: 1 name came out as another sound (Lolth as \u201cloth\u201d). Open the check to see every mention.",
      }),
    }),
  );
  await waitFor(() => expect(screen.getByText(/1 name came out as another sound/)).not.toBeNull());
  expect(screen.getByText("Names that came out as another sound")).not.toBeNull();
  // The letters, and how many of its mentions came out that way.
  expect(screen.getByRole("cell", { name: "\u201cloth\u201d \u00b7 25 of 28" })).not.toBeNull();
  expect(screen.getByRole("link", { name: "Name pronunciations" })).not.toBeNull();
});

it("says plainly when the captions are too old to have been listened to", async () => {
  const row = {
    name: "Do'Urden",
    mentions: 26,
    mean: 0.53,
    low: 0.33,
    high: 0.69,
    spread: 0.36,
    uneven: true,
    saidAs: [],
    ipa: [],
    different: false,
  };
  renderRouted(
    <NamesNarratedNotice projectId="p1" />,
    testDeps({
      [heard]: jsonAnswer({
        revisionId: "r1",
        narrated: null,
        heard: { names: [row], uneven: [row], different: [], words: 21548, confidence: 0.94 },
        listened: false,
        notice:
          "Names in this narration: 1 name was heard more than one way (Do'Urden). Open the check to see every mention.",
      }),
    }),
  );
  await waitFor(() => expect(screen.getByText(/timed before Slopify kept/)).not.toBeNull());
});
