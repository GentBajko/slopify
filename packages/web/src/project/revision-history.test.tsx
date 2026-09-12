import type { RevisionView } from "@app/slices/revisions/model.js";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { revisionView } from "./revision-fixture.js";
import { RevisionHistory } from "./revision-history.js";

afterEach(cleanup);

async function showHistory(pieces: RevisionView["pieces"]): Promise<HTMLElement> {
  const view = { ...revisionView(), pieces };
  const revision = view.revision;
  renderApp(
    <RevisionHistory projectId="p1" pending={false} onRestore={() => {}} />,
    testDeps({
      "GET /api/projects/p1/revisions": jsonAnswer({
        revisions: [
          {
            id: revision.id,
            parentId: null,
            restoredFromId: null,
            title: revision.config.title,
            createdAt: revision.createdAt,
            current: true,
          },
        ],
      }),
      "GET /api/projects/p1/revisions/r1": jsonAnswer({ view }),
    }),
  );
  fireEvent.click(await screen.findByRole("button", { name: /Saved ·/ }));
  await screen.findByRole("button", { name: "Restore this revision" });
  const parts = screen.getByRole("list", { name: "Retained text parts" });
  for (const summary of parts.querySelectorAll("summary")) fireEvent.click(summary);
  return parts;
}

function textPiece(
  payload: string | null,
  key = "article:text",
  stageKind: RevisionView["pieces"][number]["stageKind"] = "article",
): RevisionView["pieces"][number] {
  return {
    recordId: key.replaceAll(":", "_"),
    publicationId: null,
    selected: true,
    available: true,
    key,
    stageKind,
    assetId: null,
    fingerprint: `fingerprint-${key}`,
    piece: {
      id: key.replaceAll(":", "_"),
      stageId: stageKind,
      kind: key === "research:planner" ? "prompt_written" : "chapter",
      idx: 1,
      state: "done",
      payload,
    },
  };
}

it("shows completed planner and chapter text when research synthesis has no output", async () => {
  // Runtime research publishes these payloads before synthesis can finish or fail.
  const parts = await showHistory([
    textPiece(
      JSON.stringify({
        outline: ["Historical chapter", "Next chapter"],
        requestFingerprint: "private-request-metadata",
      }),
      "research:planner",
      "research",
    ),
    textPiece(
      JSON.stringify({
        title: "Historical chapter",
        notes: "Retained research evidence.\nSources\nhttps://example.test",
        requestFingerprint: "private-request-metadata",
      }),
      "research:chapter:1",
      "research",
    ),
  ]);
  const text = [...parts.querySelectorAll("pre")].map((element) => element.textContent);
  expect(text).toEqual([
    "1. Historical chapter\n2. Next chapter",
    "Historical chapter\n\nRetained research evidence.\nSources\nhttps://example.test",
  ]);
  expect(parts.textContent).not.toContain("private-request-metadata");
  expect(within(parts).queryByText("No text was recorded for this part.")).toBeNull();
});

it.each([
  { logicalText: "Whole narration", text: "One chunk" },
  { text: "Whole narration" },
  { prompt: "Whole narration", sent: "Private provider instructions" },
])("shows retained text from a supported producer payload: %j", async (payload) => {
  const parts = await showHistory([textPiece(JSON.stringify(payload))]);
  expect(parts.querySelector("pre")?.textContent).toBe("Whole narration");
});

it("renders retained markup as text", async () => {
  const prompt = '<img src="missing" onerror="alert(1)">';
  const parts = await showHistory([
    textPiece(JSON.stringify({ prompt, sent: "Instructions" }), "thumbnail:prompt", "thumbnail"),
  ]);
  expect(parts.querySelector("pre")?.textContent).toBe(prompt);
  expect(parts.querySelector("img")).toBeNull();
});

it.each([
  [null, "No text was recorded for this part."],
  [JSON.stringify({ requestFingerprint: "private" }), "No text was recorded for this part."],
  [JSON.stringify({ text: "  ", outline: [] }), "No text was recorded for this part."],
  ["{bad", "Recorded text cannot be decoded."],
  [JSON.stringify({ outline: [42] }), "Recorded text cannot be decoded."],
])("keeps a clear fallback for missing or undecodable text: %s", async (payload, message) => {
  const parts = await showHistory([textPiece(payload)]);
  expect(parts.querySelector("pre")?.textContent).toBe(message);
});
