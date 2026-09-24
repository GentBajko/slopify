---
host_cli_verified_at_commit: 9bd6517
absorbed_from:
  - features/2026-09-24-host-cli-bridge@2026-09-24
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
generated_date: '2026-09-13'
content_hash: cdabf2573a8d
paths_covered:
  - :(top)packages/app/src/catalog/**
  - :(top)packages/app/src/assets/models.yaml
  - :(top)packages/app/src/adapters/**
  - :(top)packages/app/src/edge/http/providers.ts
  - :(top)packages/web/src/components/catalogue.tsx
---

# Model catalogue reload and thinking controls

## Trigger & preconditions

- Trigger: settings or planning loads provider models, or the user requests catalogue refresh.
- Preconditions: bundled `packages/app/src/assets/models.yaml` exists and parses against the catalogue schema.

## Steps

1. `createCatalogueStore` seeds `<data-dir>/models.yaml` from the bundled file and keeps parsed state in memory (`packages/app/src/catalog/store.ts:24-35`).
2. Reads detect local mtime/size changes; invalid or oversized YAML retains the last valid catalogue and sets a warning (`packages/app/src/catalog/store.ts:38-52`).
3. Refresh fetches the pinned GitHub raw source with a 15-second timeout, bounds the body to 1 MiB, parses it, writes `.previous`, atomically renames `.next`, and updates status (`packages/app/src/catalog/store.ts:54-92`).
4. `catalogue.models` returns only enabled, non-deprecated models; provider routes expose status and model choices (`packages/app/src/catalog/store.ts:88`, `packages/app/src/edge/http/providers.ts:38`).
5. YAML entries carry provider/model IDs, search keywords and pricing. Family-specific fields describe LLM context/search/thinking settings, image aspect ratios, TTS request limits/streaming, and per-provider concurrency from one validated schema (`packages/app/src/catalog/schema.ts:5`, `packages/app/src/catalog/schema.ts:25`, `packages/app/src/catalog/schema.ts:48`, `packages/app/src/catalog/schema.ts:58`, `packages/app/src/catalog/schema.ts:69`).
6. The registry rejects disabled models, unsupported web search/thinking/aspect ratio and oversized new narration requests before invoking the adapter. Retrieval of an already accepted TTS continuation remains allowed (`packages/app/src/catalog/registry.ts:7`, `packages/app/src/catalog/registry.ts:40`, `packages/app/src/catalog/registry.ts:63`, `packages/app/src/catalog/registry.ts:79`).

## Branches

- Valid local catalogue replaces the current value; failed refresh leaves the prior valid value and returns a visible HTTP error (`packages/app/src/catalog/store.ts:76-92`).
- API-provider choices come from the YAML catalogue. CLI providers bypass YAML and use installed-CLI discovery; Docker invokes the same readers on the host, retaining exact IDs, names, groups and thinking choices. The existing five-minute app model cache, refresh and stale-response protection remain. No CLI model catalogue is hardcoded into the bridge (`packages/app/src/host-cli/runtime.ts:31`, `packages/app/src/adapters/host-cli/index.ts:81`, `packages/app/src/catalog/registry.ts:26`).
- Saved model IDs may remain visible in the picker, but disabled/unknown IDs are rejected before new calls (`packages/app/src/catalog/validate.ts:35`).

## Unhappy paths

- Network, parse, schema, or size failure does not erase the last valid catalogue (`packages/app/src/catalog/store.ts:48-52,59-70`).
- Unsupported thinking is rejected by catalogue validation before the provider call (`packages/app/src/catalog/registry.ts:49`); it is not silently converted to “off”.

## State transitions

`bundled/local valid → refreshed valid`; `refresh failure → prior valid + HTTP error`. Model choice is selected ID plus provider/family; thinking is request configuration.

## Invariants

- Catalogue writes are atomic and bounded.
- Deprecated or disabled entries are excluded from `catalogue.models`.
- Thinking choices and adapter-specific mappings come from the selected model's validated catalogue entry; unsupported modes are not silently substituted (`packages/app/src/catalog/registry.ts:48`).

## Outcomes & side effects

Refresh performs one network fetch and local file writes; model listing is read-only. A successful model call records actual provider usage through the stage telemetry path.

## Dimensions not in play

- No provider generation occurs during catalogue refresh.
- No credentials are written into the catalogue file.

Descriptive scope: D2/D3 eligibility and input, D4 computation, D6 limits, D7 deadlines, D8 concurrency, D9 lifecycle, D10 recovery, D11 termination, D12 visibility, D14 related records, D15 persistence and D16 invariants are covered above and by the cited implementations. D1 has no multi-user authorization model: the app binds loopback by default. D5 does not implement billing or refunds; the estimate only approximates external provider charges. D13 has no outbound notification channel; failures/status are local UI/API responses. No separate durable audit of estimate views, catalogue edits, or queue-position changes is implemented.
