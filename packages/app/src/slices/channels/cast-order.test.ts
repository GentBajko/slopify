import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { defaultChannelId } from "./model.js";
import { createCastMember, createChannel, moveCastMember, readChannel } from "./service.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");

function fixture() {
  const db = openDb(":memory:");
  migrate(db, clock);
  return { db, clock, uuid: randomUUID };
}

function add(deps: ReturnType<typeof fixture>, name: string, channelId = defaultChannelId) {
  const result = createCastMember(deps, channelId, {
    id: randomUUID(),
    kind: "character",
    name,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.value.id;
}

function names(deps: ReturnType<typeof fixture>, channelId = defaultChannelId): string[] {
  const read = readChannel(deps, channelId);
  return read.ok ? read.value.cast.map((member) => member.name) : [];
}

it("keeps the cast in the order it was added, a new member last", () => {
  const deps = fixture();
  add(deps, "Zeno");
  add(deps, "Ada");
  add(deps, "Mira");
  expect(names(deps)).toEqual(["Zeno", "Ada", "Mira"]);
});

it("moves a member up, down, to the top and past the end, and keeps the order", () => {
  const deps = fixture();
  const zeno = add(deps, "Zeno");
  add(deps, "Ada");
  const mira = add(deps, "Mira");
  const up = moveCastMember(deps, defaultChannelId, { memberId: mira, to: 1 });
  expect(up.ok && up.value.map((member) => member.name)).toEqual(["Zeno", "Mira", "Ada"]);
  moveCastMember(deps, defaultChannelId, { memberId: zeno, to: 99 });
  expect(names(deps)).toEqual(["Mira", "Ada", "Zeno"]);
  moveCastMember(deps, defaultChannelId, { memberId: zeno, to: 0 });
  expect(names(deps)).toEqual(["Zeno", "Mira", "Ada"]);
  add(deps, "Bram");
  expect(names(deps)).toEqual(["Zeno", "Mira", "Ada", "Bram"]);
});

it("refuses a member of another channel or a bad place, changing nothing", () => {
  const deps = fixture();
  const other = randomUUID();
  createChannel(deps, { id: other, name: "Other" });
  const elsewhere = add(deps, "Elsewhere", other);
  add(deps, "Ada");
  expect(moveCastMember(deps, defaultChannelId, { memberId: elsewhere, to: 0 })).toEqual({
    ok: false,
    reason: "not-found",
  });
  expect(moveCastMember(deps, defaultChannelId, { memberId: elsewhere, to: -1 })).toEqual({
    ok: false,
    reason: "invalid-input",
  });
  expect(names(deps, other)).toEqual(["Elsewhere"]);
});
