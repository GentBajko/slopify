import type { Readiness } from "@app/kernel/ports/model.js";
import { expect, it } from "vitest";
import { providerUnavailableLabel } from "./provider-status.js";

it.each([
  [{ kind: "keyed", hasKey: false }, "No key"],
  [{ kind: "keyed", hasKey: true }, undefined],
  [{ kind: "cli", installed: true }, undefined],
  [{ kind: "cli", installed: false }, "Not found"],
  [{ kind: "cli", installed: true, issueKind: "login", issue: "Sign in" }, "Signed out"],
  [
    { kind: "cli", installed: false, issueKind: "bridge", issue: "Helper unavailable" },
    "Host helper unavailable",
  ],
  [{ kind: "cli", installed: true, issueKind: "version", issue: "Upgrade" }, "Needs an update"],
  [{ kind: "cli", installed: true, issue: "Unspecified issue" }, "Needs attention"],
] satisfies readonly (readonly [Readiness, string | undefined])[])(
  "labels readiness %j",
  (readiness, label) => {
    expect(providerUnavailableLabel(readiness)).toBe(label);
  },
);
