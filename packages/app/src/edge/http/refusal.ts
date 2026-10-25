import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { problem } from "./problem.js";

export interface RefusalRules<Reason extends string> {
  readonly statuses: Readonly<Partial<Record<Reason, ContentfulStatusCode>>>;
  readonly otherwise: ContentfulStatusCode;
  readonly detail: string | undefined;
  readonly extensions?: Readonly<Record<string, unknown>> | undefined;
}

export function refusal<Reason extends string>(
  c: Context,
  reason: Reason,
  rules: RefusalRules<Reason>,
): Response {
  return problem(c, {
    status: rules.statuses[reason] ?? rules.otherwise,
    detail: rules.detail,
    extensions: { reason, ...rules.extensions },
  });
}

export function revisionRequired(c: Context): Response {
  return problem(c, {
    status: 409,
    detail:
      "This change is now made in Edit settings: save it there, then use Choose what to remake (in the project's More menu).",
    extensions: { reason: "revision-required" },
  });
}

// A build without its bundled files says so in plain words; anything else is the app's error handler's.
export function bundleMissing(
  c: Context,
  error: unknown,
  Missing: abstract new (...args: never[]) => Error,
): Response {
  if (!(error instanceof Missing)) throw error;
  return problem(c, { status: 500, detail: error.message });
}

export async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
