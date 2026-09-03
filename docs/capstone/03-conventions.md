---
generated_date: 2026-09-02
capstone_version: 5.2.0
paths_covered:
 - "packages/*/src/**"
 - "tsconfig*.json"
 - "eslint.config.*"
---

> Code-writing rules - typing strictness, error taxonomy, testing style, naming, what an AI
> must never do - live in `standards.md` and outrank this chapter. What follows is the
> architectural side: layering, boundaries, and the tooling that enforces them.

# Conventions

## Paradigm

Functional core, procedural shell: slices are modules of plain functions over domain types; the runner, adapters, and edge are procedural orchestration; no class hierarchies beyond what a port adapter needs to hold a client. Pure computation (substitution, chunking, split, render plan, status derivation) is separated from IO per `04-data-flow.md` Side-effect boundaries. Vertical slices, not layers within a slice.

## Typing

TypeScript everywhere. Strictness configuration, escape-hatch policy, and enum-vs-union rules: settled by `standards.md` (not yet written). Fixed here: domain types per slice `model.ts`; ports are behaviour-named interfaces with domain types only; API request and response shapes derive from Hono's route types so the SPA client is generated, never hand-typed.

## Error handling

- HTTP edge: RFC 9457 `application/problem+json` for every error; validation failures 400, missing resources 404, rule violations 409 with the rule named, unexpected 500 with a correlation id.
- Provider calls: the attempt wrapper classifies outcomes (`ok`, `error`, `timeout`, `refusal`, `aborted`) and stores the provider's verbatim text (`logic/01`); adapters throw typed errors the wrapper maps; refusals and unsupported capabilities are terminal, not retried.
- Slices signal rule violations with typed results the edge maps to 409; unexpected exceptions propagate to the edge's handler and are logged.
- Exceptions vs result types as a house style: `standards.md`.
- Logging: structured JSON lines to `<data-dir>/logs/`, daily rotation, warnings and errors mirrored to the terminal; every log line carries the project id and stage kind when known. Keys never appear in logs (`logic/02` invariants).

## Dependency injection

Composition root `packages/app/src/main.ts` constructs everything once and passes dependencies as constructor or function parameters. No container, no service locator, no globals; `process.env` is read once in `kernel/config`. Ports receive their adapter registry from settings at boot and re-read keys per attempt (`logic/02`). Tests inject fake adapters, clock, and ids the same way.

## Code standards

Lint and format tooling, review rules and commit conventions are `standards.md`'s. Fixed here: the import-boundary rule kernel → slices → edge, enforced by Biome's `noRestrictedImports`; CI runs lint, typecheck, tests on Node 26.
