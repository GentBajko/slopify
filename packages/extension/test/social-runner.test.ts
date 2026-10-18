import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkerAnswer } from "../src/pack.js";
import { postFiles, workerMax } from "../src/social/files.js";
import type { SocialRequest } from "../src/social/messages.js";
import { runSocialPage } from "../src/social/runner.js";
import type { Site } from "../src/social/site.js";
import { bluesky } from "../src/social/sites/bluesky.js";
import { siteFor } from "../src/social/sites/index.js";
import { tiktok } from "../src/social/sites/tiktok.js";
import type { ActivePost, PostPack } from "../src/social/types.js";
import { filesOf, loadFixture, media, on, pack, reveal, takesPaste } from "./social-fixture.js";

const fast = {
  sleep: () => new Promise<void>((done) => setTimeout(done, 0)),
  timeoutMs: 200,
  uploadMs: 200,
};

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

// The worker as the page sees it: the next post, and every message recorded.
function harness(href: string, active: ActivePost | null) {
  const sent: SocialRequest[] = [];
  const toasts: { text: string; tone: string; copy?: string }[] = [];
  const navigate = vi.fn();
  let current = href;
  const deps = {
    send: async <T>(request: SocialRequest): Promise<WorkerAnswer<T>> => {
      sent.push(request);
      if (request.type === "social-next")
        return active === null
          ? { ok: false, message: "Nothing is waiting to be filled on this site." }
          : ({ ok: true, value: active } as WorkerAnswer<T>);
      return { ok: true, value: true as T };
    },
    files: async (post: PostPack) => filesOf(post),
    toast: (text: string, tone: "ok" | "error" | "info", copy?: string) =>
      void toasts.push({ text, tone, ...(copy === undefined ? {} : { copy }) }),
    navigate,
    href: () => current,
    storage: memoryStorage(),
    waits: fast,
    watchMs: 100_000,
    lookupMs: 1000,
  };
  return {
    deps,
    sent,
    toasts,
    navigate,
    go: (url: string) => {
      current = url;
    },
  };
}

function openBluesky(): void {
  loadFixture("bluesky-compose.html");
  on('button[aria-label="Compose new post"]', () => {
    reveal("composer", "#portal");
    takesPaste(document.querySelector(".ProseMirror") as Element);
  });
}

const results = (sent: readonly SocialRequest[]) =>
  sent.flatMap((one) => (one.type === "social-result" ? [one] : []));

