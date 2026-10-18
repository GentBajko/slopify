import type { DatabaseSync } from "node:sqlite";
import type { Catalogue } from "../../catalog/schema.js";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import { planAccountOf } from "../../kernel/ports/plan-limits.js";
import type {
  MeteredCall,
  StandaloneMeter,
  StandaloneMeteredCall,
  StandaloneOwner,
  UsageMeter,
} from "../../kernel/runner/meter.js";
import { resolveChannelId, scheduleChannel } from "../channels/repo.js";
import { priceCall } from "./pricing.js";

export interface MeterDeps {
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly clock: Clock;
  // Read per call, so a refreshed catalogue prices the next call and never an earlier one.
  readonly catalogue: () => Catalogue;
}

// Prices each call as it lands and keeps it with the rates it used; a CLI's plan windows go
// beside it. Separate from the anonymous telemetry log: this is per project, never leaves the
// machine, and is kept whether or not the usage-stats notice was dismissed.
export function createUsageMeter(deps: MeterDeps): UsageMeter {
  return {
    record: (call: MeteredCall): void => {
      const priced = priceCall(call, deps.catalogue());
      const at = deps.clock.now().toISOString();
      const usageId = deps.ids.next();
      deps.db
        .prepare(
          `INSERT INTO provider_usage (id, project_id, stage, kind, provider, model, tokens_in, tokens_out, tokens_cached, characters, images, seconds, size, quality, wall_ms, on_plan, cost, api_model, api_cost, price_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          usageId,
          call.projectId,
          call.stage,
          call.kind,
          call.provider,
          call.model,
          call.tokensIn ?? null,
          call.tokensOut ?? null,
          call.cachedTokens ?? null,
          call.characters ?? null,
          call.images ?? null,
          call.seconds ?? null,
          call.size ?? null,
          call.quality ?? null,
          Math.round(call.wallMs),
          priced.onPlan ? 1 : 0,
          priced.cost,
          priced.apiModel,
          priced.apiCost,
          priced.price === null ? null : JSON.stringify(priced.price),
          at,
        );
      // The reading names its call, so the Run cost tab knows when the call ran and its tokens.
      const account = planAccountOf(call.provider);
      if (account !== undefined && call.limits !== undefined)
        deps.db
          .prepare(
            "INSERT INTO plan_limit_readings (id, project_id, account, reading_json, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(
            deps.ids.next(),
            call.projectId,
            account,
            JSON.stringify({ ...call.limits, usageId }),
            at,
          );
    },
  };
}

// The same pricing for a call made outside a project (`kernel/runner/standalone.ts`), kept
// against its schedule or channel with the channel it counts under on Home.
export function createStandaloneMeter(deps: MeterDeps): StandaloneMeter {
  return {
    record: (call: StandaloneMeteredCall): void => {
      const priced = priceCall(call, deps.catalogue());
      const account = planAccountOf(call.provider);
      const reading =
        account !== undefined && call.limits !== undefined
          ? { account, json: JSON.stringify(call.limits) }
          : undefined;
      deps.db
        .prepare(
          `INSERT INTO standalone_usage (id, owner_kind, owner_id, channel_id, purpose, kind, provider, model, tokens_in, tokens_out, tokens_cached, characters, images, seconds, size, quality, wall_ms, on_plan, cost, api_model, api_cost, price_json, account, reading_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          deps.ids.next(),
          call.owner.kind,
          call.owner.id,
          channelOf(deps.db, call.owner),
          call.purpose,
          call.kind,
          call.provider,
          call.model,
          call.tokensIn ?? null,
          call.tokensOut ?? null,
          call.cachedTokens ?? null,
          call.characters ?? null,
          call.images ?? null,
          call.seconds ?? null,
          call.size ?? null,
          call.quality ?? null,
          Math.round(call.wallMs),
          priced.onPlan ? 1 : 0,
          priced.cost,
          priced.apiModel,
          priced.apiCost,
          priced.price === null ? null : JSON.stringify(priced.price),
          reading?.account ?? null,
          reading?.json ?? null,
          deps.clock.now().toISOString(),
        );
    },
  };
}

// A schedule counts under its template's channel; one whose template is gone, like a channel
// this install doesn't have, under the default channel.
// A design counts under its own channel; one deleted since, under the default channel.
function channelOf(db: DatabaseSync, owner: StandaloneOwner): string {
  if (owner.kind === "schedule") return resolveChannelId(db, scheduleChannel(db, owner.id)?.id);
  if (owner.kind === "design") {
    const row = db.prepare("SELECT channel_id FROM designs WHERE id=?").get(owner.id);
    return resolveChannelId(db, row === undefined ? undefined : String(row.channel_id));
  }
  return resolveChannelId(db, owner.id);
}
