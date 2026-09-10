---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: e293a0b5e022
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/collector/**"
  - ":(top)packages/site/**"
---

# Model catalogue reload and thinking controls

## Trigger & preconditions

- Trigger: settings or planning loads provider models, or the user requests catalogue refresh.
- Preconditions: bundled `packages/app/src/assets/models.yaml` exists and parses against the catalogue schema.

## Steps

1. `createCatalogueStore` seeds `<data-dir>/models.yaml` from the bundled file and keeps parsed state in memory (`packages/app/src/catalog/store.ts:24-35`).
2. Reads detect local mtime/size changes; invalid or oversized YAML retains the last valid catalogue and sets a warning (`packages/app/src/catalog/store.ts:38-52`).
3. Refresh fetches the pinned GitHub raw source with a 15-second timeout, bounds the body to 1 MiB, parses it, writes `.previous`, atomically renames `.next`, and updates status (`packages/app/src/catalog/store.ts:54-92`).
4. `catalogue.models` returns only enabled, non-deprecated models; provider routes expose status and model choices (`packages/app/src/catalog/store.ts:88-92`; `packages/app/src/edge/http/providers.ts:38-70`).
5. LLM request construction forwards the selected thinking mode; OpenRouter maps effort to `reasoning.effort` (`packages/app/src/adapters/llm/openrouter.ts:65-78`). Gemini 3 uses thinking level; Gemini 2.5 uses thinking budget. Gemini 3.8 minimal is unsupported and Gemini 3.1 Pro cannot disable thinking (Google Gemini thinking documentation).

## Branches

- Valid local catalogue replaces the current value; failed refresh leaves the prior valid value and returns a visible HTTP error (`packages/app/src/catalog/store.ts:76-92`).
- Production choices come from the YAML catalogue; legacy discovery remains only when AppDeps has no catalogue (`packages/app/src/edge/http/providers.ts:61`).
- Saved model IDs may remain visible in the picker, but disabled/unknown IDs are rejected before new calls (`packages/app/src/catalog/validate.ts:35`).

## Unhappy paths

- Network, parse, schema, or size failure does not erase the last valid catalogue (`packages/app/src/catalog/store.ts:48-52,59-70`).
- Unsupported thinking is rejected by catalogue validation before the provider call (`packages/app/src/catalog/registry.ts:49`); it is not silently converted to “off”.

## State transitions

`bundled/local valid → refreshed valid`; `refresh failure → prior valid + HTTP error`. Model choice is selected ID plus provider/family; thinking is request configuration.

## Invariants

- Catalogue writes are atomic and bounded.
- Deprecated or disabled entries are excluded from `catalogue.models`.
- Thinking modes are model-specific; Gemini 3.8 does not use `thinkingBudget: 0` as a generic off switch.

## Outcomes & side effects

Refresh performs one network fetch and local file writes; model listing is read-only. A successful model call records actual provider usage through the stage telemetry path.

## Dimensions not in play

- No provider generation occurs during catalogue refresh.
- No credentials are written into the catalogue file.

Descriptive scope: D2/D3 eligibility and input, D4 computation, D6 limits, D7 deadlines, D8 concurrency, D9 lifecycle, D10 recovery, D11 termination, D12 visibility, D14 related records, D15 persistence and D16 invariants are covered above and by the cited implementations. D1 has no multi-user authorization model: the app binds loopback by default. D5 does not implement billing or refunds; the estimate only approximates external provider charges. D13 has no outbound notification channel; failures/status are local UI/API responses. No separate durable audit of estimate views, catalogue edits, or queue-position changes is implemented.
