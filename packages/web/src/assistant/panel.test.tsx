import { act, cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { EventSourceLike } from "@/events";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";
import type { AssistantSession, AssistantView } from "./api";
import { AssistantPanel } from "./panel";
import { AssistantScreenProvider } from "./screen";

afterEach(cleanup);

const available = (session: AssistantSession | null): AssistantView => ({
  available: true,
  cli: "claude-code",
  reason: null,
  fix: null,
  preference: "auto",
  ready: ["claude-code"],
  session,
});

const message = (
  id: string,
  role: AssistantSession["messages"][number]["role"],
  text: string,
  meta: Record<string, string> = {},
) => ({
  id,
  sessionId: "s1",
  turnId: "t1",
  role,
  text,
  meta,
  createdAt: "2026-10-18T10:00:00.000Z",
});

// A live stream the test writes to.
function liveEvents() {
  const listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  const open = (): EventSourceLike => ({
    addEventListener: (type: string, listener: (event: MessageEvent<string>) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    close: () => undefined,
  });
  const emit = (event: { readonly type: string; readonly [field: string]: unknown }) => {
    for (const listener of listeners.get(event.type) ?? [])
      listener({ data: JSON.stringify(event) } as MessageEvent<string>);
  };
  return { open, emit };
}

function mount(routes: Record<string, Answer>, events = liveEvents()) {
  const deps = { ...testDeps(routes), openEvents: events.open };
  renderRouted(
    <AssistantScreenProvider>
      <AssistantPanel open onClose={() => undefined} />
    </AssistantScreenProvider>,
    deps,
  );
  return events;
}

describe("AssistantPanel", () => {
  it("says first what it does, then what it runs on, with no choice to make and nothing to start over", async () => {
    mount({ "GET /api/assistant": jsonAnswer(available(null)) });
    const runs = await screen.findByText(
      "Runs on your Claude Code plan · it uses only Slopify's tools and guide",
    );
    const what = screen.getByText(/^Ask how something in Slopify works/);
    expect(what.textContent).toContain(
      "It asks you first before anything that costs money or removes something.",
    );
    expect(what.compareDocumentPosition(runs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // One CLI ready: nothing to choose. No chat yet: nothing to start over.
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send" })).toHaveProperty("disabled", true);
  });

  it("offers Answer with, labelled and explained, when Claude Code and Codex are both ready", async () => {
    const picked: unknown[] = [];
    mount({
      "GET /api/assistant": jsonAnswer({ ...available(null), ready: ["claude-code", "codex"] }),
      "PUT /api/assistant/cli": async (request) => {
        picked.push(await request.json());
        return jsonAnswer({ preference: "codex" })(request);
      },
    });
    const select = await screen.findByRole("combobox", { name: "Answer with" });
    expect(select.getAttribute("aria-describedby")).not.toBeNull();
    expect(screen.getByText(/^Auto uses Claude Code when it is ready, else Codex/)).toBeTruthy();
    await userEvent.selectOptions(select, "codex");
    await waitFor(() => expect(picked).toEqual([{ preference: "codex" }]));
  });

  it("keeps Answer with while the saved choice can't answer, so Auto is one pick away", async () => {
    mount({
      "GET /api/assistant": jsonAnswer({ ...available(null), preference: "codex" }),
    });
    expect(await screen.findByRole("combobox", { name: "Answer with" })).toBeTruthy();
  });

  it("explains why it can't start, with the fix, and can't be sent to", async () => {
    mount({
      "GET /api/assistant": jsonAnswer({
        ...available(null),
        available: false,
        cli: null,
        reason:
          "The assistant runs on Claude Code or Codex, and neither is ready on this computer. Set up Claude Code or Codex in Settings → Providers.",
        fix: { kind: "settings", section: "providers", label: "Open Settings → Providers" },
      }),
    });
    expect(await screen.findByText("The assistant can't start")).toBeTruthy();
    expect(screen.getByText(/neither is ready on this computer/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Settings → Providers" })).toBeTruthy();
    expect(screen.getByRole("textbox")).toHaveProperty("disabled", true);
  });

  it("starts a chat on the first message and sends what the page shows", async () => {
    const sent: unknown[] = [];
    mount({
      "GET /api/assistant": jsonAnswer(available(null)),
      "POST /api/assistant/sessions": jsonAnswer(
        { session: { id: "s1", messages: [], asks: [], runningTurnId: null } },
        201,
      ),
      "POST /api/assistant/sessions/s1/messages": async (request) => {
        sent.push(await request.json());
        return jsonAnswer({ turnId: "t1" }, 202)(request);
      },
    });
    await screen.findByText(/Runs on your Claude Code plan/);
    const box = screen.getByRole("textbox");
    await waitFor(() => expect(box).toHaveProperty("disabled", false));
    await userEvent.type(box, "Which templates do I have?{Enter}");
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({ text: "Which templates do I have?", screen: { path: "/" } });
    await waitFor(() => expect((box as HTMLTextAreaElement).value).toBe(""));
  });

  it("shows the answer as it streams, the tools it used, and Stop while it runs", async () => {
    let stopped = false;
    const events = mount({
      "GET /api/assistant": jsonAnswer(
        available({
          id: "s1",
          messages: [
            message("m1", "person", "Which templates?"),
            message("m2", "tool", "list_templates", { tool: "list_templates" }),
          ],
          asks: [],
          runningTurnId: "t1",
        }),
      ),
      "POST /api/assistant/sessions/s1/stop": (request) => {
        stopped = true;
        return jsonAnswer({ stopped: true })(request);
      },
    });
    expect(await screen.findByText("Used list_templates")).toBeTruthy();
    // An answer is being written: nothing to start over from yet.
    expect(screen.queryByRole("button", { name: "New chat" })).toBeNull();
    act(() =>
      events.emit({ type: "assistant.delta", sessionId: "s1", turnId: "t1", text: "You have two" }),
    );
    expect(await screen.findByText("You have two")).toBeTruthy();
    act(() =>
      events.emit({
        type: "assistant.delta",
        sessionId: "other",
        turnId: "t9",
        text: "Not this chat",
      }),
    );
    expect(screen.queryByText(/Not this chat/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(stopped).toBe(true));
  });

  it("asks first with the cost, and answers with Allow or Don't", async () => {
    const answers: unknown[] = [];
    mount({
      "GET /api/assistant": jsonAnswer(
        available({
          id: "s1",
          messages: [
            message("m1", "person", "Remake it"),
            message(
              "m2",
              "ask",
              "Start a remake for “Rope”. This starts paid work: estimated at $0.40–$0.85.",
              {
                askId: "k1",
                tool: "start_rebuild",
              },
            ),
          ],
          asks: [
            {
              id: "k1",
              sessionId: "s1",
              tool: "start_rebuild",
              text: "Start a remake for “Rope”. This starts paid work: estimated at $0.40–$0.85.",
              state: "asked",
              createdAt: "2026-10-18T10:00:00.000Z",
              decidedAt: null,
            },
          ],
          runningTurnId: null,
        }),
      ),
      "POST /api/assistant/asks/k1": async (request) => {
        answers.push(await request.json());
        return jsonAnswer({ ask: { id: "k1", state: "denied" } })(request);
      },
    });
    expect(await screen.findByText(/estimated at \$0.40–\$0.85/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Don't" }));
    await waitFor(() => expect(answers).toEqual([{ answer: "deny" }]));
  });

  it("shows an answered ask without its buttons, and errors with their fix", async () => {
    mount({
      "GET /api/assistant": jsonAnswer(
        available({
          id: "s1",
          messages: [
            message("m0", "assistant", "You have **two** templates:\n\n- Weekly\n- Daily"),
            message("m1", "ask", "Delete a channel.", { askId: "k1" }),
            message(
              "m2",
              "error",
              'Claude Code is signed out. Run "claude auth login" in a terminal.',
              { kind: "cli" },
            ),
          ],
          asks: [
            {
              id: "k1",
              sessionId: "s1",
              tool: "delete_channel",
              text: "Delete a channel.",
              state: "denied",
              createdAt: "2026-10-18T10:00:00.000Z",
              decidedAt: "2026-10-18T10:01:00.000Z",
            },
          ],
          runningTurnId: null,
        }),
      ),
    });
    expect(await screen.findByText("Not allowed")).toBeTruthy();
    expect(screen.getByText("two").tagName).toBe("STRONG");
    expect(screen.getByText("Weekly").tagName).toBe("LI");
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("claude auth login");
    // A chat to start over from.
    expect(screen.getByRole("button", { name: "New chat" })).toBeTruthy();
  });
});
