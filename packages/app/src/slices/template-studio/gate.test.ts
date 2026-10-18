import { describe, expect, it } from "vitest";
import { carryGate, checkedVersion, gateOf, isGated, runnableVersion } from "./gate.js";
import type { VersionGate } from "./model.js";

const gate = (version: number, state: VersionGate["state"], carriedFrom: number | null = null) => ({
  version,
  state,
  carriedFrom,
});

describe("checkedVersion", () => {
  it("is the newest legacy version when nothing was checked since", () => {
    expect(checkedVersion([gate(1, "legacy"), gate(2, "legacy")], 3)).toBe(2);
  });

  it("is the version marked ready, not a newer unchecked one", () => {
    expect(checkedVersion([gate(5, "legacy"), gate(6, "ready")], 7)).toBe(6);
  });

  it("is a carried version when what it was carried from is runnable", () => {
    expect(checkedVersion([gate(6, "ready"), gate(7, "carried", 6)], 7)).toBe(7);
  });

  it("follows a chain of carried versions back to a runnable one", () => {
    expect(
      checkedVersion([gate(1, "ready"), gate(2, "carried", 1), gate(3, "carried", 2)], 3),
    ).toBe(3);
  });

  it("skips a carried version whose source was never checked", () => {
    expect(checkedVersion([gate(1, "ready"), gate(3, "carried", 2)], 3)).toBe(1);
  });

  it("refuses a carried version that names itself or a newer one", () => {
    expect(checkedVersion([gate(2, "carried", 2), gate(3, "carried", 4)], 4)).toBeUndefined();
  });

  it("is undefined when no version was ever checked", () => {
    expect(checkedVersion([], 2)).toBeUndefined();
  });

  it("never names a version past the head", () => {
    expect(checkedVersion([gate(1, "ready"), gate(4, "ready")], 3)).toBe(1);
  });
});

describe("isGated", () => {
  it("is false until some version was marked ready in the studio", () => {
    expect(isGated([])).toBe(false);
    expect(isGated([gate(1, "legacy"), gate(2, "carried", 1)])).toBe(false);
    expect(isGated([gate(1, "legacy"), gate(2, "ready")])).toBe(true);
  });
});

describe("runnableVersion", () => {
  it("follows the newest version, checked or not, while no version was ever marked ready", () => {
    expect(runnableVersion([gate(1, "legacy"), gate(2, "legacy")], 3)).toBe(3);
    expect(runnableVersion([], 2)).toBe(2);
    expect(runnableVersion([gate(1, "legacy"), gate(2, "carried", 1)], 2)).toBe(2);
  });

  it("runs the newest checked version once a version was marked ready", () => {
    expect(runnableVersion([gate(5, "legacy"), gate(6, "ready")], 7)).toBe(6);
    expect(runnableVersion([gate(6, "ready"), gate(7, "carried", 6)], 7)).toBe(7);
  });

  it("is undefined for a gated template with nothing runnable at or below its head", () => {
    expect(runnableVersion([gate(4, "ready")], 3)).toBeUndefined();
  });
});

describe("gateOf", () => {
  it("reads a missing gate as unchecked", () => {
    expect(gateOf([gate(1, "legacy")], 2)).toBe("unchecked");
    expect(gateOf([gate(1, "legacy")], 1)).toBe("legacy");
  });
});

describe("carryGate", () => {
  it("carries a runnable parent's gate to the version a system change made", () => {
    expect(carryGate([gate(4, "ready")], 4, 5)).toEqual(gate(5, "carried", 4));
    expect(carryGate([gate(4, "legacy")], 4, 5)).toEqual(gate(5, "carried", 4));
  });

  it("carries nothing from an unchecked parent", () => {
    expect(carryGate([gate(3, "ready")], 4, 5)).toBeUndefined();
  });

  it("carries nothing backwards", () => {
    expect(carryGate([gate(4, "ready")], 4, 4)).toBeUndefined();
  });
});
