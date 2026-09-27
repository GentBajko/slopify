import { transact } from "../../kernel/db/tx.js";
import type {
  BrandKit,
  CastMember,
  Channel,
  ChannelDeps,
  ChannelResult,
  ChannelSummary,
} from "./model.js";
import { defaultChannelId } from "./model.js";
import { castMemberById, castOfChannel, channelById, channelSummaries } from "./repo.js";
import {
  castMemberCreateSchema,
  castMemberUpdateSchema,
  channelCreateSchema,
  channelUpdateSchema,
  templateChannelSchema,
} from "./schema.js";

export function listChannels(deps: Pick<ChannelDeps, "db">): readonly ChannelSummary[] {
  return channelSummaries(deps.db);
}

export function readChannel(
  deps: Pick<ChannelDeps, "db">,
  id: string,
): ChannelResult<{ readonly channel: Channel; readonly cast: readonly CastMember[] }> {
  const channel = channelById(deps.db, id);
  if (channel === undefined) return { ok: false, reason: "not-found" };
  return { ok: true, value: { channel, cast: castOfChannel(deps.db, id) } };
}

export function createChannel(deps: ChannelDeps, input: unknown): ChannelResult<Channel> {
  const parsed = channelCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  const { id, name } = parsed.data;
  return transact(deps.db, () => {
    const existing = channelById(deps.db, id);
    // The same create sent twice (a retried request) answers with what the first made.
    if (existing !== undefined)
      return existing.name === name
        ? { ok: true, value: existing }
        : { ok: false, reason: "conflict" };
    const at = deps.clock.now().toISOString();
    deps.db
      .prepare("INSERT INTO channels(id,name,created_at,updated_at) VALUES (?,?,?,?)")
      .run(id, name, at, at);
    const created = channelById(deps.db, id);
    if (created === undefined) throw new Error("The new channel could not be read back");
    return { ok: true, value: created };
  });
}

export function updateChannel(
  deps: ChannelDeps,
  id: string,
  input: unknown,
): ChannelResult<Channel> {
  const parsed = channelUpdateSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-input",
      message: parsed.error.issues[0]?.message,
    };
  return transact(deps.db, () => {
    const previous = channelById(deps.db, id);
    if (previous === undefined) return { ok: false, reason: "not-found" };
    if (previous.version !== parsed.data.baseVersion) return { ok: false, reason: "conflict" };
    const brand: BrandKit = parsed.data.brand;
    deps.db
      .prepare(
        "UPDATE channels SET name=?,brand_json=?,series_brief=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      )
      .run(
        parsed.data.name,
        JSON.stringify(brand),
        parsed.data.seriesBrief,
        deps.clock.now().toISOString(),
        id,
        parsed.data.baseVersion,
      );
    const saved = channelById(deps.db, id);
    if (saved === undefined) throw new Error("The saved channel could not be read back");
    return { ok: true, value: saved };
  });
}

// Its cast goes with it; its projects move to the default channel. A channel with templates
// is refused, since its schedules would silently change channel.
export function deleteChannel(
  deps: Pick<ChannelDeps, "db">,
  id: string,
): ChannelResult<{ readonly deleted: true }> {
  return transact(deps.db, () => {
    const channel = channelById(deps.db, id);
    if (channel === undefined) return { ok: false, reason: "not-found" };
    if (channel.isDefault) return { ok: false, reason: "default-channel" };
    if (deps.db.prepare("SELECT 1 FROM project_templates WHERE channel_id=? LIMIT 1").get(id))
      return { ok: false, reason: "has-templates" };
    deps.db
      .prepare("UPDATE project_channels SET channel_id=? WHERE channel_id=?")
      .run(defaultChannelId, id);
    deps.db.prepare("DELETE FROM channels WHERE id=?").run(id);
    return { ok: true, value: { deleted: true } };
  });
}

export function moveTemplate(
  deps: Pick<ChannelDeps, "db">,
  templateId: string,
  input: unknown,
): ChannelResult<{ readonly templateId: string; readonly channelId: string }> {
  const parsed = templateChannelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    if (channelById(deps.db, parsed.data.channelId) === undefined)
      return { ok: false, reason: "not-found" };
    const changed = deps.db
      .prepare("UPDATE project_templates SET channel_id=? WHERE id=?")
      .run(parsed.data.channelId, templateId);
    if (Number(changed.changes) === 0) return { ok: false, reason: "not-found" };
    return { ok: true, value: { templateId, channelId: parsed.data.channelId } };
  });
}

export function createCastMember(
  deps: ChannelDeps,
  channelId: string,
  input: unknown,
): ChannelResult<CastMember> {
  const parsed = castMemberCreateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid-input", message: parsed.error.issues[0]?.message };
  const { id, kind, name, aliases, description } = parsed.data;
  return transact(deps.db, () => {
    if (channelById(deps.db, channelId) === undefined) return { ok: false, reason: "not-found" };
    const existing = castMemberById(deps.db, id);
    if (existing !== undefined)
      return existing.channelId === channelId && existing.name === name
        ? { ok: true, value: existing }
        : { ok: false, reason: "conflict" };
    const at = deps.clock.now().toISOString();
    deps.db
      .prepare(
        "INSERT INTO cast_members(id,channel_id,kind,name,aliases_json,description,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(id, channelId, kind, name, JSON.stringify(unique(aliases, name)), description, at, at);
    const created = castMemberById(deps.db, id);
    if (created === undefined) throw new Error("The new cast member could not be read back");
    return { ok: true, value: created };
  });
}

export function updateCastMember(
  deps: ChannelDeps,
  id: string,
  input: unknown,
): ChannelResult<CastMember> {
  const parsed = castMemberUpdateSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid-input", message: parsed.error.issues[0]?.message };
  const { kind, name, aliases, description, baseVersion } = parsed.data;
  return transact(deps.db, () => {
    const previous = castMemberById(deps.db, id);
    if (previous === undefined) return { ok: false, reason: "not-found" };
    if (previous.version !== baseVersion) return { ok: false, reason: "conflict" };
    deps.db
      .prepare(
        "UPDATE cast_members SET kind=?,name=?,aliases_json=?,description=?,version=version+1,updated_at=? WHERE id=? AND version=?",
      )
      .run(
        kind,
        name,
        JSON.stringify(unique(aliases, name)),
        description,
        deps.clock.now().toISOString(),
        id,
        baseVersion,
      );
    const saved = castMemberById(deps.db, id);
    if (saved === undefined) throw new Error("The saved cast member could not be read back");
    return { ok: true, value: saved };
  });
}

export function deleteCastMember(
  deps: Pick<ChannelDeps, "db">,
  id: string,
): ChannelResult<{ readonly deleted: true }> {
  const changed = deps.db.prepare("DELETE FROM cast_members WHERE id=?").run(id);
  return Number(changed.changes) === 0
    ? { ok: false, reason: "not-found" }
    : { ok: true, value: { deleted: true } };
}

// Aliases compared without case, the name itself left out: matching ignores case anyway.
function unique(aliases: readonly string[], name: string): readonly string[] {
  const seen = new Set([name.toLowerCase()]);
  return aliases.filter((alias) => {
    const key = alias.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
