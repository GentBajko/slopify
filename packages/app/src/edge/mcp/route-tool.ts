import { z } from "zod";

const routeMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
type RouteMethod = (typeof routeMethods)[number];

// One API route offered to agents as a tool. The route validates, refuses and answers exactly
// as it does for the web page; the tool only names it and says what its body carries.
export interface RouteTool {
  readonly name: string;
  // "POST /api/projects/:id/resume": the method and the path as the router declares it.
  readonly route: string;
  readonly title: string;
  readonly description: string;
  // The consequence the web page's confirm dialog states; the tool then needs confirmed: true.
  readonly confirm?: string;
  // The page's own wording of that consequence with this call's numbers: read from the GET
  // route the page reads (same path parameters), then put into words. Falls back to confirm.
  readonly confirmFrom?: {
    readonly route: string;
    readonly text: (value: unknown) => string | undefined;
  };
  // A POST that only looks, checks or prices (a preview, an estimate, a test send): it changes
  // nothing in Slopify, so it is not recorded as an agent's change.
  readonly unrecorded?: true;
  // It reaches outside Slopify, so the agent's client is told it is open-world: it only asks
  // there (a provider check, the published catalogue), or it sends something that really goes
  // out (a test message), which is no read-only call, recorded or not.
  readonly reachesOut?: "asks" | "sends";
  // A route that takes a file: multipart like the page's file pickers, or the bytes themselves.
  readonly upload?: "multipart" | "raw";
  // What the agent is shown instead of the route's own answer: state words added, or a
  // credential left out.
  readonly shape?: (value: unknown) => unknown;
}

// The base and key every project change carries, so a stale caller is refused instead of
// overwriting a newer version, and a retried request is answered once.
export const control =
  "Body: {baseRevisionId: the revisionId get_project returns, idempotencyKey: a new UUID, sent again only to retry this same request}.";

export function routeOf(tool: RouteTool): { readonly method: RouteMethod; readonly path: string } {
  const [method, path] = tool.route.split(" ");
  return {
    method: z.enum(routeMethods).parse(method),
    path: z.string().startsWith("/api/").parse(path),
  };
}

export function paramsOf(path: string): readonly string[] {
  return [...path.matchAll(/:(\w+)/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

// Every id, slug and kind a route takes is letters, digits, - and _ (ULIDs, UUIDs, pack slugs,
// stage kinds). Nothing else is let into a path: ".." would make the URL resolve to another route.
export const pathParam = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[0-9A-Za-z_-]+$/, "Use the id exactly as Slopify listed it: letters, digits, - and _.");

export const fileArg = z
  .object({
    name: z.string().min(1).max(255),
    contentType: z.string().min(1).max(255),
    base64: z.string().min(1),
  })
  .strict()
  .describe("The file: its name, its MIME type and its bytes in base64.");

export function formBody(screen: string): string {
  return `Body: the fields ${screen} sends; a wrong body is refused with every wrong field named.`;
}

export function inputShape(tool: RouteTool): Record<string, z.ZodType> {
  const { method, path } = routeOf(tool);
  return {
    ...Object.fromEntries(paramsOf(path).map((name) => [name, pathParam])),
    query: z
      .record(z.string(), z.string())
      .optional()
      .describe("Query parameters, when the description names any."),
    ...(method === "GET"
      ? {}
      : tool.upload === undefined
        ? {
            body: z
              .record(z.string(), z.unknown())
              .optional()
              .describe("The JSON body the description names."),
          }
        : { file: fileArg }),
    ...(tool.confirm === undefined
      ? {}
      : {
          confirmed: z
            .boolean()
            .optional()
            .describe("true once you accept the consequence the description states."),
        }),
  };
}
