import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { LineFix, type Passage } from "./narration-fix.js";
import { passageAgain } from "./review-narration.js";
import { revisionView } from "./revision-fixture.js";

afterEach(cleanup);

const passage: Passage = {
  key: "body:2",
  text: "Ptolemy ordered every ship searched. The books were copied.",
  calls: 1,
  whole: false,
  prepared: false,
};

it("shows the passage's words with the pressed line selected, and names what the button makes", async () => {
  const user = userEvent.setup();
  const make = vi.fn();
  render(
    <LineFix passage={passage} line="The books were copied." onMake={make} onClose={vi.fn()} />,
  );
  const box = screen.getByRole("textbox", { name: "The words of this passage" });
  if (!(box instanceof HTMLTextAreaElement)) throw new Error("Expected a text box.");
  expect(box.value.slice(box.selectionStart, box.selectionEnd)).toBe("The books were copied.");
  // Unchanged: the passage read again as it is, its paid call on the button.
  expect(
    screen.getByRole("button", { name: "Make this passage again · 1 voice call" }),
  ).toBeTruthy();
  expect(screen.getByText(/price isn't known in advance/)).toBeTruthy();
  await user.clear(box);
  await user.type(box, "Ptolemy had every ship searched.");
  await user.click(
    screen.getByRole("button", { name: "Make this passage again with your words · 1 voice call" }),
  );
  expect(make).toHaveBeenCalledWith("Ptolemy had every ship searched.");
});

it("names the AI call that prepares corrected words under a narration prompt", async () => {
  const user = userEvent.setup();
  render(
    <LineFix
      passage={{ ...passage, prepared: true }}
      line="The books were copied."
      onMake={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  // The same words read again reuse what the AI prepared: voice calls only.
  expect(
    screen.getByRole("button", { name: "Make this passage again · 1 voice call" }),
  ).toBeTruthy();
  await user.type(screen.getByRole("textbox", { name: "The words of this passage" }), " Indeed.");
  expect(
    screen.getByRole("button", {
      name: "Make this passage again with your words · 1 AI call and voice calls",
    }),
  ).toBeTruthy();
  expect(screen.getByText(/the AI prepare your words for the voice first/)).toBeTruthy();
});

it("saves corrected words as the passage's text, or the same words to be read again", () => {
  const view = revisionView();
  const edit: RevisionEdit = {
    config: view.revision.config,
    content: {
      ...view.revision.content,
      narrationOverrides: { "body:2": { kind: "asset", assetId: "a1" } },
    },
    uploads: [{ stagedFileId: "f1", destination: { kind: "narration", key: "body:2" } }],
  };
  const corrected = passageAgain(passage, "New words.")(edit);
  expect(corrected.content.narrationOverrides["body:2"]).toEqual({
    kind: "text",
    text: "New words.",
  });
  expect(corrected.uploads).toEqual([]);
  expect(corrected.regenerate).toBeUndefined();
  // The same words: read again, and the file of the person's own that stood in for them goes.
  const again = passageAgain(passage, ` ${passage.text} `)(edit);
  expect(again.regenerate).toEqual(["body:2"]);
  expect(again.content.narrationOverrides["body:2"]).toBeUndefined();
  expect(again.uploads).toEqual([]);
});
