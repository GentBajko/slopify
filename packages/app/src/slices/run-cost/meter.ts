import type { DatabaseSync } from "node:sqlite";
import type { Catalogue } from "../../catalog/schema.js";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import { planAccountOf } from "../../kernel/ports/plan-limits.js";
import type { MeteredCall, UsageMeter } from "../../kernel/runner/meter.js";
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
      deps.db
        .prepare(
          `INSERT INTO provider_usage (id, project_id, stage, kind, provider, model, tokens_in, tokens_out, tokens_cached, characters, images, seconds, size, quality, wall_ms, on_plan, cost, api_model, api_cost, price_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          deps.ids.next(),
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
      const account = planAccountOf(call.provider);
      if (account !== undefined && call.limits !== undefined)
        deps.db
          .prepare(
            "INSERT INTO plan_limit_readings (id, project_id, account, reading_json, created_at) VALUES (?, ?, ?, ?, ?)",
          )
          .run(deps.ids.next(), call.projectId, account, JSON.stringify(call.limits), at);
    },
  };
}
