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
    return new Error(unexplained(response.status));
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

// Said when the browser could not reach the server at all: the app stopped, its container is
// restarting, or an update is replacing it. The request never got an answer to explain.
export const unreachable =
  "Slopify isn't responding. If you're running it in Docker, check the container is running, then reload this page.";

// A reply that is not the server's own problem document: a gateway in front of a stopped app,
// or a fault that escaped before the server could write a sentence for it.
function unexplained(status: number): string {
  if (status === 502 || status === 503 || status === 504) {
    return unreachable;
  }
  return `Slopify hit an unexpected error (${String(status)}). Reload the page and try again. If it keeps happening, open Settings and use Download diagnostics.`;
}

// `fetch` rejects with a bare TypeError ("Failed to fetch", "Load failed", "NetworkError ...")
// when nothing answered. The error stays a TypeError so callers that tell a lost connection from
// a refusal still can; only its sentence changes. Aborts are DOMExceptions and pass through.
export function reachingFetch(inner: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      return await inner(input, init);
    } catch (cause) {
      if (cause instanceof TypeError) {
        throw new TypeError(unreachable, { cause });
      }
      throw cause;
    }
  };
}

// Joins a message that may or may not end in a full stop to the sentence that follows it.
export function sentence(message: string): string {
  const trimmed = message.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

// Said when a reply arrived but is not shaped the way this page expects, which in practice
// means the tab is older than the server that answered it (an update landed while it was open).
export const unrecognised =
  "Slopify answered in a way this page doesn't understand, usually because Slopify was updated while the page was open. Reload the page and try again.";

// Parses a successful reply, turning a schema mismatch into the sentence above rather than a
// dump of validation paths. The original error stays on `cause` for the console.
export function understood<T>(schema: { parse: (raw: unknown) => T }, raw: unknown): T {
  try {
    return schema.parse(raw);
  } catch (cause) {
    throw new Error(unrecognised, { cause });
  }
}
