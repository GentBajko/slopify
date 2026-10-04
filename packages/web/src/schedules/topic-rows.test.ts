import { expect, it } from "vitest";
import { insertedAt, moved, newKeys, reconcileKeys, topicLines } from "./topic-rows";

it("turns pasted text into one topic per line, without bullets or blank lines", () => {
  expect(topicLines("- Cleopatra\r\n\n  • Hypatia \n* Nefertiti\nSphinx-like")).toEqual([
    "Cleopatra",
    "Hypatia",
    "Nefertiti",
    "Sphinx-like",
  ]);
});

it("moves and inserts by position", () => {
  expect(moved(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  expect(moved(["a", "b", "c", "d"], 0, 99)).toEqual(["b", "c", "d", "a"]);
  expect(insertedAt(["a", "b"], 1, ["x", "y"])).toEqual(["a", "x", "y", "b"]);
});

it("keeps each row's key when the list changes elsewhere", () => {
  const keys = newKeys(3);
  const before = [{ title: "a" }, { title: "b" }, { title: "a" }];
  const after = reconcileKeys(before, keys, [{ title: "b" }, { title: "a" }, { title: "new" }]);
  expect(after.slice(0, 2)).toEqual([keys[1], keys[0]]);
  expect(keys).not.toContain(after[2]);
});
