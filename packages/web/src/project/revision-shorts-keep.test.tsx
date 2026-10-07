import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { ShortPick } from "@app/slices/shorts/pick.js";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { KeepShorts } from "./revision-shorts-keep.js";

afterEach(cleanup);

const sentences = Array.from({ length: 20 }, (_value, at) => ({
  start: at * 10,
  end: at * 10 + 9.5,
  text: `Sentence ${String(at + 1)}.`,
}));
const clip = (number: number): ShortPick => ({
  number,
  first: number * 3,
  last: number * 3 + 1,
  start: number * 30,
  end: number * 30 + 45,
  title: `Title ${String(number)}`,
  description: "Line.",
  hashtags: ["#Lore"],
  why: "Stands alone.",
  text: "",
  seed: `seed-${String(number)}`,
});
const clips = [1, 2, 3, 4, 5].map(clip);
// Shorts 1, 4 and 5 are rendered.
const view = {
  revision: { content: {} },
  outputs: [1, 4, 5].map((number) => ({
    workKey: `shorts:${String(number)}:render`,
    selected: true,
    state: "ready",
    output: { meta: { short: number, sentences: [number * 3, number * 3 + 1] } },
  })),
} as unknown as RevisionView;
const edit = { config: {}, content: {} } as unknown as RevisionEdit;

function show(count: number, value: RevisionEdit = edit) {
  const onChange = vi.fn();
  render(
    <KeepShorts
      edit={value}
      view={view}
      picked={{ shorts: clips, sentences, durationSeconds: 200 }}
      clips={clips}
      count={count}
      problem={undefined}
      onChange={onChange}
    />,
  );
  return onChange;
}

it("lists only the finished shorts, ticking the first ones up to the count", () => {
  // A render left from an earlier pick under the same number is not this short.
  show(2);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes.map((box) => box.closest("li")?.textContent)).toEqual([
    "Short 1 Title 1 45 s",
    "Short 4 Title 4 45 s",
    "Short 5 Title 5 45 s",
  ]);
  expect(boxes.map((box) => (box as HTMLInputElement).checked)).toEqual([true, true, false]);
  expect(screen.getByText(/no new moments are picked/)).toBeTruthy();
});

it("keeps the ticked shorts, in order, by their sentences", async () => {
  const onChange = show(3);
  await userEvent.click(screen.getByRole("checkbox", { name: /Short 4/ }));
  const next = onChange.mock.lastCall?.[0] as RevisionEdit;
  expect(next.content.shortsKeep?.map((one) => [one.from, one.opening, one.title])).toEqual([
    [1, "Sentence 3.", "Title 1"],
    [5, "Sentence 15.", "Title 5"],
  ]);
});

it("says how many to tick when more are ticked than the count", () => {
  show(1, {
    ...edit,
    content: {
      shortsKeep: [1, 4].map((from) => ({
        from,
        opening: "a",
        closing: "b",
        sentences: 2,
        title: "t",
        description: "d",
        hashtags: [],
        why: "w",
      })),
    },
  } as unknown as RevisionEdit);
  expect(screen.getByRole("alert").textContent).toBe(
    "Tick at most 1 short, the number of shorts set above.",
  );
});
