import type { FieldError } from "@app/slices/admission/rules.js";

// One concern: turning a `Response` into a value or into the Error the query library's
// error channel carries. `api.ts` and `project/api.ts` both answer the same server, so
// they read a refusal the same way and neither invents a sentence of its own.

// RFC 9457 as `edge/http/problem.ts` writes it, with the `fields` extension member the
// admission rules add.
export interface Problem {
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly fields?: readonly FieldError[];
}

// A refused save is an expected outcome, so it comes back as a value carrying the
// server's own `fields[]` for the editor to mark. One type for prompts and entries, because
// they share one rule set and `edge/http/entries.ts` reuses the prompt routes' refusal
// mapping.
export type SaveResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly fields: readonly FieldError[] };

export async function read<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw await failure(response);
  }
  return (await response.json()) as T;
}

// A file served by `/files/...`, read as text: the research notes, the article, the
// sources and glossary, and the instructions behind each stage's toggle. Nothing on the
// project page reads a file any other way.
export async function readText(response: Response): Promise<string> {
  if (!response.ok) {
    throw await failure(response);
  }
  return await response.text();
}

export async function saved<T>(response: Response): Promise<SaveResult<T>> {
  if (response.ok) {
    return { ok: true, value: (await response.json()) as T };
  }
  const problem = await problemOf(response);
  const fields = problem?.fields ?? [];
  // 400 marks the lint that got past the editor, 409 the name the unique index refused. Both
  // name their fields; anything else is a fault and throws.
  if ((response.status === 400 || response.status === 409) && fields.length > 0) {
    return { ok: false, fields };
  }
  throw errorOf(response, problem);
}

// React Query's error channel is an Error, so an expected failure crosses into it as
// one. The problem's own `detail` is the sentence the server wrote for the user; nothing
// is invented here and nothing is swallowed.
export async function failure(response: Response): Promise<Error> {
  return errorOf(response, await problemOf(response));
}

// Split from `failure` so a caller that already read the problem document to decide
// whether the outcome was expected can still raise the same error for one that was not:
// a response body may be read only once.
export function errorOf(response: Response, problem: Problem | undefined): Error {
  if (problem === undefined) {
    return new Error(`The app answered ${String(response.status)} with no problem document.`);
  }
  const fields = problem.fields ?? [];
  const listed = fields.map((field) => `${field.field}: ${field.message}`).join("; ");
  const detail = problem.detail ?? problem.title;
  return new Error(listed === "" ? detail : `${detail} ${listed}`);
}

export async function problemOf(response: Response): Promise<Problem | undefined> {
  if (!(response.headers.get("content-type") ?? "").includes("problem+json")) {
    return undefined;
  }
  return (await response.json()) as Problem;
}
