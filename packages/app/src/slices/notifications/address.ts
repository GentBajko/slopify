import type { NoticeText } from "./rules.js";

// Where notifications go: the Notification URL, what it is sent, and the project's address in
// it. Pure: the web bundle imports this file.

export const testNotice: NoticeText = {
  headline: "Slopify test notification",
  detail:
    "Notifications work. You'll get one when a run finishes, fails or waits for you, and when a review needs your decision.",
};

// The body a Notification URL receives: plain text, which ntfy shows as the message. Nothing
// but the project's title, what happened and the provider's own short reason goes in it.
export function webhookBody(text: NoticeText): string {
  return `${text.headline}\n${text.detail}\n${text.link === undefined ? "" : `${text.link}\n`}`;
}

// Where a project opens in the browser, from the address the server listens on. A wildcard
// (0.0.0.0 in Docker) or loopback address is reached as localhost from the same machine.
export function projectLink(host: string, port: number, projectId: string): string {
  const wildcard = host === "0.0.0.0" || host === "::" || host === "" || host === "127.0.0.1";
  const authority = wildcard ? "localhost" : host.includes(":") ? `[${host}]` : host;
  return `http://${authority}:${String(port)}/projects/${encodeURIComponent(projectId)}`;
}

export const notificationUrlMax = 2048;

// Empty clears the setting. Otherwise one absolute http(s) URL with no user name or password:
// fetch refuses those, and a password in a URL would sit in the database in plain sight.
export function notificationUrlProblem(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > notificationUrlMax)
    return `Keep the Notification URL to ${String(notificationUrlMax)} characters or fewer.`;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "Enter a full address starting with https:// or http://, for example https://ntfy.sh/your-topic.";
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return "The Notification URL must start with https:// or http://.";
  if (parsed.username !== "" || parsed.password !== "")
    return "Remove the user name and password from the Notification URL; Slopify can't send them.";
  return undefined;
}
