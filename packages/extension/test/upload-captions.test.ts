import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { subtitlesBlocked, uploadCaptions, videoElementsShown } from "../src/studio-pages.js";

// The upload dialog's Video elements step and the Subtitles editor as Studio's own templates
// build them (read from its code on 2026-10-15): Add subtitles is `ytcp-button#subtitles-button`,
// disabled with a tooltip until the video can take subtitles; the editor's first screen offers
// `button#choose-upload-file`; its Done (`#publish-button`) enables once a file is in.
function dialog(): Element {
  document.body.innerHTML = `
    <ytcp-uploads-dialog>
      <ytcp-uploads-video-elements>
        <ytcp-button id="subtitles-button"><button>Add</button></ytcp-button>
      </ytcp-uploads-video-elements>
      <ytcp-button id="next-button"><button>Next</button></ytcp-button>
    </ytcp-uploads-dialog>`;
  document.querySelector("#subtitles-button")?.addEventListener("click", () => {
    const modal = document.createElement("ytve-captions-editor-modal");
    modal.innerHTML = `
      <ytve-captions-editor-options-panel>
        <div class="title">Select how you want to add subtitles</div>
        <button id="choose-upload-file"><div><span>Upload file</span></div></button>
      </ytve-captions-editor-options-panel>
      <ytcp-button id="publish-button" disabled><button>Done</button></ytcp-button>`;
    document.body.append(modal);
    const done = modal.querySelector("#publish-button") as Element;
    modal.querySelector("#choose-upload-file")?.addEventListener("click", () => {
      const upload = document.createElement("ytve-captions-editor-upload-dialog");
      upload.innerHTML = `
        <tp-yt-paper-dialog>
          <tp-yt-paper-radio-button aria-checked="false">With timing</tp-yt-paper-radio-button>
        </tp-yt-paper-dialog>
        <input type="file" id="captions-file-loader">`;
      document.body.append(upload);
      upload.querySelector("input")?.addEventListener("change", () => {
        upload.remove();
        setTimeout(() => done.removeAttribute("disabled"), 300);
      });
    });
    done.addEventListener("click", () => {
      if (!done.hasAttribute("disabled")) modal.remove();
    });
  });
  return document.querySelector("ytcp-uploads-dialog") as Element;
}

const srt = () => new File(["1\n00:00:00,000 --> 00:00:02,000\nA fox.\n"], "captions.srt");

beforeEach(() => {
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => vi.restoreAllMocks());

it("uploads the captions from the Video elements step, never pressing Next", async () => {
  const root = dialog();
  let next = false;
  root.querySelector("#next-button")?.addEventListener("click", () => (next = true));
  expect(videoElementsShown(root)).toBe(true);
  expect(subtitlesBlocked(root)).toBeUndefined();
  expect(await uploadCaptions(root, srt())).toEqual({ ok: true, message: "Captions uploaded." });
  expect(document.querySelector("ytve-captions-editor-modal")).toBeNull();
  expect(next).toBe(false);
});

it("says why while Studio keeps Add subtitles disabled, and doesn't press it", async () => {
  const root = dialog();
  const add = root.querySelector("#subtitles-button") as Element;
  add.setAttribute("disabled", "");
  const tip = document.createElement("ytcp-paper-tooltip");
  tip.id = "subtitles-button-tooltip";
  tip.textContent = "Select the video language before adding subtitles";
  root.querySelector("ytcp-uploads-video-elements")?.append(tip);
  expect(subtitlesBlocked(root)).toBe("Select the video language before adding subtitles");
  const step = await uploadCaptions(root, srt());
  expect(step.ok).toBe(false);
  expect(step.message).toContain("Select the video language");
  expect(document.querySelector("ytve-captions-editor-modal")).toBeNull();
});

it("leaves the captions for the Details page when Add subtitles isn't there", async () => {
  const root = dialog();
  root.querySelector("#subtitles-button")?.remove();
  const step = await uploadCaptions(root, srt());
  expect(step.ok).toBe(false);
  expect(step.message).toContain("Add subtitles wasn't found");
  expect(step.message).toContain("on the video's Details page");
});
