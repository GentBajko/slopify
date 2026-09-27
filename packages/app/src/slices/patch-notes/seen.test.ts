import { describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import { insertMachine } from "../telemetry/repo.js";
import type { PatchNoteSummary } from "./library.js";
import { duePatchNote, isNewerRelease, markPatchNotesSeen, patchNotesSeenKey } from "./seen.js";

const notes: readonly PatchNoteSummary[] = [
  { id: "3.1.0", title: "Slopify 3.1.0", version: "3.1.0", date: "2026-10-10" },
  { id: "3.0.0", title: "Slopify 3.0.0", version: "3.0.0", date: "2026-09-27" },
  { id: "2.0-to-3.0", title: "Slopify 2.0 to 3.0", range: "2.0.1 to 3.0.0", date: "2026-09-27" },
];

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

describe("patch notes, once per version", () => {
  it("compares release numbers", () => {
    expect(isNewerRelease("3.0.0", "2.9.9")).toBe(true);
    expect(isNewerRelease("3.10.0", "3.9.0")).toBe(true);
    expect(isNewerRelease("3.0.0", "3.0.0")).toBe(false);
    expect(isNewerRelease("2.9.0", "3.0.0")).toBe(false);
    expect(isNewerRelease("dev", "1.0.0")).toBe(false);
  });

  it("does not open on a fresh install, before or after the first-run notice", () => {
    withDb((h) => {
      expect(duePatchNote(h.deps.db, "3.0.0", notes)).toBeNull();
      machineAt(h, "3.0.0");
      expect(duePatchNote(h.deps.db, "3.0.0", notes)).toBeNull();
    });
  });

  it("opens once after an update, and stays closed across restarts", () => {
    withDb((h) => {
      machineAt(h, "2.5.0");
      expect(duePatchNote(h.deps.db, "3.0.0", notes)).toBe("3.0.0");
      markPatchNotesSeen(h.deps.db, "3.0.0");
      expect(readSetting(h.deps.db, patchNotesSeenKey)).toBe(JSON.stringify("3.0.0"));
      h.reopen();
      expect(duePatchNote(h.deps.db, "3.0.0", notes)).toBeNull();
      // The next version with notes of its own opens them again.
      expect(duePatchNote(h.deps.db, "3.1.0", notes)).toBe("3.1.0");
    });
  });

  it("opens after an update from a version first installed without notes", () => {
    withDb((h) => {
      machineAt(h, "3.0.0");
      expect(duePatchNote(h.deps.db, "3.1.0", notes)).toBe("3.1.0");
    });
  });

  it("opens nothing for a version without notes of its own", () => {
    withDb((h) => {
      machineAt(h, "2.5.0");
      expect(duePatchNote(h.deps.db, "3.0.1", notes)).toBeNull();
      expect(duePatchNote(h.deps.db, "dev", notes)).toBeNull();
    });
  });

  it("never lowers the recorded version, and ignores a damaged one", () => {
    withDb((h) => {
      machineAt(h, "2.5.0");
      markPatchNotesSeen(h.deps.db, "3.1.0");
      markPatchNotesSeen(h.deps.db, "3.0.0");
      expect(readSetting(h.deps.db, patchNotesSeenKey)).toBe(JSON.stringify("3.1.0"));
      expect(duePatchNote(h.deps.db, "3.0.0", notes)).toBeNull();
      writeSetting(h.deps.db, patchNotesSeenKey, "{broken");
      expect(duePatchNote(h.deps.db, "3.1.0", notes)).toBeNull();
    });
  });
});
