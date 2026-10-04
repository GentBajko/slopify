import { describe, expect, it } from "vitest";
import { aliasTable, readAliasTable } from "./aliases-table.js";

const alias = (written: string, spoken: string) => ({
  written,
  spoken,
  wholeWord: true,
  caseSensitive: false,
});

describe("aliases as a two-column table", () => {
  it("reads CSV with a header, quotes and a skipped line", () => {
    const text = 'Written,Say it as\nDr.,Doctor\n"St., abbr","Saint, as in ""St."""\nlonely\n\n';
    expect(readAliasTable(text, "aliases.csv")).toEqual({
      aliases: [alias("Dr.", "Doctor"), alias("St., abbr", 'Saint, as in "St."')],
      skipped: [4],
    });
  });

  it("reads TSV by its name or a tab on the first line", () => {
    expect(readAliasTable("Dr.\tDoctor\r\nMt.\tMount\r\n").aliases).toEqual([
      alias("Dr.", "Doctor"),
      alias("Mt.", "Mount"),
    ]);
    expect(readAliasTable("a, b\tc", "x.tsv").aliases).toEqual([alias("a, b", "c")]);
  });

  it("writes what it reads", () => {
    const list = [alias("Dr.", "Doctor"), alias('He said "hi", then', "x")];
    expect(readAliasTable(aliasTable(list, ","), "a.csv").aliases).toEqual(list);
    expect(readAliasTable(aliasTable(list, "\t"), "a.tsv").aliases).toEqual(list);
  });
});
