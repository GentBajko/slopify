import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { defaultChannelId } from "../channels/model.js";
import { createStandaloneMeter } from "./meter.js";
import { weekSummary } from "./week.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");

function harness() {
  const db = openDb(":memory:");
  migrate(db, clock);
  db.exec(
    "INSERT INTO channels (id, name, created_at, updated_at) VALUES ('c2','Posters','a','a')",
  );
  db.exec(
    "INSERT INTO designs (id,kind,name,channel_id,created_at,updated_at) VALUES ('d1','design','Gig','c2','a','a')",
  );
  let n = 0;
  const meter = createStandaloneMeter({
    db,
    clock,
    ids: { next: () => `u${String(++n)}` },
    catalogue: () => ({
      schemaVersion: 1,
      updatedAt: "2026-10-01",
      providers: {},
      llm: [],
      tts: [],
      image: [],
    }),
  });
  const call = (id: string) =>
    meter.record({
      owner: { kind: "design", id },
      purpose: "picture-edit",
      kind: "image",
      provider: "fal",
      model: "fal-ai/flux-2",
      images: 1,
      wallMs: 1200,
    });
  return { db, call };
}

it("meters a design's paid picture under the design's channel", () => {
  const { db, call } = harness();
  call("d1");
  call("gone");
  expect(
    db
      .prepare("SELECT owner_kind, owner_id, channel_id, purpose FROM standalone_usage ORDER BY id")
      .all(),
  ).toEqual([
    { owner_kind: "design", owner_id: "d1", channel_id: "c2", purpose: "picture-edit" },
    {
      owner_kind: "design",
      owner_id: "gone",
      channel_id: defaultChannelId,
      purpose: "picture-edit",
    },
  ]);
});

it("counts design pictures in This week, narrowed to the design's channel", () => {
  const { db, call } = harness();
  call("d1");
  expect(weekSummary(db, "2026-10-12T00:00:00.000Z")).toMatchObject({ calls: 1, unpriced: 1 });
  expect(weekSummary(db, "2026-10-12T00:00:00.000Z", "c2")).toMatchObject({ calls: 1 });
  expect(weekSummary(db, "2026-10-12T00:00:00.000Z", defaultChannelId)).toMatchObject({ calls: 0 });
});
