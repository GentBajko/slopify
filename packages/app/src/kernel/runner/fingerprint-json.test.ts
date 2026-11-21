import { expect, it } from "vitest";
import { type FingerprintValue, fingerprint, fingerprintJson } from "./work.js";

// Recipes are fingerprinted as JSON writes their input. The one-pass version must give the
// answer the write-read-write did, for every kind of value an input can hold.
const old = (value: unknown): string =>
  fingerprint(
    JSON.parse(
      JSON.stringify(value, (_key: string, item: unknown): unknown => {
        if (typeof item === "number" && !Number.isFinite(item)) throw new Error("not finite");
        return item;
      }),
    ) as FingerprintValue,
  );

it.each([
  ["a flat object", { b: 1, a: "x", c: true, d: null }],
  ["keys in any order", { z: 1, a: { y: [3, 2, 1], b: "q" }, "10": 1, "2": 2, é: 0 }],
  ["undefined fields dropped", { a: undefined, b: 1, c: () => 1 }],
  ["undefined items written null", [1, undefined, () => 2, Symbol("s"), null]],
  ["a sparse array", Object.assign(new Array<number>(3), { 0: 1, 2: 3 })],
  ["negative zero and big numbers", { zero: -0, big: 1e21, small: 1e-7, frac: 0.1 + 0.2 }],
  ["strings needing escapes", { s: 'a"b\\c\n\u0000 é😀', 'k"ey': "v" }],
  ["dates and toJSON", { at: new Date(0), own: { toJSON: () => ({ b: 2, a: 1 }) } }],
  ["maps and sets as JSON writes them", { m: new Map([["a", 1]]), s: new Set([1]) }],
  ["nested empties", { a: {}, b: [], c: [[]], d: [{}] }],
  ["a string alone", "text"],
  ["a number alone", 4.5],
])("gives the old fingerprint for %s", (_name, value) => {
  expect(fingerprintJson(value)).toBe(old(value));
});

it("refuses what it refused before", () => {
  expect(() => fingerprintJson({ a: Number.NaN })).toThrow();
  expect(() => fingerprintJson([Number.POSITIVE_INFINITY])).toThrow();
  expect(() => fingerprintJson({ a: 1n })).toThrow();
});
