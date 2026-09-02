import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";

export interface ProblemInit {
  readonly status: ContentfulStatusCode;
  readonly title: string;
  readonly type?: string | undefined;
  readonly detail?: string | undefined;
  readonly extensions?: Readonly<Record<string, unknown>> | undefined;
}

export interface ProblemDeps {
  readonly ids: Ids;
  readonly log: Log;
}

const titles: Readonly<Record<number, string>> = {
  400: "Bad Request",
  404: "Not Found",
  409: "Conflict",
  500: "Internal Server Error",
};

export function problem(c: Context, init: ProblemInit): Response {
  const body: Record<string, unknown> = {
    // Extensions go first so a route cannot shadow a member RFC 9457 reserves.
    ...init.extensions,
    type: init.type ?? "about:blank",
    title: init.title,
    status: init.status,
    ...(init.detail === undefined ? {} : { detail: init.detail }),
    instance: c.req.path,
  };
  return c.body(JSON.stringify(body), init.status, {
    "content-type": "application/problem+json",
  });
}

export function problemFromError(c: Context, error: Error, deps: ProblemDeps): Response {
  if (error instanceof HTTPException) {
    return problem(c, {
      status: error.status,
      title: titleOf(error.status),
      detail: error.message === "" ? undefined : error.message,
    });
  }
  // An unexpected exception can carry a provider's response text, and that text can
  // carry the key that was sent. Only the correlation id crosses to the client; the
  // message goes to the log, which redacts key-shaped strings.
  const correlationId = deps.ids.next();
  deps.log.write("error", "http.error", {
    detail: `${correlationId} ${c.req.method} ${c.req.path}: ${error.message}`,
  });
  return problem(c, {
    status: 500,
    title: titleOf(500),
    detail: `The server failed to handle this request. Correlation id ${correlationId} is in the log.`,
    extensions: { correlationId },
  });
}

export function titleOf(status: number): string {
  return titles[status] ?? "Error";
}
