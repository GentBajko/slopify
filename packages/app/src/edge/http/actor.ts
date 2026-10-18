import type { Context } from "hono";
import type { Actor } from "../../slices/agents/model.js";

// The MCP endpoint calls the API in-process with these as the request's bindings (`c.env`).
// No network request can set them (the Node server passes its own `{ incoming, outgoing }`),
// which is how a route knows an agent asked, not the person.
export const agentBindings = { actor: "agent" } as const;
// The in-app assistant's calls, through its own MCP endpoint (`/mcp/assistant`).
export const assistantBindings = { actor: "assistant" } as const;

export function actorOf(c: Context): Actor {
  const env: unknown = c.env;
  if (typeof env !== "object" || env === null || !("actor" in env)) return "person";
  return env.actor === "agent" || env.actor === "assistant" ? env.actor : "person";
}
