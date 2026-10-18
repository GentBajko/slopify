import { parse } from "yaml";
import { z } from "zod";
import { providerFamilies } from "../kernel/ports/model.js";
import type { Catalogue } from "./schema.js";

// models-lifecycle.yaml: retirement dates and replacements for models in models.yaml. Rows
// keep unknown keys out rather than refusing them, so a later version may add fields without
// breaking this one.
const lifecycleRow = z.object({
  family: z.enum(providerFamilies),
  provider: z.string().regex(/^[a-z0-9-]+$/),
  id: z.string().min(1).max(200),
  retiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  replacement: z.string().min(1).max(200).optional(),
});
export const lifecycleSchema = z.object({
  schemaVersion: z.literal(1),
  models: z.array(lifecycleRow).max(500),
});
export type Lifecycle = z.infer<typeof lifecycleSchema>;
export type LifecycleRow = Lifecycle["models"][number];

export const emptyLifecycle: Lifecycle = { schemaVersion: 1, models: [] };

export const lifecycleSource =
  "https://raw.githubusercontent.com/GentBajko/slopify/main/packages/app/src/assets/models-lifecycle.yaml";

export function parseLifecycle(text: string): Lifecycle {
  if (Buffer.byteLength(text) > 256 * 1024) throw new Error("Model lifecycle exceeds 256 KB");
  return lifecycleSchema.parse(parse(text, { maxAliasCount: 20, uniqueKeys: true }) ?? {});
}

export interface Retirement {
  readonly on: string;
  readonly replacement: { readonly id: string; readonly name: string } | null;
}

function liveRow(catalogue: Catalogue, row: Pick<LifecycleRow, "family" | "provider">, id: string) {
  return catalogue[row.family].find(
    (model) =>
      model.provider === row.provider && model.id === id && model.enabled && !model.deprecated,
  );
}

// A model due to retire, with its replacement when that one is live. A model already retired
// in the catalogue (deprecated) is past this: the retired-models flow takes over.
export function retirementOf(
  lifecycle: Lifecycle,
  catalogue: Catalogue,
  model: {
    readonly family: LifecycleRow["family"];
    readonly provider: string;
    readonly model: string;
  },
): Retirement | undefined {
  const row = lifecycle.models.find(
    (one) =>
      one.family === model.family && one.provider === model.provider && one.id === model.model,
  );
  if (row === undefined) return undefined;
  const current = catalogue[row.family].find(
    (one) => one.provider === row.provider && one.id === row.id,
  );
  if (current?.deprecated === true) return undefined;
  const next = row.replacement === undefined ? undefined : liveRow(catalogue, row, row.replacement);
  return {
    on: row.retiresOn,
    replacement: next === undefined ? null : { id: next.id, name: next.name },
  };
}

// The lifecycle's named replacement for a model, when it is live in the catalogue.
export function lifecycleReplacement(
  lifecycle: Lifecycle | undefined,
  catalogue: Catalogue,
  model: {
    readonly family: LifecycleRow["family"];
    readonly provider: string;
    readonly model: string;
  },
): { readonly id: string; readonly name: string } | undefined {
  if (lifecycle === undefined) return undefined;
  const row = lifecycle.models.find(
    (one) =>
      one.family === model.family && one.provider === model.provider && one.id === model.model,
  );
  if (row?.replacement === undefined) return undefined;
  const next = liveRow(catalogue, row, row.replacement);
  return next === undefined ? undefined : { id: next.id, name: next.name };
}
