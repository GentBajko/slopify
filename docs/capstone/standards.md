---
generated_date: 2026-09-02
capstone_version: 5.2.0
---

> Standards the user set: binding, not a description of current code. `code-craft.md` governs everything left open here; no rule below overrides it.

# Standards

## Typing

- Compile with `strict: true`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` in every package.
- Never use `any`, non-null assertions (`!`), or `@ts-ignore`. Use `@ts-expect-error` only with a reason on the same line.
- Model finite sets as string-literal unions, never `enum`.
- Type structurally: ports and domain types are interfaces and type aliases; never nominal branding for its own sake.
- Annotate every exported function's parameters and return type; let internals infer.

## Libraries vs reinventing

- Follow the ladder: stdlib, then the platform, then an installed dependency, then the minimum code. Never add a dependency for what a few lines do.
- A new dependency must carry an MIT, Apache-2.0, BSD, or ISC licence, have had a release in the last 12 months, and have more than one maintainer or a surface small enough to replace in an afternoon.
- Hand-roll the ffmpeg argument builder and the `{{slot}}` parser.
- Never hand-roll request validation, HTTP handling, or date parsing.

## Paradigm

- Functional core, procedural shell: slices are pure functions over domain types; the runner, adapters, and edge orchestrate.
- Treat slice inputs as immutable: `readonly` types, no in-place mutation of arguments; return new values.
- No class inheritance. Use a class only to hold a provider adapter's client and configuration.
- Pass dependencies as function or constructor parameters from `main.ts`; no container, no service locator, no module-level singletons.

## Error handling

- Return typed result values for expected rule outcomes inside slices; throw only for bugs and infrastructure failures.
- Classify every provider error in the attempt wrapper and nowhere else; adapters throw typed errors the wrapper maps.
- Never swallow an error: every caught error is logged with the project id and stage kind, or rethrown.
- Never let a provider key appear in an error message, a log line, a response, or a telemetry payload.

## Organization

- Package by feature: one directory per vertical slice; inside it one file per concern (`model.ts`, `repo.ts`, `rules.ts`, `run.ts`) with tests beside the file they test.
- Keep files under about 300 lines; split by concern, never by line count alone.
- Name files kebab-case, values camelCase, types PascalCase.
- Comment only constraints the code cannot show; no narration, no doc-comments on internals.

## Testing

- Write the failing test first, then the minimum code to green, then verify, then commit.
- Prefer fakes over mocks at the three ports; never mock past a module's interface.
- Every branch and unhappy path of every logic scenario has a test; trivial one-liners have none.
- No coverage percentage target.
- Run unit tests on every save locally; run the integration suite and the end-to-end smoke in CI.

## Tooling

- One formatter and one linter, the linter carrying the kernel → slices → edge import-boundary rule; both run as a pre-commit hook and in CI.
- Typecheck in CI on Node 26. The exact tools are recorded by `stack`.

## Process

- Branch per unit of work as `<type>/<slug>`; commit as `<type>(<scope>): <subject>` with a body that says why; one reviewable idea per commit; never a broken commit; no tool attributions or generated-by trailers.
- Solo project: pull requests are optional; `main` is protected by CI only.

## Agent rules

An AI assistant working in this repository must:

- never store, print, or echo a provider key, in code, logs, tests, or chat;
- never add a dependency without stating which ladder rung failed;
- never widen a port's interface for a single adapter's convenience;
- never call a provider outside the attempt wrapper;
- never edit or reorder existing entries in `docs/capstone/changelog.md`;
- always run the tests before claiming a task done.

## Ruled out

- A licence that charges companies and not individuals: withdrawn; MIT stands. PolyForm Small Business 1.0.0, BSL 1.1 with an Additional Use Grant, and AGPL + commercial were the options examined.
