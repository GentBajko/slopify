import type {
  AssistantAsk,
  AssistantCliPreference,
  AssistantFix,
  AssistantMessage,
} from "@app/slices/assistant/model.js";
import { assistantCliNames } from "@app/slices/assistant/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleStopIcon, SendIcon, WrenchIcon } from "lucide-react";
import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { eventsUrl } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Drawer } from "@/components/kit/drawer";
import { Field, Select, Textarea } from "@/components/kit/field";
import { ButtonLink } from "@/components/kit/link";
import { LoadingBlock } from "@/components/kit/query-state";
import { Status } from "@/components/kit/status";
import { subscribeAssistant } from "@/events";
import { cn } from "@/lib/utils";
import {
  type AssistantView,
  answerAsk,
  assistantKey,
  assistantQuery,
  chooseCli,
  newChat,
  sendMessage,
  stopTurn,
} from "./api.js";
import { useAssistantScreen } from "./screen.js";

// The assistant panel: a chat on the person's own Claude Code or Codex that can only use
// Slopify's tools and guide. It opens over the page without moving it (`Drawer`), knows what
// the page shows, and anything costly or destructive waits on a card here with Allow and
// Don't. Its answer streams in on the page's one live connection.

const iconProps = { "aria-hidden": true, strokeWidth: 1.75 } as const;

function FixLink({ fix }: { readonly fix: AssistantFix }): ReactElement {
  return fix.kind === "settings" ? (
    <ButtonLink to="/settings" search={{ section: fix.section }} size="small">
      {fix.label}
    </ButtonLink>
  ) : (
    <ButtonLink to="/help/tutorials/$page" params={{ page: fix.page }} size="small">
      {fix.label}
    </ButtonLink>
  );
}

const answered: Readonly<Record<Exclude<AssistantAsk["state"], "asked">, string>> = {
  allowed: "Allowed",
  denied: "Not allowed",
  used: "Allowed · done",
  expired: "Expired: ask again so it can check the cost again",
};

function AskCard({
  ask,
  onAnswer,
  pending,
}: {
  readonly ask: AssistantAsk | undefined;
  readonly onAnswer: (answer: "allow" | "deny") => void;
  readonly pending: boolean;
}): ReactElement | null {
  if (ask === undefined) return null;
  return (
    <div
      className="flex flex-col gap-2 rounded-control border border-line p-3"
      data-ask={ask.state}
    >
      <p className="m-0 text-label font-medium text-ink-2">The assistant asks first</p>
      <p className="m-0 whitespace-pre-wrap">{ask.text}</p>
      {ask.state === "asked" ? (
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="small"
            disabled={pending}
            onClick={() => onAnswer("allow")}
          >
            Allow
          </Button>
          <Button
            variant="secondary"
            size="small"
            disabled={pending}
            onClick={() => onAnswer("deny")}
          >
            Don't
          </Button>
        </div>
      ) : (
        <p className="m-0 text-label text-ink-3">{answered[ask.state]}</p>
      )}
    </div>
  );
}

function Line({
  message,
  asks,
  onAnswer,
  answering,
}: {
  readonly message: AssistantMessage;
  readonly asks: ReadonlyMap<string, AssistantAsk>;
  readonly onAnswer: (askId: string, answer: "allow" | "deny") => void;
  readonly answering: boolean;
}): ReactElement {
  switch (message.role) {
    case "person":
      return (
        <li className="ml-8 self-end rounded-control bg-sunken px-3 py-2 whitespace-pre-wrap">
          {message.text}
        </li>
      );
    case "assistant":
      return (
        <li className={answerClass}>
          <Markdown remarkPlugins={[remarkGfm]}>{message.text}</Markdown>
        </li>
      );
    case "tool":
      return (
        <li className="flex items-center gap-2 text-label text-ink-3">
          <WrenchIcon {...iconProps} className="size-3.5" />
          {`Used ${message.text}`}
        </li>
      );
    case "ask": {
      const askId = message.meta.askId ?? "";
      return (
        <li>
          <AskCard
            ask={asks.get(askId)}
            pending={answering}
            onAnswer={(answer) => onAnswer(askId, answer)}
          />
        </li>
      );
    }
    case "error":
      return (
        <li
          className={cn(
            "text-label whitespace-pre-wrap",
            message.meta.kind === "stopped" ? "text-ink-3" : "text-danger",
          )}
          role={message.meta.kind === "stopped" ? undefined : "alert"}
        >
          {message.text}
        </li>
      );
  }
}

