import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { AgentSettings } from "./agent-settings";

afterEach(cleanup);

it("shows this install's MCP address, both setup lines, and that no agent connected yet", async () => {
  renderApp(
    <AgentSettings />,
    testDeps({ "GET /api/settings/agents": jsonAnswer({ lastConnectedAt: null, recent: [] }) }),
  );
  expect(await screen.findByText("No agent has connected yet.")).toBeTruthy();
  expect(screen.getByText("http://slopify.test/mcp")).toBeTruthy();
  expect(
    screen.getByText("claude mcp add --transport http slopify http://slopify.test/mcp"),
  ).toBeTruthy();
  expect(screen.getByText(/\[mcp_servers\.slopify\]/)).toBeTruthy();
});

it("says when an agent last connected, lists what agents did, and copies a setup line", async () => {
  const writeText = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderApp(
    <AgentSettings />,
    testDeps({
      "GET /api/settings/agents": jsonAnswer({
        lastConnectedAt: "2026-09-10T08:00:00.000Z",
        recent: [
          {
            id: "a1",
            projectId: null,
            scheduleId: "s1",
            tool: "approve_topics",
            title: "Approve selected topics",
            revisionId: null,
            createdAt: "2026-09-10T08:01:00.000Z",
            subject: "Harbor tales",
          },
        ],
      }),
    }),
  );
  expect(await screen.findByText(/^Last connected /)).toBeTruthy();
  expect(screen.getByText(/Approve selected topics · Harbor tales/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy the Claude Code setup" }));
  expect(writeText).toHaveBeenCalledWith(
    "claude mcp add --transport http slopify http://slopify.test/mcp",
  );
});
