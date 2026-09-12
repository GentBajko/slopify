import type { RebuildPreview } from "@app/slices/rebuild/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { RebuildReview } from "./rebuild-review.js";

afterEach(cleanup);
const preview: RebuildPreview = {
  id: "pv1",
  projectId: "p1",
  baseRevisionId: "r1",
  planFingerprint: "f1",
  selection: { kind: "allAffected" },
  changedInputs: [],
  retained: [],
  warnings: [],
  wholeRequestNotice: "Whole narration is one request.",
  providedReuseRequired: ["audio:provided"],
  work: [
    {
      key: "audio:provided",
      stage: "audio",
      kind: "provided",
      disposition: "review",
      requestFingerprint: "q",
      fingerprint: "f",
      dependsOn: [],
      reason: "Transcript changed",
      inflight: false,
      pieceIds: [],
    },
  ],
  costs: {
    currency: "USD",
    rows: [],
    low: 0,
    high: 0,
    unknown: 1,
    expectedWords: 20,
    catalogueDate: null,
    assumptions: [],
  },
};
it("requires all confirmations and starts only on explicit approval", async () => {
  const user = userEvent.setup();
  const start = vi.fn();
  render(<RebuildReview preview={preview} pending={false} onStart={start} onCancel={() => {}} />);
  const button = screen.getByRole("button", { name: "Start rebuild" });
  expect(button.hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /Keep the provided/ }));
  expect(button.hasAttribute("disabled")).toBe(true);
  await user.click(screen.getByRole("checkbox", { name: /I understand/ }));
  expect(start).not.toHaveBeenCalled();
  await user.click(button);
  expect(start).toHaveBeenCalledWith({
    acknowledgeUnknownCosts: true,
    confirmedProvidedWorkKeys: ["audio:provided"],
  });
});
it("blocks unavailable work and locks consent while starting", () => {
  const blocked = {
    ...preview,
    work: preview.work.map((work) => ({ ...work, disposition: "blocked" as const })),
  };
  render(<RebuildReview preview={blocked} pending onStart={() => {}} onCancel={() => {}} />);
  expect(screen.getByRole("button", { name: "Start rebuild" }).hasAttribute("disabled")).toBe(true);
  for (const input of screen.getAllByRole("checkbox"))
    expect(input.hasAttribute("disabled")).toBe(true);
});
it("describes affected outputs without exposing fingerprint or asset identifiers", () => {
  const hash = "ab".repeat(32);
  render(
    <RebuildReview
      preview={{
        ...preview,
        changedInputs: [{ path: "export:wav", before: null, after: hash }],
        retained: [
          { slot: "image:private-asset-key", outputId: "o1", assetId: "a1", state: "ready" },
        ],
        work: [
          ...preview.work,
          {
            ...preview.work[0],
            key: "export:wav",
            stage: "video",
            kind: "local",
            disposition: "local",
            requestFingerprint: hash,
            fingerprint: hash,
            dependsOn: [],
            reason: "A new export is needed.",
            inflight: false,
            pieceIds: [],
          },
        ],
        costs: {
          ...preview.costs,
          rows: [{ stage: "export:wav", low: 0, high: 0, detail: "Local export." }],
        },
      }}
      pending={false}
      onStart={() => undefined}
      onCancel={() => undefined}
    />,
  );
  const review = screen.getByRole("region", { name: "Review affected rebuild" });
  expect(review.textContent).toContain("Audio export (WAV): New output");
  expect(review.textContent).toContain("Retained outputs: Image");
  expect(review.textContent).not.toContain(hash);
  expect(review.textContent).not.toContain("export:wav");
  expect(review.textContent).not.toContain("private-asset-key");
  expect(
    screen.getByRole("checkbox", { name: "Keep the provided content for Provided narration" }),
  ).toBeTruthy();
});
it("shows actual changed inputs and stable request identity with its text", async () => {
  const user = userEvent.setup();
  const key = "audio:body:opaque:1";
  render(
    <RebuildReview
      preview={{
        ...preview,
        changedInputs: [{ path: key, before: "old-hash", after: "new-hash" }],
        work: preview.work.map((row) => ({ ...row, key })),
        review: {
          inputChanges: [{ label: "Narration voice", before: "Old voice", after: "New voice" }],
          requests: [
            {
              key,
              label: "Body narration chunk 5 · request 1",
              text: "The fifth paragraph.",
              settings: "inworld · inworld-tts-2 · New voice",
            },
          ],
        },
      }}
      pending={false}
      onStart={() => undefined}
      onCancel={() => undefined}
    />,
  );
  expect(screen.getByText("Narration voice")).toBeTruthy();
  expect(screen.getByText("Old voice")).toBeTruthy();
  expect(screen.getByText("New voice")).toBeTruthy();
  expect(screen.getByText(/Body narration chunk 5 · request 1: Review required/)).toBeTruthy();
  await user.click(screen.getByText("View request text"));
  expect(screen.getByText("The fifth paragraph.")).toBeTruthy();
});
