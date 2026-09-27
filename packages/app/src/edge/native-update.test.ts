import { expect, it } from "vitest";
import type { UpdateInfo } from "../updater/model.js";
import { runNativeUpdate } from "./native-update.js";

const base: UpdateInfo = {
  currentVersion: "2.5.0",
  latestVersion: "3.0.0",
  available: true,
  busy: false,
  canUpdate: true,
  status: "idle",
};

function server(answers: (UpdateInfo | "down")[]) {
  const calls: string[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "POST")
      return Response.json({ ...base, status: "installing" }, { status: 202 });
    const next = answers.length > 1 ? answers.shift() : answers[0];
    if (next === "down" || next === undefined) throw new TypeError("fetch failed");
    return Response.json(next);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

it("waits for running work, starts the app's own update and follows it through the restart", async () => {
  const s = server([
    { ...base, busy: true, canUpdate: false },
    { ...base, busy: true, canUpdate: false },
    base,
    { ...base, status: "installing" },
    "down",
    { ...base, currentVersion: "3.0.0", available: false, status: "idle" },
  ]);
  const lines: string[] = [];
  await runNativeUpdate({
    origin: "http://127.0.0.1:7070",
    fetch: s.fetch,
    report: (l) => lines.push(l),
    pollMs: 1,
  });
  expect(lines[0]).toContain("Waiting for running work");
  expect(lines.at(-1)).toBe("Slopify 3.0.0 is running at http://127.0.0.1:7070");
  expect(s.calls.filter((c) => c.startsWith("POST"))).toEqual([
    "POST http://127.0.0.1:7070/api/update",
  ]);
});

it("reports the rollback the app made when the new version didn't start", async () => {
  const s = server([
    base,
    { ...base, status: "restarting" },
    {
      ...base,
      available: true,
      error:
        "The new version did not start, so Slopify put back the previous version and database.",
    },
  ]);
  await expect(
    runNativeUpdate({
      origin: "http://127.0.0.1:7070",
      fetch: s.fetch,
      report: () => {},
      pollMs: 1,
    }),
  ).rejects.toThrow("put back the previous version");
});

it("says what to do when nothing is running or nothing is newer", async () => {
  await expect(
    runNativeUpdate({
      origin: "http://127.0.0.1:7070",
      fetch: server(["down"]).fetch,
      report: () => {},
      pollMs: 1,
    }),
  ).rejects.toThrow("Start it (npx @gentbajko/slopify)");
  const lines: string[] = [];
  await runNativeUpdate({
    origin: "http://127.0.0.1:7070",
    fetch: server([{ ...base, available: false, latestVersion: "2.5.0" }]).fetch,
    report: (l) => lines.push(l),
  });
  expect(lines).toEqual(["Slopify 2.5.0 is already the newest version."]);
});
