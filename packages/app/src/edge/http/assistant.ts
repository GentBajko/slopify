import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import type { RunAllowedCall } from "../../slices/assistant/access.js";
import {
  assistantCliPreferences,
  assistantScreenSchema,
  assistantTextMax,
} from "../../slices/assistant/model.js";
import { setCliPreference } from "../../slices/assistant/repo.js";
import type { Assistant } from "../../slices/assistant/turn.js";
import { actorOf } from "./actor.js";
import type { AppDeps } from "./app.js";
import { idParam } from "./ids.js";
import { onInvalid, problem } from "./problem.js";
import { hostOnlySentence } from "./remote-guard.js";
import { viaProxy } from "./same-page.js";

// The assistant panel's chat. The person's own: an agent or the assistant itself is refused
// here, so nothing but a press in the page answers an ask.

const messageBody = z
  .object({
    text: z
      .string()
      .trim()
      .min(1, "Write a message first.")
      .max(assistantTextMax, `Keep a message to ${String(assistantTextMax)} characters.`),
    screen: assistantScreenSchema.optional(),
  })
  .strict();
const answerBody = z.object({ answer: z.enum(["allow", "deny"]) }).strict();
const cliBody = z.object({ preference: z.enum(assistantCliPreferences) }).strict();

const notWired =
  "This copy of Slopify was started without the assistant. Restart Slopify, then open the assistant again.";

function personOnly(c: Context): Response | undefined {
  return actorOf(c) === "person"
    ? undefined
    : problem(c, {
        status: 403,
        detail:
          "The assistant's chat is the person's: only a press in Slopify's page sends a message or answers an ask.",
      });
}

export function assistantRoutes(
  deps: Pick<AppDeps, "assistant" | "db">,
  // On Allow, the asked call is made by Slopify itself (`edge/mcp/assistant.ts`).
  runAllowed?: RunAllowedCall,
) {
  const assistant = deps.assistant;
  const wired = (c: Context): Assistant | Response =>
    personOnly(c) ?? assistant ?? problem(c, { status: 503, detail: notWired });
  return new Hono()
    .get("/", async (c) => {
      const refused = personOnly(c);
      if (refused !== undefined) return refused;
      if (assistant === undefined)
        return c.json({
          available: false,
          cli: null,
          reason: notWired,
          fix: null,
          preference: "auto" as const,
          session: null,
        });
      const { choice, preference } = await assistant.status();
      return c.json({
        available: choice.ok,
        cli: choice.ok ? choice.cli : null,
        reason: choice.ok ? null : choice.reason,
        fix: choice.ok ? null : choice.fix,
        preference,
        session: assistant.session() ?? null,
      });
    })
    .post("/sessions", (c) => {
      const service = wired(c);
      if (service instanceof Response) return service;
      const id = service.newSession();
      return c.json({ session: service.session(id) }, 201);
    })
    .post(
      "/sessions/:id/messages",
      zValidator("param", idParam, onInvalid),
      zValidator("json", messageBody, onInvalid),
      (c) => {
        const service = wired(c);
        if (service instanceof Response) return service;
        const { text, screen } = c.req.valid("json");
        const sent = service.send(c.req.valid("param").id, text, screen);
        if (sent.ok) return c.json({ turnId: sent.turnId }, 202);
        return problem(c, {
          status: sent.reason === "unknown-session" ? 404 : 409,
          detail:
            sent.reason === "unknown-session"
              ? "This chat no longer exists. Press New chat and send your message again."
              : sent.reason === "busy"
                ? "The assistant is still answering in this chat. Wait for it, or press Stop, then send your message."
                : "Two assistant chats are answering already. Wait for one to finish, or press Stop in it, then send your message.",
          extensions: { reason: sent.reason },
        });
      },
    )
    .post("/sessions/:id/stop", zValidator("param", idParam, onInvalid), (c) => {
      const service = wired(c);
      if (service instanceof Response) return service;
      return c.json({ stopped: service.stop(c.req.valid("param").id) });
    })
    .post(
      "/asks/:id",
      zValidator("param", idParam, onInvalid),
      zValidator("json", answerBody, onInvalid),
      (c) => {
        // An Allow starts paid or removing work: it is pressed on this computer, or on the
        // person's own device through remote access, never by another account (`remote-guard.ts`).
        if (c.req.valid("json").answer === "allow" && viaProxy(c.req.raw.headers))
          return problem(c, {
            status: 403,
            detail: hostOnlySentence("The assistant's Allow is pressed"),
            extensions: { reason: "host-only" },
          });
        const service = wired(c);
        if (service instanceof Response) return service;
        const answered = service.answer(
          c.req.valid("param").id,
          c.req.valid("json").answer,
          runAllowed,
        );
        if (answered.ok) return c.json({ ask: answered.ask });
        return problem(c, {
          status: answered.reason === "unknown" ? 404 : 409,
          detail:
            answered.reason === "unknown"
              ? "This ask no longer exists. Ask the assistant again."
              : answered.reason === "expired"
                ? "This ask waited more than 15 minutes, so it expired before your answer. Ask the assistant again, so it can check the cost again."
                : "This ask was already answered.",
          extensions: { reason: answered.reason },
        });
      },
    )
    .put("/cli", zValidator("json", cliBody, onInvalid), (c) => {
      const refused = personOnly(c);
      if (refused !== undefined) return refused;
      const { preference } = c.req.valid("json");
      setCliPreference(deps.db, preference);
      return c.json({ preference });
    });
}
