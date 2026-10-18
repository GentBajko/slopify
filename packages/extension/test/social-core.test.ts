import { afterEach, describe, expect, it, vi } from "vitest";
import { findAllIn, findIn, isOn, missingOf, switchNear } from "../src/social/find.js";
import { type Forbidden, pressOn, RefusedClick, refuse } from "../src/social/guard.js";
import { dismissPrompts, watchPrompts } from "../src/social/modals.js";
import { sameText, typeRich } from "../src/social/rich-text.js";
import { localTime, setSelect } from "../src/social/site.js";

const noWait = { sleep: () => Promise.resolve(), settleMs: 100 };
afterEach(() => {
  document.body.innerHTML = "";
});

// A stand-in for a site's editor that takes text in only one way, as the real ones differ.
function editor(takes: "paste" | "execCommand" | "beforeinput" | "nothing"): HTMLElement {
  const box = document.createElement("div");
  box.contentEditable = "true";
  box.setAttribute("role", "textbox");
  box.textContent = "clip.mp4";
  document.body.append(box);
  if (takes === "paste")
    box.addEventListener("paste", (event) => {
      event.preventDefault();
      const data = (event as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
      // The editor replaces what's selected: the whole box after select-all.
      box.replaceChildren(
        ...data
          .split("\n")
          .map((line) => Object.assign(document.createElement("p"), { textContent: line })),
      );
    });
  if (takes === "beforeinput")
    box.addEventListener("beforeinput", (event) => {
      const input = event as InputEvent;
      if (input.inputType !== "insertText") return;
      event.preventDefault();
      box.textContent = input.data ?? "";
    });
  return box;
}

describe("typeRich", () => {
  it("pastes into an editor that only takes a paste", async () => {
    const box = editor("paste");
    const result = await typeRich(box, "Line one\nLine two #fox", { label: "the box", ...noWait });
    expect(result).toEqual({ ok: true, how: "paste" });
    expect(box.querySelectorAll("p")).toHaveLength(2);
    expect(sameText(box.textContent ?? "", "Line one\nLine two #fox")).toBe(true);
  });

  it("uses the insertText command when the editor ignores the paste", async () => {
    const box = editor("execCommand");
    const typed: string[] = [];
    document.execCommand = vi.fn((command: string, _ui?: boolean, value?: string) => {
      if (command === "delete") box.textContent = "";
      if (command === "insertText") {
        typed.push(value ?? "");
        box.append(value ?? "");
      }
      if (command === "insertLineBreak") box.append(document.createElement("br"));
      return true;
    }) as typeof document.execCommand;
    const result = await typeRich(box, "Hello\nthere", { label: "the box", ...noWait });
    expect(result).toEqual({ ok: true, how: "execCommand" });
    expect(typed).toEqual(["Hello", "there"]);
    expect(box.querySelectorAll("br")).toHaveLength(1);
    (document as { execCommand?: unknown }).execCommand = undefined;
  });

  it("sends a beforeinput when neither paste nor the command works", async () => {
    const box = editor("beforeinput");
    const result = await typeRich(box, "Words", { label: "the box", ...noWait });
    expect(result).toEqual({ ok: true, how: "beforeinput" });
    expect(box.textContent).toBe("Words");
  });

  it("empties the box, copies the text and says so when the editor takes nothing", async () => {
    const box = editor("nothing");
    const copy = vi.fn(async () => true);
    const result = await typeRich(box, "Words", { label: "the post's text box", ...noWait, copy });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(copy).toHaveBeenCalledWith("Words");
    expect(result.copied).toBe(true);
    expect(result.sentence).toContain("the post's text box");
    expect(result.sentence).toContain("The text is copied");
    expect(box.textContent).toBe("");
  });

  it("asks to press Copy when the clipboard refuses", async () => {
    const box = editor("nothing");
    const result = await typeRich(box, "Words", {
      label: "the box",
      ...noWait,
      copy: async () => false,
    });
    expect(result.ok === false && result.sentence).toContain("Press Copy");
  });
});

describe("find", () => {
  it("finds controls inside open shadow roots when asked", () => {
    const host = document.createElement("shreddit-composer");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    const inner = document.createElement("inner-part");
    shadow.append(inner);
    const deeper = inner.attachShadow({ mode: "open" });
    deeper.innerHTML = '<input type="file" accept="image/*" />';
    const field = { label: "the media input", selectors: ["input[type=file]"], checked: null };
    expect(findIn(document, field)).toBeNull();
    expect(findIn(document, { ...field, shadow: true })).not.toBeNull();
    expect(missingOf(document, [field])).toEqual(["the media input"]);
    expect(missingOf(document, [{ ...field, shadow: true }])).toEqual([]);
  });

  it("narrows by label or text", () => {
    document.body.innerHTML =
      '<button aria-label="Select crop">a</button><div role="button">4:5</div><div role="button">1:1</div>';
    expect(
      findIn(document, {
        label: "4:5",
        selectors: ['[role="button"]'],
        text: /^4:5$/,
        checked: null,
      })?.textContent,
    ).toBe("4:5");
    expect(
      findAllIn(document, { label: "crops", selectors: ['[role="button"]'], checked: null }),
    ).toHaveLength(2);
  });

  it("finds the switch beside a label and reads its state", () => {
    document.body.innerHTML =
      '<div><div><span>Add AI label</span><span>Required for realistic media</span></div><input type="checkbox" role="switch" /></div>';
    const found = switchNear(document, /^Add AI label$/i);
    expect(found?.tagName).toBe("INPUT");
    expect(isOn(found as Element)).toBe(false);
    (found as HTMLInputElement).checked = true;
    expect(isOn(found as Element)).toBe(true);
  });
});

describe("the forbidden buttons", () => {
  const forbidden: Forbidden = { selectors: ['[data-testid="tweetButton"]'], labels: [] };
  const press = pressOn("x", forbidden);

  it("refuses the site's own Post by selector and every site's Post/Share/Discard by label", () => {
    document.body.innerHTML = `
      <button data-testid="tweetButton"><span>Post</span></button>
      <div role="button" id="share">Share</div>
      <button id="discard">Discard</button>
      <button id="turn-on">Turn on</button>
      <button id="final-schedule">Schedule</button>`;
    for (const selector of [
      '[data-testid="tweetButton"] span',
      "#share",
      "#discard",
      "#turn-on",
      "#final-schedule",
    ]) {
      const element = document.querySelector(selector) as HTMLElement;
      const clicked = vi.fn();
      element.addEventListener("click", clicked);
      expect(() => press(element)).toThrow(RefusedClick);
      expect(clicked).not.toHaveBeenCalled();
    }
  });

  it("presses the inner schedule controls and the Schedule radio", () => {
    document.body.innerHTML = `
      <button data-testid="scheduleOption" aria-label="Schedule post"></button>
      <button data-testid="scheduledConfirmationPrimaryAction">Confirm</button>
      <label><input type="radio" name="postSchedule" value="schedule" />Schedule</label>
      <button id="next">Next</button>`;
    for (const selector of [
      '[data-testid="scheduleOption"]',
      '[data-testid="scheduledConfirmationPrimaryAction"]',
      'input[value="schedule"]',
      "#next",
    ]) {
      const element = document.querySelector(selector) as HTMLElement;
      const clicked = vi.fn();
      element.addEventListener("click", clicked);
      press(element);
      expect(clicked).toHaveBeenCalledOnce();
    }
    expect(() => refuse(document.querySelector("#next") as Element, "x", forbidden)).not.toThrow();
  });
});

describe("account-setting prompts", () => {
  it("closes TikTok's content-check prompt with Cancel and never Turn on", () => {
    document.body.innerHTML = `
      <div class="modal"><h2>Turn on automatic content checks?</h2><p>We check…</p>
        <button id="cancel">Cancel</button><button id="on">Turn on</button></div>`;
    const pressed: string[] = [];
    const press = (element: Element) => {
      pressed.push(element.id);
      element.closest(".modal")?.remove();
    };
    expect(dismissPrompts(document, "tiktok", press)).toHaveLength(1);
    expect(pressed).toEqual(["cancel"]);
  });

  it("leaves other sites' prompts and unknown prompts alone", () => {
    document.body.innerHTML = `<div role="dialog">Turn on automatic content checks? <button>Cancel</button></div>
      <div role="dialog">Allow notifications? <button>Cancel</button><button>Allow</button></div>`;
    const press = vi.fn();
    expect(dismissPrompts(document, "x", press)).toEqual([]);
    expect(press).not.toHaveBeenCalled();
  });

  it("watches for a prompt that appears later", async () => {
    const press = vi.fn((element: Element) => element.closest("[role=dialog]")?.remove());
    const closed = vi.fn();
    const stop = watchPrompts(document, "tiktok", press, closed);
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div role="dialog">Turn on automatic content checks? <button>Turn on</button><button>Cancel</button></div>',
    );
    await new Promise((done) => setTimeout(done, 0));
    stop();
    expect(press).toHaveBeenCalledOnce();
    expect((press.mock.calls[0]?.[0] as Element | undefined)?.textContent).toBe("Cancel");
    expect(closed).toHaveBeenCalledOnce();
  });
});

describe("site helpers", () => {
  it("sets a select by value or text", () => {
    document.body.innerHTML =
      '<select><option value="1">January</option><option value="10">October</option></select>';
    const select = document.querySelector("select") as HTMLSelectElement;
    const changed = vi.fn();
    select.addEventListener("change", changed);
    expect(setSelect(select, "October")).toBe(true);
    expect(select.value).toBe("10");
    expect(changed).toHaveBeenCalledOnce();
    expect(setSelect(select, "Smarch")).toBe(false);
  });

  it("splits the release time into the pickers' pieces in local time", () => {
    const local = new Date(2026, 9, 20, 20, 5);
    const time = localTime(local.toISOString());
    expect(time).toMatchObject({
      date: "2026-10-20",
      time: "20:05",
      hour12: 8,
      meridiem: "PM",
      monthName: "October",
      said: "20 Oct 2026, 20:05",
    });
  });
});
