import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, problemAnswer, renderApp, testDeps } from "@/test-app";
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
          {
            id: "a2",
            projectId: null,
            scheduleId: null,
            tool: "update_settings",
            title: "Change settings",
            revisionId: null,
            createdAt: "2026-09-10T08:02:00.000Z",
            subject: null,
            actor: "assistant",
          },
        ],
      }),
    }),
  );
  expect(await screen.findByText(/^Last connected /)).toBeTruthy();
  expect(screen.getByText(/Approve selected topics · Harbor tales/)).toBeTruthy();
  expect(screen.queryByText(/Harbor tales · by assistant/)).toBeNull();
  expect(screen.getByText(/Change settings · by assistant/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Copy the Claude Code setup" }));
  expect(writeText).toHaveBeenCalledWith(
    "claude mcp add --transport http slopify http://slopify.test/mcp",
  );
});

it("says the agents didn't load, with Retry, instead of an empty list", async () => {
  const user = userEvent.setup();
  let fail = true;
  renderApp(
    <AgentSettings />,
    testDeps({
      "GET /api/settings/agents": (request) =>
        fail
          ? problemAnswer("The agent actions table could not be read.", 500)(request)
          : jsonAnswer({ lastConnectedAt: null, recent: [] })(request),
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain("Agent activity didn't load");
  expect(screen.getByRole("alert").textContent).toContain(
    "The agent actions table could not be read.",
  );
  expect(screen.queryByText("No agent has changed anything yet.")).toBeNull();
  expect(screen.queryByText("No agent has connected yet.")).toBeNull();
  fail = false;
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No agent has connected yet.")).toBeTruthy();
  expect(screen.getByText("No agent has changed anything yet.")).toBeTruthy();
});

it("shows placeholders while it checks for agents", () => {
  renderApp(
    <AgentSettings />,
    testDeps({ "GET /api/settings/agents": () => new Promise<Response>(() => undefined) }),
  );
  expect(screen.getByRole("status", { name: "Loading agent activity…" })).toBeTruthy();
});

it("says the setup wasn't copied when the browser blocks the clipboard", async () => {
  const writeText = vi.fn(async () => {
    throw new Error("NotAllowedError");
  });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  renderApp(
    <AgentSettings />,
    testDeps({ "GET /api/settings/agents": jsonAnswer({ lastConnectedAt: null, recent: [] }) }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Copy the Codex setup" }));
  expect(
    await screen.findByText(
      "The Codex setup wasn't copied: this browser blocked the clipboard. Select the line and copy it yourself.",
    ),
  ).toBeTruthy();
});

it("on a page opened through the remote address, shows the address agents use on the computer itself", async () => {
  renderApp(
    <AgentSettings />,
    testDeps({
      "GET /api/settings/agents": jsonAnswer({ lastConnectedAt: null, recent: [] }),
      "GET /api/settings/remote-access": jsonAnswer({
        available: true,
        enabled: true,
        state: "on",
        address: "https://box.tail1234.ts.net",
        httpsPort: 443,
        suggestedPort: null,
        summary: "On.",
        fix: null,
        link: null,
        local: "http://127.0.0.1:6969",
        changeable: false,
      }),
    }),
  );
  expect(await screen.findByText("http://127.0.0.1:6969/mcp")).toBeTruthy();
  expect(
    screen.getByText(
      "Agents connect on the computer Slopify runs on, never through the remote address: this is the address there.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByText("claude mcp add --transport http slopify http://127.0.0.1:6969/mcp"),
  ).toBeTruthy();
});
