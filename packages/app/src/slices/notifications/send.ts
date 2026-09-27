// One POST to the user's Notification URL. Short, single-shot and never retried: a
// notification that did not arrive is logged, and a run never waits on one.

export type SendResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "timeout" | "unreachable" }
  | { readonly ok: false; readonly reason: "refused"; readonly status: number };

export type SendNotification = (url: string, body: string) => Promise<SendResult>;

export const notificationTimeoutMs = 5_000;

export function createNotificationSender(
  fetchImpl: typeof fetch,
  timeoutMs: number = notificationTimeoutMs,
): SendNotification {
  return async (url, body) => {
    try {
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "text/plain; charset=utf-8" },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
      });
      // The answer's body is never read; cancelling it frees the socket.
      await response.body?.cancel().catch(() => {});
      return response.ok ? { ok: true } : { ok: false, reason: "refused", status: response.status };
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof DOMException &&
          (error.name === "TimeoutError" || error.name === "AbortError")
            ? "timeout"
            : "unreachable",
      };
    }
  };
}

// What went wrong, in words fit for both the log and the Settings screen. The URL itself is
// never repeated: an ntfy topic in it is as good as a password.
export function sendFailureText(result: Exclude<SendResult, { ok: true }>): string {
  switch (result.reason) {
    case "timeout":
      return `the Notification URL didn't answer within ${String(notificationTimeoutMs / 1000)} seconds`;
    case "unreachable":
      return "the Notification URL couldn't be reached (wrong address, no network, or the server is down)";
    case "refused":
      return `the Notification URL answered HTTP ${String(result.status)}`;
  }
}