describe("a page on a posting site", () => {
  beforeEach(openBluesky);

  it("leaves a page that isn't the post form alone, without asking for a post", async () => {
    const page = harness("https://bsky.app/profile/me", { pack: pack("bluesky"), waiting: 0 });
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("idle");
    expect(page.sent).toEqual([]);
  });

  it("never touches a post form the person opened themselves, even with a post waiting", async () => {
    const page = harness("https://bsky.app/", { pack: pack("bluesky"), waiting: 0 });
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("idle");
    // No claim on Slopify's queue, no toast, nothing typed.
    expect(page.sent).toEqual([]);
    expect(page.toasts).toEqual([]);
    expect(document.querySelector(".ProseMirror")?.textContent ?? "").toBe("");
  });

  it("leaves a form marked for another site alone", async () => {
    const page = harness("https://bsky.app/#slopify-post=p1:x", {
      pack: pack("bluesky"),
      waiting: 0,
    });
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("idle");
    expect(page.sent).toEqual([]);
  });

  it("asks for exactly the project whose Fill was pressed", async () => {
    const page = harness("https://bsky.app/#slopify-post=p%3A1:bluesky", {
      pack: pack("bluesky"),
      waiting: 0,
    });
    await runSocialPage(bluesky, document, page.deps);
    expect(page.sent[0]).toEqual({ type: "social-next", platform: "bluesky", projectId: "p:1" });
  });

  it("fills the waiting post, reports it filled, and reports the link once the person posts", async () => {
    const post = pack("bluesky", {
      warnings: [{ code: "text-cut", sentence: "The text was cut to fit 300 characters." }],
    });
    const page = harness("https://bsky.app/#slopify-post=p1:bluesky", { pack: post, waiting: 0 });
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("filled");
    expect(results(page.sent)[0]).toMatchObject({
      type: "social-result",
      projectId: "p1",
      platform: "bluesky",
      state: "filled",
      due: false,
    });
    expect(page.toasts.map((one) => one.text)).toContain("The text was cut to fit 300 characters.");
    expect(page.toasts.at(-1)?.text).toContain("press Bluesky's Post yourself");
    // The person presses Publish; Bluesky shows its toast.
    reveal("toast");
    await vi.waitFor(() =>
      expect(results(page.sent).at(-1)).toMatchObject({
        state: "posted",
        url: "https://bsky.app/profile/me.bsky.social/post/3kxyzabc",
      }),
    );
  });

  it("marks a fill opened at its release time as due (and late), for the notification", async () => {
    const page = harness("https://bsky.app/#slopify-post=p1:bluesky&due=1&late=1", {
      pack: pack("bluesky"),
      waiting: 0,
    });
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("filled");
    expect(results(page.sent)[0]).toMatchObject({
      state: "filled",
      due: true,
      late: true,
      title: "The Fox of Cliffside",
    });
  });

  it("says what failed when a fill Slopify opened finds nothing waiting", async () => {
    const page = harness("https://bsky.app/#slopify-post=p1:bluesky", null);
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("idle");
    expect(page.toasts).toEqual([
      { text: "Nothing is waiting to be filled on this site.", tone: "error" },
    ]);
  });

  it("reports a failure with the missing controls and offers the text, when the form changed", async () => {
    document.querySelector('button[aria-label="Compose new post"]')?.remove();
    const page = harness("https://bsky.app/#slopify-post=p1:bluesky", {
      pack: pack("bluesky"),
      waiting: 0,
    });
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("failed");
    const failed = results(page.sent)[0];
    expect(failed?.state).toBe("failed");
    expect(failed?.message).toContain("Bluesky's post form has changed");
    expect(failed?.message).toContain('the "Compose new post" button');
    expect(page.toasts.at(-1)?.copy).toContain("The fox learns to fly");
  });

  it("reports a refused button as a failure and never presses it", async () => {
    const pressing: Site = {
      ...bluesky,
      fill: async (context) => {
        context.press(document.querySelector('[data-testid="composerPublishBtn"]') as Element);
        return { filled: true, notes: [], scheduled: false };
      },
    };
    reveal("composer", "#portal");
    const publish = vi.fn();
    document
      .querySelector('[data-testid="composerPublishBtn"]')
      ?.addEventListener("click", publish);
    const page = harness("https://bsky.app/#slopify-post=p1:bluesky", {
      pack: pack("bluesky"),
      waiting: 0,
    });
    expect(await runSocialPage(pressing, document, page.deps)).toBe("failed");
    expect(publish).not.toHaveBeenCalled();
    expect(results(page.sent)[0]?.message).toContain("never posts");
  });

  it("finds a post's link on a profile page and reports it posted", async () => {
    reveal("profile", "#feed");
    const hash = encodeURIComponent(
      JSON.stringify({ projectId: "p1", platform: "bluesky", start: "The fox learns to fly" }),
    );
    const page = harness(`https://bsky.app/profile/me.bsky.social#slopify-find=${hash}`, null);
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("found");
    expect(page.sent).toEqual([
      {
        type: "social-result",
        projectId: "p1",
        platform: "bluesky",
        state: "posted",
        url: "https://bsky.app/profile/me.bsky.social/post/3kbbbbbb",
        lookup: true,
      },
    ]);
  });

  it("says when the profile doesn't show the post, so the tab closes", async () => {
    const hash = encodeURIComponent(
      JSON.stringify({ projectId: "p1", platform: "bluesky", start: "Nope" }),
    );
    const page = harness(`https://bsky.app/profile/me#slopify-find=${hash}`, null);
    expect(await runSocialPage(bluesky, document, page.deps)).toBe("not-found");
    expect(page.sent).toEqual([{ type: "social-lookup-done" }]);
  });
});

