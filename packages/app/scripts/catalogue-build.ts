// The daily catalogue proposal: reads OpenRouter's public model metadata, proposes changes to
// packages/app/src/assets/models.yaml and models-lifecycle.yaml (src/catalog/propose.ts),
// validates both with the schemas every installed Slopify reads, writes them, and prints one
// line: "Models: 3 new, 1 retired, 2 price changes". .github/workflows/catalogue.yml opens the
// PR from it. Run from the repository root:
//   node --import ./packages/app/scripts/ts-resolve.mjs packages/app/scripts/catalogue-build.ts
// Options: --openrouter <file> reads a saved listing instead of the network (tests, fixtures);
// --today YYYY-MM-DD fixes the day; --assets <dir> writes elsewhere than src/assets.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { stringify } from "yaml";
import { parseLifecycle } from "../src/catalog/lifecycle.js";
import { proposalSummary, proposeCatalogue, readOpenRouterModels } from "../src/catalog/propose.js";
import { type Catalogue, catalogueSchema } from "../src/catalog/schema.js";
import { openRouterModelsSource, parseCatalogue } from "../src/catalog/store.js";

const { values } = parseArgs({
  options: {
    openrouter: { type: "string" },
    today: { type: "string" },
    assets: { type: "string" },
  },
});
const assets = values.assets ?? new URL("../src/assets/", import.meta.url).pathname;
const today = values.today ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`--today must be YYYY-MM-DD, not ${today}`);

async function listing(): Promise<unknown> {
  if (values.openrouter !== undefined) return JSON.parse(readFileSync(values.openrouter, "utf8"));
  const response = await fetch(openRouterModelsSource, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OpenRouter's model list answered ${String(response.status)}`);
  return response.json();
}

// The comment block at the top of a file is kept; the rest is written from the data.
function header(text: string): string {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("#")) break;
    lines.push(line);
  }
  return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
}

// The schema's defaults (enabled: true, deprecated: false) are left out, as the hand-kept file
// leaves them out, so the PR shows only what changed.
function lean(catalogue: Catalogue): unknown {
  const row = <
    T extends { provider: string; id: string; name: string; enabled: boolean; deprecated: boolean },
  >(
    model: T,
  ) => {
    const { provider, id, name, enabled, deprecated, ...rest } = model;
    return {
      provider,
      id,
      name,
      ...(enabled ? {} : { enabled }),
      ...(deprecated ? { deprecated } : {}),
      ...rest,
    };
  };
  return {
    ...catalogue,
    llm: catalogue.llm.map(row),
    image: catalogue.image.map(row),
    tts: catalogue.tts.map(row),
  };
}

function write(path: string, text: string): void {
  writeFileSync(`${path}.next`, text);
  renameSync(`${path}.next`, path);
}

const cataloguePath = join(assets, "models.yaml");
const lifecyclePath = join(assets, "models-lifecycle.yaml");
const catalogueText = readFileSync(cataloguePath, "utf8");
const lifecycleText = readFileSync(lifecyclePath, "utf8");
const openRouter = readOpenRouterModels(await listing());
if (openRouter.length === 0) throw new Error("OpenRouter's model list could not be read");
const proposal = proposeCatalogue(
  {
    // Strict v1, exactly as installed versions read it; the CLI rows it drops are never in
    // the published file.
    catalogue: catalogueSchema.parse(parseCatalogue(catalogueText)),
    lifecycle: parseLifecycle(lifecycleText),
  },
  { openRouter, today },
);
if (proposal.changed) {
  const nextCatalogue = `${header(catalogueText)}${stringify(lean(proposal.catalogue))}`;
  const nextLifecycle = `${header(lifecycleText)}${stringify(proposal.lifecycle)}`;
  // Both are read back with the same schemas an installed Slopify uses before anything is
  // written: a proposal an older install would refuse never reaches the PR.
  parseCatalogue(nextCatalogue);
  parseLifecycle(nextLifecycle);
  write(cataloguePath, nextCatalogue);
  write(lifecyclePath, nextLifecycle);
}
console.log(proposal.changed ? proposalSummary(proposal) : "Models: no changes");
