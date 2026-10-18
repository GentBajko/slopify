import { describe, expect, it } from "vitest";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { SampleVersion } from "./repo.js";
import { baseStatuses, type PaidStatusInput, paidStatuses } from "./status.js";
import { paidSetup } from "./studio.fake.js";

const one: PlayDraftDocument = paidSetup();

const voiced: PlayDraftDocument = {
  ...one,
  form: { ...one.form, audio: { ...one.form.audio, voice: "other" } },
};

const version = (
  templateVersion: number,
  state: SampleVersion["state"],
  heldReason: string | null = null,
): SampleVersion => ({
  templateVersion,
  revisionId: null,
  state,
  quotedHigh: 0.3,
  heldReason,
  updatedAt: "a",
});

function states(input: Partial<PaidStatusInput>): Record<string, [string, string]> {
  const made = paidStatuses({
    headVersion: 2,
    headDocument: voiced,
    versions: [],
    documentOf: (n) => (n === 1 ? one : n === 2 ? voiced : undefined),
    running: false,
    busyElsewhere: false,
    ...input,
  });
  return Object.fromEntries(
    Object.entries(made).map(([id, status]) => [id, [status?.state ?? "", status?.sentence ?? ""]]),
  );
}

describe("paidStatuses", () => {
  it("says nothing before any paid sample was asked for", () => {
    expect(states({})).toEqual({});
  });

  it("is current for every paid section once the version's sample is made", () => {
    const made = states({ versions: [version(2, "done"), version(1, "done")] });
    expect(made.script).toEqual(["current", "Made for version 2."]);
    expect(made.voice).toEqual(["current", "Made for version 2."]);
  });

  it("keeps an older sample current where nothing changed, and outdates what the change touches", () => {
    const made = states({ versions: [version(2, "skipped"), version(1, "done")] });
    expect(made.script?.[0]).toBe("current");
    expect(made.script?.[1]).toBe("Made for version 1; nothing it shows changed since.");
    expect(made.voice).toEqual([
      "stale",
      "Changed since the sample of version 1. Press Make sample to see it again.",
    ]);
    expect(made.upload?.[0]).toBe("stale");
  });

  it("shows the outdated sections making while the job runs, and waiting behind another template", () => {
    expect(
      states({ versions: [version(2, "queued"), version(1, "done")], running: true }).voice?.[0],
    ).toBe("making");
    expect(states({ versions: [version(2, "making"), version(1, "done")] }).voice?.[0]).toBe(
      "making",
    );
    expect(
      states({ versions: [version(2, "queued"), version(1, "done")], busyElsewhere: true }).voice,
    ).toEqual(["waiting", "Waits for another template's sample to finish."]);
  });

  it("says why a sample waits and why one failed, in the sentence that names the fix", () => {
    const held =
      "Waiting: this sample now costs about $0.61, more than the $0.40 you saw. Press Make sample ($0.61) to make it.";
    expect(states({ versions: [version(2, "held", held), version(1, "done")] }).voice).toEqual([
      "waiting",
      held,
    ]);
    const failed = "OpenRouter refused the key. Paste a new one in Settings → Providers.";
    expect(states({ versions: [version(2, "failed", failed)] }).script).toEqual([
      "needs-fix",
      failed,
    ]);
  });
});

describe("baseStatuses", () => {
  it("keeps off and provided sections as they are, whatever a sample says", () => {
    const provided: PlayDraftDocument = {
      ...one,
      form: { ...one.form, sources: { ...one.form.sources, audio: "provide", thumbnail: "off" } },
    };
    const made = paidStatuses({
      headVersion: 1,
      headDocument: provided,
      versions: [version(1, "done")],
      documentOf: () => provided,
      running: false,
      busyElsewhere: false,
    });
    const sections = Object.fromEntries(
      baseStatuses(provided, made).map((status) => [status.id, status.state]),
    );
    expect(sections.voice).toBe("provided");
    expect(sections.thumbnail).toBe("off");
    expect(sections.script).toBe("current");
  });
});
