import type { Context } from "hono";
import type { Actor } from "../../slices/agents/model.js";

// The MCP endpoint calls the API in-process with these as the request's bindings (`c.env`).
// No network request can set them (the Node server passes its own `{ incoming, outgoing }`),
// which is how a route knows an agent asked, not the person.
export const agentBindings = { actor: "agent" } as const;

export function actorOf(c: Context): Actor {
  const env: unknown = c.env;
  return typeof env === "object" && env !== null && "actor" in env && env.actor === "agent"
    ? "agent"
    : "person";
}
