import type {
  AssistantAsk,
  AssistantCli,
  AssistantCliPreference,
  AssistantFix,
  AssistantMessage,
  AssistantScreen,
} from "@app/slices/assistant/model.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read } from "@/http";

export interface AssistantSession {
  readonly id: string;
  readonly messages: readonly AssistantMessage[];
  readonly asks: readonly AssistantAsk[];
  readonly runningTurnId: string | null;
}

export interface AssistantView {
  readonly available: boolean;
  readonly cli: AssistantCli | null;
  readonly reason: string | null;
  readonly fix: AssistantFix | null;
  readonly preference: AssistantCliPreference;
  // The CLIs that could answer now; "Answer with" is offered only with two.
  readonly ready: readonly AssistantCli[];
  readonly session: AssistantSession | null;
}

export const assistantKey = ["assistant"] as const;

export function assistantQuery(api: Api) {
  return queryOptions({
    queryKey: assistantKey,
    queryFn: async () => read<AssistantView>(await api.fetch(`${api.origin}/api/assistant`)),
    staleTime: 30_000,
  });
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export async function newChat(api: Api): Promise<{ readonly session: AssistantSession }> {
  return read(await api.fetch(`${api.origin}/api/assistant/sessions`, { method: "POST" }));
}

export async function sendMessage(
  api: Api,
  sessionId: string,
  text: string,
  screen: AssistantScreen,
): Promise<{ readonly turnId: string }> {
  return read(
    await api.fetch(
      `${api.origin}/api/assistant/sessions/${encodeURIComponent(sessionId)}/messages`,
      json({ text, screen }),
    ),
  );
}

export async function stopTurn(
  api: Api,
  sessionId: string,
): Promise<{ readonly stopped: boolean }> {
  return read(
    await api.fetch(`${api.origin}/api/assistant/sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: "POST",
    }),
  );
}

export async function answerAsk(
  api: Api,
  askId: string,
  answer: "allow" | "deny",
): Promise<{ readonly ask: AssistantAsk }> {
  return read(
    await api.fetch(
      `${api.origin}/api/assistant/asks/${encodeURIComponent(askId)}`,
      json({ answer }),
    ),
  );
}

export async function chooseCli(
  api: Api,
  preference: AssistantCliPreference,
): Promise<{ readonly preference: AssistantCliPreference }> {
  return read(
    await api.fetch(`${api.origin}/api/assistant/cli`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preference }),
    }),
  );
}
