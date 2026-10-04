import { type Readiness, readinessIsUsable } from "@app/kernel/ports/model.js";

// Why a provider can't be picked, in the words Settings → Providers uses for the same
// condition: "No key", "Not found", "Signed out", "Needs an update", "Needs attention".
export function providerUnavailableLabel(readiness: Readiness): string | undefined {
  if (readinessIsUsable(readiness)) return undefined;
  if (readiness.kind === "keyed") return "No key";
  if (readiness.kind === "local") return "Not found";
  if (readiness.issueKind === "login") return "Signed out";
  if (readiness.issueKind === "bridge") return "Host helper unavailable";
  if (readiness.issueKind === "version") return "Needs an update";
  return readiness.issue === undefined || readiness.issueKind === "missing"
    ? "Not found"
    : "Needs attention";
}
