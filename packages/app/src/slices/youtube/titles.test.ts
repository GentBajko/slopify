import { expect, it } from "vitest";
import { checkDescriptionAnswer, descriptionMessages } from "./answer.js";
import { keepsShape, titleShape } from "./titles.js";

const pattern = "{{Topic}} | Stories To Sleep To";
const shape = titleShape(pattern, { Topic: "Lighthouse", "Min. Word Count": "27000" });

it("keeps a pattern only when it has keywords", () => {
  expect(shape?.keywords).toEqual([{ name: "Topic", value: "Lighthouse" }]);
  expect(titleShape("A plain title", {})).toBeUndefined();
  expect(titleShape(undefined, {})).toBeUndefined();
});

it("accepts another title only when the words outside the keyword stay as they are", () => {
  if (shape === undefined) throw new Error("no shape");
  expect(keepsShape(shape, "The Lighthouse, a Keeper's Last Night | Stories To Sleep To")).toBe(
    true,
  );
  expect(keepsShape(shape, "Lighthouse: Queen of Chromatic Dragons")).toBe(false);
  expect(keepsShape(shape, "Lighthouse | Stories for Sleep")).toBe(false);
  expect(keepsShape(shape, " | Stories To Sleep To")).toBe(false);
});

it("asks for the keyword's part only, and turns back titles that change the rest", () => {
  const system = String(
    descriptionMessages({
      instruction: "",
      title: "Lighthouse | Stories To Sleep To",
      shape,
      durationSeconds: 120,
      transcript: "",
    })[0]?.content,
  );
  expect(system).toContain(`title pattern "${pattern}", where {{Topic}} is "Lighthouse"`);
  const answer = (titles: readonly string[]) =>
    JSON.stringify({
      summary: "A story.",
      chapters: [
        { start: "0:00", title: "One" },
        { start: "0:30", title: "Two" },
        { start: "1:00", title: "Three" },
      ],
      hashtags: ["#DnD"],
      tags: ["dnd lore"],
      pinnedComment: "Which dragon next?",
      titles,
    });
  const kept = checkDescriptionAnswer(
    answer([
      "The Lighthouse, a Keeper's Last Night | Stories To Sleep To",
      "The Keeper Who Never Slept | Stories To Sleep To",
    ]),
    120,
    "Lighthouse | Stories To Sleep To",
    shape,
  );
  expect(kept.ok).toBe(true);
  const changed = checkDescriptionAnswer(
    answer(["Lighthouse: The Dragon Queen Explained", "The Keeper Who Never Slept"]),
    120,
    "Lighthouse | Stories To Sleep To",
    shape,
  );
  expect(changed.ok).toBe(false);
  expect(changed.ok ? "" : changed.reason).toContain("outside its keywords");
});
