import { beforeEach, describe, expect, it } from "vitest";
import { RefusedClick } from "../src/social/guard.js";
import { reddit } from "../src/social/sites/reddit.js";
import {
  filesOf,
  flips,
  loadFixture,
  noWaits,
  pack,
  recordingPress,
  takesPaste,
  watchForbidden,
} from "./social-fixture.js";

const submit = new URL("https://www.reddit.com/r/fantasy/submit?title=The%20Fox");
let shadow: ShadowRoot;

// Reddit's form lives in web components: the fields are put in an open shadow root, as there.
function openReddit(): void {
  loadFixture("reddit-submit.html");
  const host = document.createElement("shreddit-composer");
  document.querySelector("#composer-host")?.append(host);
  shadow = host.attachShadow({ mode: "open" });
  const template = (id: string) =>
    (document.querySelector(`template#${id}`) as HTMLTemplateElement).content.cloneNode(true);
  shadow.append(template("tab-list"), template("fields"));
  takesPaste(shadow.querySelector('[role="textbox"]') as Element);
  for (const tab of shadow.querySelectorAll('[role="tab"]'))
    tab.addEventListener("click", () => {
      for (const other of shadow.querySelectorAll('[role="tab"]'))
        other.setAttribute("aria-selected", String(other === tab));
    });
  shadow.querySelector("#flair-open")?.addEventListener("click", () => {
    shadow.querySelector("#flair-list")?.append(template("flairs"));
    for (const radio of shadow.querySelectorAll('[role="radio"]')) flips(radio);
  });
}

const fields = {
  subreddit: "fantasy",
  title: "The Fox of Cliffside",
  flair: "Lore",
};
const run = (post = pack("reddit", { reddit: { ...fields, kind: "text" }, media: [] })) => {
  const recorded = recordingPress(reddit);
  return {
    ...recorded,
    report: reddit.fill({
      doc: document,
      location: submit,
      pack: post,
      files: filesOf(post),
      waits: noWaits,
      press: recorded.press,
    }),
  };
};
const value = (selector: string) => (shadow.querySelector(selector) as HTMLTextAreaElement).value;

describe("Reddit (unverified: needs a live check)", () => {
  beforeEach(openReddit);

  it("fills a text post's title and body and picks the flair, inside shadow roots", async () => {
    const hits = watchForbidden(["#submit-post-button"]);
    const { report, pressed } = run();
    const done = await report;
    expect(done.filled).toBe(true);
    expect(value('textarea[name="title"]')).toBe("The Fox of Cliffside");
    expect(shadow.querySelector('[role="textbox"]')?.textContent).toBe(
      "The fox learns to fly over the cliffs of Cliffside.#fox #cliffs",
    );
    expect(pressed).toEqual(["Add flair and tags", "Lore", "Add"]);
    expect(hits).toEqual([]);
  });

  it("keeps a title the address already filled", async () => {
    (shadow.querySelector('textarea[name="title"]') as HTMLTextAreaElement).value = "From the URL";
    const { report } = run();
    await report;
    expect(value('textarea[name="title"]')).toBe("From the URL");
  });

  it("opens Images & Video and adds the pictures for a media post", async () => {
    const post = pack("reddit", { reddit: { ...fields, flair: "", kind: "media" } });
    const { report, pressed } = run(post);
    const done = await report;
    expect(done.filled).toBe(true);
    expect(pressed).toEqual(["Images & Video"]);
    const input = shadow.querySelector('input[type="file"]') as HTMLInputElement;
    expect([...(input.files ?? [])].map((one) => one.name)).toEqual(["one.png", "two.png"]);
  });

  it("fills the link of a link post", async () => {
    const post = pack("reddit", {
      reddit: { ...fields, flair: "", kind: "link" },
      media: [],
      link: "https://youtu.be/abc",
    });
    const { report } = run(post);
    expect((await report).filled).toBe(true);
    expect(value('textarea[name="link"]')).toBe("https://youtu.be/abc");
  });

  it("says the subreddit is missing", async () => {
    const { report } = run(
      pack("reddit", { reddit: { ...fields, subreddit: "", kind: "text" }, media: [] }),
    );
    const done = await report;
    expect(done.notes[0]?.message).toContain("no subreddit");
  });

  it("fills nothing when the title box isn't there", async () => {
    shadow.querySelector('faceplate-textarea-input[name="title"]')?.remove();
    const { report } = run();
    const done = await report;
    expect(done.filled).toBe(false);
    if (!done.filled) expect(done.missing).toEqual(["the Title box"]);
    expect(shadow.querySelector('[role="textbox"]')?.textContent).toBe("");
  });

  it("refuses Post and Save Draft", () => {
    const { press } = recordingPress(reddit);
    expect(() => press(document.querySelector("#submit-post-button") as Element)).toThrow(
      RefusedClick,
    );
    const draft = [...document.querySelectorAll("button")].find(
      (one) => one.textContent === "Save Draft",
    );
    expect(() => press(draft as Element)).toThrow(RefusedClick);
  });

  it("counts the post's comments page as posted, and finds it on the profile", () => {
    expect(reddit.published(document, submit)).toBeNull();
    expect(
      reddit.published(
        document,
        new URL("https://www.reddit.com/r/fantasy/comments/def456/the_fox/?created=1"),
      ),
    ).toEqual({ state: "posted", url: "https://www.reddit.com/r/fantasy/comments/def456/the_fox" });
    document.body.insertAdjacentHTML(
      "beforeend",
      (document.querySelector("template#profile") as HTMLTemplateElement).innerHTML,
    );
    expect(
      reddit.findLink(
        document,
        new URL("https://www.reddit.com/user/me/submitted/"),
        "The fox learns",
      ),
    ).toBe("https://www.reddit.com/r/fantasy/comments/def456/the_fox/");
    expect(reddit.isCompose(submit)).toBe(true);
    expect(reddit.isCompose(new URL("https://www.reddit.com/r/fantasy/"))).toBe(false);
  });
});
