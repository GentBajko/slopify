import { builtInTheme } from "@app/slices/document/theme.js";
import { documentThemeSchema } from "@app/slices/document/theme-schema.js";
import { expect, it } from "vitest";
import { rangeOf, themeGroups, valueAt, withValue } from "./document-theme-fields";

it("offers every setting of a theme exactly once", () => {
  const theme = builtInTheme("dicemaster");
  const leaves = (value: unknown, path: readonly string[]): string[] =>
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).flatMap(([key, inner]) =>
          // A face and the closing link are edited as one control each.
          path[0] === "fonts" || (path[0] === "endPage" && key === "link")
            ? [[...path, key].join(".")]
            : leaves(inner, [...path, key]),
        )
      : [path.join(".")];
  const offered = themeGroups.flatMap((group) => group.fields.map((field) => field.path.join(".")));
  expect([...offered].sort()).toEqual(leaves(theme, []).sort());
  expect(new Set(offered).size).toBe(offered.length);
});

it("reads ranges off the schema and edits one value without touching the rest", () => {
  expect(rangeOf(["page", "margin"])).toEqual({ min: 5, max: 60 });
  expect(rangeOf(["titlePage", "cover", "maxHeight"])).toEqual({ min: 20, max: 200 });
  const theme = builtInTheme("plain");
  const next = withValue(theme, ["titlePage", "cover", "gap"], 9);
  expect(valueAt(next, ["titlePage", "cover", "gap"])).toBe(9);
  expect(next.titlePage.cover.enabled).toBe(theme.titlePage.cover.enabled);
  expect(theme.titlePage.cover.gap).toBe(6);
  expect(documentThemeSchema.safeParse(next).success).toBe(true);
});
