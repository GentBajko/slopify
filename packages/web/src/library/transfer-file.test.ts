import { describe, expect, it } from "vitest";
import { importEach, importSummary } from "./transfer-file";

const refusedName = {
  ok: false as const,
  fields: [{ field: "name", message: "Another prompt already has this name." }],
};

describe("importing item by item", () => {
  it("moves on to the next free name when the server still refuses one", async () => {
    const tried: string[] = [];
    const outcome = await importEach([{ name: "Dossier", kind: "article" }], {
      existing: [],
      groupOf: (item) => item.kind,
      max: 200,
      save: async (item) => {
        tried.push(item.name);
        return tried.length === 1 ? refusedName : { ok: true, value: null };
      },
    });
    expect(tried).toEqual(["Dossier", "Dossier (imported)"]);
    expect(outcome).toEqual({ added: 1, renamed: 1, skipped: [] });
  });

  it("names clash only within their group, and skips a refusal that isn't the name", async () => {
    const outcome = await importEach(
      [
        { name: "Hello", kind: "intro" },
        { name: "Broken", kind: "outro" },
      ],
      {
        existing: [{ group: "outro", name: "hello" }],
        groupOf: (item) => item.kind,
        max: 200,
        save: async (item) =>
          item.name === "Broken"
            ? { ok: false, fields: [{ field: "body", message: "Write the text." }] }
            : { ok: true, value: null },
      },
    );
    expect(outcome).toEqual({
      added: 1,
      renamed: 0,
      skipped: [{ item: "Broken", reason: "Write the text." }],
    });
    expect(importSummary("a.json", ["entry", "entries"], outcome).text).toBe(
      "Imported 1 entry from a.json. Skipped 1: “Broken”: Write the text.",
    );
  });
});
