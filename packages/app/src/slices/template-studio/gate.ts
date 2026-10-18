import type { GateState, VersionGate } from "./model.js";

export type GateView = GateState | "unchecked";

function runnable(
  byVersion: ReadonlyMap<number, VersionGate>,
  version: number,
  seen: ReadonlySet<number> = new Set(),
): boolean {
  const gate = byVersion.get(version);
  if (gate === undefined || seen.has(version)) return false;
  if (gate.state !== "carried") return true;
  const from = gate.carriedFrom;
  return from !== null && from < version && runnable(byVersion, from, new Set([...seen, version]));
}

// The newest version at or below the head that was legacy, marked ready, or carried from a
// runnable one. Undefined when none was ever checked. What a pack carries.
export function checkedVersion(gates: readonly VersionGate[], head: number): number | undefined {
  const byVersion = new Map(gates.map((gate) => [gate.version, gate]));
  return [...byVersion.keys()]
    .filter((version) => version <= head && runnable(byVersion, version))
    .sort((a, b) => b - a)[0];
}

// A template is gated from the first time any of its versions is marked ready in the studio.
// Before that it follows its newest version as 3.x did, so an edit applies to the next run.
export function isGated(gates: readonly VersionGate[]): boolean {
  return gates.some((gate) => gate.state === "ready");
}

// The version a schedule runs: the newest one while the template isn't gated, else the newest
// checked one (a newer unchecked version waits for Mark ready).
export function runnableVersion(gates: readonly VersionGate[], head: number): number | undefined {
  return isGated(gates) ? checkedVersion(gates, head) : head;
}

export function gateOf(gates: readonly VersionGate[], version: number): GateView {
  return gates.find((gate) => gate.version === version)?.state ?? "unchecked";
}

// A version Slopify itself wrote (a model switch, a restore under a new name) keeps the gate of
// the version it came from, so a schedule is never stopped by a change its user did not make.
export function carryGate(
  gates: readonly VersionGate[],
  parent: number,
  next: number,
): VersionGate | undefined {
  if (next <= parent) return undefined;
  const byVersion = new Map(gates.map((gate) => [gate.version, gate]));
  return runnable(byVersion, parent)
    ? { version: next, state: "carried", carriedFrom: parent }
    : undefined;
}