// The model answers in Markdown; lists and emphasis are drawn small, in the chat's own type.
const answerClass =
  "mr-4 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:m-0 [&_p+p]:mt-2 [&_code]:font-mono [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5";

function runsOn(view: AssistantView | undefined): string {
  if (view?.cli === null || view?.cli === undefined)
    return "Runs on your Claude Code or Codex plan";
  return `Runs on your ${assistantCliNames[view.cli]} plan`;
}

// "Answer with" is a choice only when two CLIs could answer, or when the saved choice is one
// that can't, so the person can go back to Auto.
function choosable(view: AssistantView | undefined): boolean {
  if (view === undefined) return false;
  return (
    view.ready.length > 1 || (view.preference !== "auto" && !view.ready.includes(view.preference))
  );
}

export function AssistantPanel({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement | null {
  const { api, openEvents } = useApp();
  const client = useQueryClient();
  const screen = useAssistantScreen();
  const view = useQuery({ ...assistantQuery(api), enabled: open });
  const session = view.data?.session ?? null;
  const [draft, setDraft] = useState("");
  const [writing, setWriting] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const bottom = useRef<HTMLLIElement>(null);
  const sessionId = session?.id;
  const running = session?.runningTurnId !== null && session?.runningTurnId !== undefined;

  useEffect(() => {
    if (!open) return;
    const refresh = (): void => {
      void client.invalidateQueries({ queryKey: assistantKey });
    };
    return subscribeAssistant(openEvents, eventsUrl(api, "global"), {
      refetch: refresh,
      event: (event) => {
        if (event.sessionId !== sessionId) return;
        if (event.type === "assistant.delta") {
          setWriting((text) => text + event.text);
          return;
        }
        if (event.type !== "assistant.ask") setWriting("");
        refresh();
      },
    });
  }, [api, openEvents, client, open, sessionId]);

  const messageCount = session?.messages.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when a message or text arrives.
  useEffect(() => {
    bottom.current?.scrollIntoView?.({ block: "end" });
  }, [messageCount, writing]);

  const send = useMutation({
    mutationFn: async (text: string) => {
      const id = sessionId ?? (await newChat(api)).session.id;
      return sendMessage(api, id, text, screen);
    },
    onMutate: () => setFailure(null),
    onSuccess: () => {
      setDraft("");
      setWriting("");
    },
    onError: (error) => setFailure(`Your message wasn't sent: ${error.message}`),
    onSettled: () => client.invalidateQueries({ queryKey: assistantKey }),
  });
  const stop = useMutation({
    mutationFn: async () => (sessionId === undefined ? undefined : stopTurn(api, sessionId)),
    onError: (error) => setFailure(`Stop didn't reach Slopify: ${error.message} Press Stop again.`),
    onSettled: () => client.invalidateQueries({ queryKey: assistantKey }),
  });
  const fresh = useMutation({
    mutationFn: () => newChat(api),
    onSuccess: () => {
      setWriting("");
      setFailure(null);
    },
    onError: (error) => setFailure(`Couldn't start a new chat: ${error.message}`),
    onSettled: () => client.invalidateQueries({ queryKey: assistantKey }),
  });
  const answer = useMutation({
    mutationFn: ({ askId, choice }: { askId: string; choice: "allow" | "deny" }) =>
      answerAsk(api, askId, choice),
    onError: (error) => setFailure(`Your answer wasn't saved: ${error.message}`),
    onSettled: () => client.invalidateQueries({ queryKey: assistantKey }),
  });
  const pick = useMutation({
    mutationFn: (preference: AssistantCliPreference) => chooseCli(api, preference),
    onError: (error) => setFailure(`The choice wasn't saved: ${error.message}`),
    onSettled: () => client.invalidateQueries({ queryKey: assistantKey }),
  });

  const asks = new Map((session?.asks ?? []).map((ask) => [ask.id, ask]));
  const available = view.data?.available === true;
  const text = draft.trim();
  const submit = (): void => {
    if (text === "" || running || send.isPending || !available) return;
    send.mutate(text);
  };
  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Assistant"
      width="narrow"
      footer={
        <form
          className="flex w-full items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label={<span className="sr-only">Message</span>} className="min-w-0 flex-1">
            <Textarea
              rows={2}
              value={draft}
              maxLength={4000}
              placeholder="Ask about Slopify or your work"
              disabled={!available}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKey}
            />
          </Field>
          {running ? (
            <Button
              type="button"
              variant="secondary"
              disabled={stop.isPending}
              onClick={() => stop.mutate()}
            >
              <CircleStopIcon {...iconProps} />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              disabled={text === "" || send.isPending || !available}
            >
              <SendIcon {...iconProps} />
              Send
            </Button>
          )}
        </form>
      }
    >
      <div className="flex min-h-full flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="m-0">
            Ask how something in Slopify works, or ask it to do something on this screen. It asks
            you first before anything that costs money or removes something.
          </p>
          <p className="m-0 text-label text-ink-3">
            {`${runsOn(view.data)} · it uses only Slopify's tools and guide`}
          </p>
        </div>
        {choosable(view.data) ? (
          <Field
            label="Answer with"
            help="Auto uses Claude Code when it is ready, else Codex. Either runs on your own plan, never on a project's cost."
          >
            <Select
              value={view.data?.preference ?? "auto"}
              disabled={pick.isPending}
              onChange={(event) => pick.mutate(event.target.value as AssistantCliPreference)}
            >
              <option value="auto">Auto</option>
              <option value="claude-code">Claude Code</option>
              <option value="codex">Codex</option>
            </Select>
          </Field>
        ) : null}
        {view.data !== undefined && !view.data.available && view.data.reason !== null ? (
          <Callout
            tone="waiting"
            title="The assistant can't start"
            actions={view.data.fix === null ? undefined : <FixLink fix={view.data.fix} />}
          >
            {view.data.reason}
          </Callout>
        ) : null}
        {view.isError ? (
          <Callout tone="danger" title="The chat couldn't be read">
            {`${view.error.message} Close the assistant and open it again.`}
          </Callout>
        ) : null}
        <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Chat" aria-live="polite">
          {view.isPending ? (
            <li>
              <LoadingBlock label="Opening the chat…" rows={2} rowClassName="h-10" />
            </li>
          ) : null}
          {session?.messages.map((message) => (
            <Line
              key={message.id}
              message={message}
              asks={asks}
              answering={answer.isPending}
              onAnswer={(askId, choice) => answer.mutate({ askId, choice })}
            />
          ))}
          {running ? (
            <li className="mr-4 flex flex-col gap-1">
              {writing === "" ? null : <span className="whitespace-pre-wrap">{writing}</span>}
              <Status tone="running">Working…</Status>
            </li>
          ) : null}
          <li ref={bottom} aria-hidden="true" />
        </ol>
        {failure === null ? null : (
          <p className="m-0 text-label text-danger" role="alert">
            {failure}
          </p>
        )}
        {/* Starting over is offered once there is a chat to start over from, and not while an
            answer is being written. */}
        {session === null || session.messages.length === 0 || running ? null : (
          <Button
            variant="quiet"
            size="small"
            className="self-start"
            disabled={fresh.isPending}
            onClick={() => fresh.mutate()}
          >
            New chat
          </Button>
        )}
      </div>
    </Drawer>
  );
}
