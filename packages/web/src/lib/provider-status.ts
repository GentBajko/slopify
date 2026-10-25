import { type Readiness, readinessIsUsable } from "@app/kernel/ports/model.js";

// Why a provider can't be picked, in the one list of states Settings → Keys & services uses for
// the same condition (components/provider-keys.tsx): "No key", "Not installed" (the computer's
// own voice without its speech program), "Not found", "Signed out", "Needs fixing".
export function providerUnavailableLabel(readiness: Readiness): string | undefined {
  if (readinessIsUsable(readiness)) return undefined;
  if (readiness.kind === "keyed") return "No key";
  if (readiness.kind === "local") return "Not installed";
  if (!readiness.installed || readiness.issueKind === "missing") return "Not found";
  if (readiness.issueKind === "login") return "Signed out";
  return "Needs fixing";
}
