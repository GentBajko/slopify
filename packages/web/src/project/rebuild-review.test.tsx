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
