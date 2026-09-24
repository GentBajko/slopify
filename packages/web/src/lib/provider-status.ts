import { type Readiness, readinessIsUsable } from "@app/kernel/ports/model.js";

export function providerUnavailableLabel(readiness: Readiness): string | undefined {
  if (readinessIsUsable(readiness)) return undefined;
  if (readiness.kind === "keyed") return "Key Missing";
  if (readiness.issueKind === "login") return "Sign In Required";
  if (readiness.issueKind === "bridge") return "Host Helper Unavailable";
  if (readiness.issueKind === "version") return "CLI Update Required";
  return readiness.issue === undefined || readiness.issueKind === "missing"
    ? "CLI Missing"
    : "CLI Unavailable";
}
