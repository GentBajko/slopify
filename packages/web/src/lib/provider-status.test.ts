import type { Readiness } from "@app/kernel/ports/model.js";
import { expect, it } from "vitest";
import { providerUnavailableLabel } from "./provider-status.js";

it.each([
  [{ kind: "keyed", hasKey: false }, "Key Missing"],
  [{ kind: "keyed", hasKey: true }, undefined],
  [{ kind: "cli", installed: true }, undefined],
  [{ kind: "cli", installed: false }, "CLI Missing"],
  [{ kind: "cli", installed: true, issueKind: "login", issue: "Sign in" }, "Sign In Required"],
  [
    { kind: "cli", installed: false, issueKind: "bridge", issue: "Helper unavailable" },
    "Host Helper Unavailable",
  ],
  [{ kind: "cli", installed: true, issueKind: "version", issue: "Upgrade" }, "CLI Update Required"],
  [{ kind: "cli", installed: true, issue: "Unspecified issue" }, "CLI Unavailable"],
] satisfies readonly (readonly [Readiness, string | undefined])[])(
  "labels readiness %j",
  (readiness, label) => {
    expect(providerUnavailableLabel(readiness)).toBe(label);
  },
);
