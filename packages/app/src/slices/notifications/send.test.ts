import { describe, expect, it } from "vitest";
import { noticeOf, noticeText, notificationUrlProblem } from "./rules.js";
import { createNotificationSender } from "./send.js";

describe("createNotificationSender", () => {
  it("POSTs the body as plain text", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const send = createNotificationSender((input, init) => {
      seen.push({ url: String(input), init });
      return Promise.resolve(new Response("ok", { status: 200 }));
    });
    expect(await send("https://ntfy.example/topic", "Video ready: A\n")).toEqual({ ok: true });
    expect(seen[0]?.init?.method).toBe("POST");
    expect(seen[0]?.init?.body).toBe("Video ready: A\n");
    expect(seen[0]?.init?.headers).toEqual({ "content-type": "text/plain; charset=utf-8" });
  });

  it("answers a non-2xx status as refused", async () => {
    const send = createNotificationSender(() =>
      Promise.resolve(new Response("nope", { status: 403 })),
    );
    expect(await send("https://ntfy.example/t", "x")).toEqual({
      ok: false,
      reason: "refused",
      status: 403,
    });
  });

  it("gives up after its timeout", async () => {
    const send = createNotificationSender(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(init.signal?.reason);
          });
        }),
      10,
    );
    expect(await send("https://ntfy.example/t", "x")).toEqual({ ok: false, reason: "timeout" });
  });

  it("answers a network failure as unreachable", async () => {
    const send = createNotificationSender(() => Promise.reject(new TypeError("fetch failed")));
    expect(await send("https://ntfy.example/t", "x")).toEqual({
      ok: false,
      reason: "unreachable",
    });
  });
});

describe("notificationUrlProblem", () => {
  it("accepts http, https and empty", () => {
    expect(notificationUrlProblem("https://ntfy.sh/my-topic")).toBeUndefined();
    expect(notificationUrlProblem(" http://192.168.1.5:8080/hook ")).toBeUndefined();
    expect(notificationUrlProblem("")).toBeUndefined();
  });

  it("refuses other schemes, bare words and embedded passwords", () => {
    expect(notificationUrlProblem("ftp://example.com/x")).toContain("https://");
    expect(notificationUrlProblem("ntfy.sh/topic")).toContain("full address");
    expect(notificationUrlProblem("https://me:secret@example.com/x")).toContain("password");
  });
});

describe("noticeOf", () => {
  it("speaks only for a run seen running", () => {
    expect(noticeOf("running", "done")).toBe("ready");
    expect(noticeOf("running", "failed")).toBe("failed");
    expect(noticeOf("running", "partial")).toBe("partial");
    expect(noticeOf("running", "pending")).toBe("waiting");
    expect(noticeOf("running", "paused")).toBeUndefined();
    expect(noticeOf(undefined, "done")).toBeUndefined();
    expect(noticeOf("pending", "failed")).toBeUndefined();
  });
});

describe("noticeText", () => {
  it("says a video that is there despite a failed step is ready with problems", () => {
    expect(
      noticeText("partial", { title: "Cleopatra", makesVideo: true, reason: "Thumbnail refused" }),
    ).toEqual({
      headline: "Video ready with problems: Cleopatra — Thumbnail refused",
      detail: "Open the project to see which step failed and the button that fixes it.",
    });
  });
});
