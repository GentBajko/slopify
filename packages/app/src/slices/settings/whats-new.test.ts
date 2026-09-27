import { describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { insertMachine } from "../telemetry/repo.js";
import { readSetting, writeSetting } from "./repo.js";
import { dismissWhatsNew, majorOf, readWhatsNew, whatsNewSeenKey } from "./whats-new.js";

function withDb(run: (h: ReturnType<typeof draftFixture>) => void): void {
  const h = draftFixture();
  try {
    run(h);
  } finally {
    h.close();
  }
}

function machineAt(h: ReturnType<typeof draftFixture>, appVersion: string): void {
  insertMachine(h.deps.db, {
    machineId: "11111111-1111-4111-8111-111111111111",
    noticeSeenAt: "2026-01-01T00:00:00.000Z",
    appVersion,
  });
}

describe("what's new, once per major version", () => {
  it("reads the major of a release number and nothing else", () => {
    expect(majorOf("3.0.0")).toBe(3);
    expect(majorOf("12.4.1-beta.2")).toBe(12);
    expect(majorOf("dev")).toBeUndefined();
    expect(majorOf("3.0")).toBeUndefined();
  });

  it("is not shown on a fresh install, before or after the first-run notice", () => {
    withDb((h) => {
      // The notice is still up: no machine yet.
      expect(readWhatsNew(h.deps.db, "3.0.0")).toEqual({ show: false, major: 3 });
      // Dismissing the notice on 3.0 stamps the machine with 3.0.
      machineAt(h, "3.0.0");
      expect(readWhatsNew(h.deps.db, "3.0.0")).toEqual({ show: false, major: 3 });
      expect(readWhatsNew(h.deps.db, "3.2.1")).toEqual({ show: false, major: 3 });
    });
  });

  it("is shown once after updating from 2.x, and stays closed across restarts", () => {
    withDb((h) => {
      machineAt(h, "2.4.0");
      expect(readWhatsNew(h.deps.db, "2.9.0")).toEqual({ show: false, major: 2 });
      expect(readWhatsNew(h.deps.db, "3.0.0")).toEqual({ show: true, major: 3 });
      expect(dismissWhatsNew(h.deps.db, "3.0.0")).toEqual({ show: false, major: 3 });
      expect(readSetting(h.deps.db, whatsNewSeenKey)).toBe("3");
      h.reopen();
      expect(readWhatsNew(h.deps.db, "3.0.0")).toEqual({ show: false, major: 3 });
      expect(readWhatsNew(h.deps.db, "3.1.0")).toEqual({ show: false, major: 3 });
      // Closing again is harmless.
      dismissWhatsNew(h.deps.db, "3.0.0");
      expect(readSetting(h.deps.db, whatsNewSeenKey)).toBe("3");
    });
  });

  it("comes back for the next major, measured from the last one seen", () => {
    withDb((h) => {
      machineAt(h, "2.4.0");
      dismissWhatsNew(h.deps.db, "3.0.0");
      expect(readWhatsNew(h.deps.db, "4.0.0")).toEqual({ show: true, major: 4 });
      // A fresh 3.x install that later updates to 4.0 sees 4.0's tour too.
      withDb((fresh) => {
        machineAt(fresh, "3.0.0");
        expect(readWhatsNew(fresh.deps.db, "4.0.0")).toEqual({ show: true, major: 4 });
      });
    });
  });

  it("never lowers the recorded major", () => {
    withDb((h) => {
      machineAt(h, "2.4.0");
      dismissWhatsNew(h.deps.db, "4.0.0");
      dismissWhatsNew(h.deps.db, "3.0.0");
      expect(readSetting(h.deps.db, whatsNewSeenKey)).toBe("4");
      expect(readWhatsNew(h.deps.db, "3.0.0").show).toBe(false);
    });
  });

  it("shows nothing for a version that is not a release number", () => {
    withDb((h) => {
      machineAt(h, "2.4.0");
      expect(readWhatsNew(h.deps.db, "dev")).toEqual({ show: false, major: null });
      expect(dismissWhatsNew(h.deps.db, "dev")).toEqual({ show: false, major: null });
      expect(readSetting(h.deps.db, whatsNewSeenKey)).toBeUndefined();
    });
  });

  it.each(["broken", '"3"', "-1", "2.5"])("treats a damaged value as seen: %s", (raw) => {
    withDb((h) => {
      machineAt(h, "2.4.0");
      writeSetting(h.deps.db, whatsNewSeenKey, raw);
      expect(readWhatsNew(h.deps.db, "3.0.0")).toEqual({ show: false, major: 3 });
      // Closing repairs it.
      dismissWhatsNew(h.deps.db, "3.0.0");
      expect(readSetting(h.deps.db, whatsNewSeenKey)).toBe("3");
    });
  });
});
