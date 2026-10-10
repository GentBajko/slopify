// Agents: an AI agent (Claude Code, Codex, ...) driving Slopify through its MCP endpoint.
// Browser-safe: Settings → Connections → Agents (MCP) builds its setup lines from these.

export const actors = ["person", "agent"] as const;
export type Actor = (typeof actors)[number];

export const mcpPath = "/mcp";

export function mcpUrl(origin: string): string {
  return `${origin.replace(/\/+$/, "")}${mcpPath}`;
}

export function claudeAddCommand(url: string): string {
  return `claude mcp add --transport http slopify ${url}`;
}

// Codex reads MCP servers from ~/.codex/config.toml; a `url` makes it a Streamable HTTP one.
export function codexConfig(url: string): string {
  return `[mcp_servers.slopify]\nurl = "${url}"`;
}