describe("TikTok through the page runner", () => {
  // First: a fill's prompt watcher keeps watching the page for two minutes after it.
  it("closes TikTok's content-check prompt with Cancel while it fills, never Turn on", async () => {
    loadFixture("tiktok-upload.html");
    const turnOn = vi.fn();
    const cancel = vi.fn();
    document.querySelector('input[type="file"]')?.addEventListener("change", () => {
      reveal("form", "#details");
      takesPaste(document.querySelector(".public-DraftEditor-content") as Element);
      reveal("checks", "#modals");
      document.querySelector("#checks-on")?.addEventListener("click", turnOn);
      document.querySelector("#checks-cancel")?.addEventListener("click", () => {
        cancel();
        document.querySelector("#modals")?.replaceChildren();
      });
    });
    const post = pack("tiktok", { media: [media("short", "short-1.mp4")], aiLabel: false });
    const page = harness("https://www.tiktok.com/tiktokstudio/upload#slopify-post=p1:tiktok", {
      pack: post,
      waiting: 0,
    });
    expect(await runSocialPage(tiktok, document, page.deps)).toBe("filled");
    expect(cancel).toHaveBeenCalled();
    expect(turnOn).not.toHaveBeenCalled();
    expect(page.toasts.some((one) => one.text.includes("closed it with Cancel"))).toBe(true);
  });

  it("moves to the Photos tab with the post, then fills it there without asking again", async () => {
    loadFixture("tiktok-upload.html");
    const post = pack("tiktok");
    const page = harness("https://www.tiktok.com/tiktokstudio/upload#slopify-post=p1:tiktok", {
      pack: post,
      waiting: 0,
    });
    expect(await runSocialPage(tiktok, document, page.deps)).toBe("moved");
    expect(page.navigate).toHaveBeenCalledWith(
      "https://www.tiktok.com/tiktokstudio/upload?tab=photo",
    );
    // The Photos tab: the post comes from the page's session, not from Slopify again.
    page.go("https://www.tiktok.com/tiktokstudio/upload?tab=photo");
    document
      .querySelector('input[type="file"]')
      ?.setAttribute("accept", "image/jpg,image/jpeg,image/png,image/webp");
    page.sent.length = 0;
    const outcome = await runSocialPage(tiktok, document, page.deps);
    expect(page.sent.some((one) => one.type === "social-next")).toBe(false);
    // The fixture has no form after a picture upload: it stops, saying so.
    expect(outcome).toBe("failed");
  });
});

describe("the post's files", () => {
  const video = media("video", "fox.mp4");
  const picture = media("picture", "one.png");
  const file = (name: string) => new File(["x"], name);

  it("brings videos through the frame and pictures through the worker", async () => {
    const viaFrame = vi.fn(async () => file("fox.mp4"));
    const viaWorker = vi.fn(async () => file("one.png"));
    const files = await postFiles([video, picture], { viaFrame, viaWorker });
    expect(files.map((one) => one.name)).toEqual(["fox.mp4", "one.png"]);
    expect(viaFrame).toHaveBeenCalledWith(video);
    expect(viaWorker).toHaveBeenCalledWith(picture);
  });

  it("falls back to the worker for a small video the page blocks, and says what to do for a big one", async () => {
    const blocked = async () => {
      throw new Error("the page didn't let the extension's frame load");
    };
    const viaWorker = vi.fn(async () => file("fox.mp4"));
    expect(await postFiles([video], { viaFrame: blocked, viaWorker })).toHaveLength(1);
    await expect(
      postFiles([{ ...video, bytes: workerMax + 1 }], { viaFrame: blocked, viaWorker }),
    ).rejects.toThrow("Download it from Slopify's Prepare upload");
  });

  it("picks the adapter by the page's host", () => {
    expect(siteFor("x.com")?.platform).toBe("x");
    expect(siteFor("www.tiktok.com")?.platform).toBe("tiktok");
    expect(siteFor("bsky.app")?.platform).toBe("bluesky");
    expect(siteFor("studio.youtube.com")).toBeUndefined();
  });
});
