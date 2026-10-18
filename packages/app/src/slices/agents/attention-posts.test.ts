import { afterEach, describe, expect, it } from "vitest";
import { defaultChoices } from "../social/defaults.js";
import { writeProgress } from "../social/repo.js";
import { type PackFixture, packFixture } from "../social/social.fake.js";
import { noProgress } from "../social/state.js";
import { needsAttention } from "./attention.js";

const now = new Date("2026-10-18T10:00:00.000Z");
const quiet = { write: (): void => {} };
let fixture: PackFixture | undefined;
afterEach(() => {
  fixture?.close();
  fixture = undefined;
});

describe("posts in needs_attention", () => {
  it("lists a filled post waiting for the person's Post, and a fill that stopped, for agents to report", () => {
    const one = packFixture({ social: { x: defaultChoices.x, bluesky: defaultChoices.bluesky } });
    fixture = one;
    writeProgress(
      one.db,
      { projectId: "p1", platform: "bluesky" },
      { ...noProgress, state: "filled", filledAt: "2026-10-18T09:58:00.000Z" },
      now,
    );
    writeProgress(
      one.db,
      { projectId: "p1", platform: "x" },
      { ...noProgress, state: "failed", message: "No text box on the page." },
      now,
    );
    writeProgress(
      one.db,
      { projectId: "p1", platform: "reddit" },
      { ...noProgress, state: "posted" },
      now,
    );
    const entries = needsAttention({ ...one, log: quiet }, now).filter(
      (entry) => entry.itemKey?.startsWith("social:") === true,
    );
    expect(entries).toEqual([
      {
        kind: "post-due",
        since: "2026-10-18T09:58:00.000Z",
        projectId: "p1",
        title: "Episode one",
        stage: "video",
        itemKey: "social:bluesky",
        reason:
          "The Bluesky post is filled in Bluesky's form and waits for the person to press Post there. Posting is the person's: report it.",
        autoRetryInFlight: false,
        agentCanAct: false,
        ids: { projectId: "p1", platform: "bluesky" },
        tools: ["get_post_packs"],
      },
      expect.objectContaining({
        kind: "extension-failure",
        itemKey: "social:x",
        agentCanAct: false,
        reason:
          "Filling the X post failed: No text box on the page. Fixing it is the extension's or the person's: report it.",
      }),
    ]);
  });
});
