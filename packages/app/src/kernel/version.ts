import { readFileSync } from "node:fs";

// package.json sits two directories above this module in both src/ and dist/, because the
// build mirrors the source tree. Reading it through import.meta.url survives `npx` from
// any working directory.
export function readVersion(): string {
  const parsed: unknown = JSON.parse(
    readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
  );
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new Error("package.json has no version string");
  }
  return parsed.version;
}
