import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { adSuitabilityShown, monetizationUnset, rateAdSuitability } from "../src/studio-pages.js";

// The upload dialog's Ad suitability step as read on the live page (2026-10-04): the box
// ticks on a click, Submit rating enables once it is ticked, and submitting locks it.
function dialog(): Element {
  document.body.innerHTML = `
    <ytcp-uploads-dialog>
      <ytcp-video-monetization><div id="container">Select</div><ytcp-icon-button></ytcp-icon-button></ytcp-video-monetization>
      <ytcp-uploads-content-ratings>
        <ytpp-self-certification-questionnaire>
          <ytcp-checkbox-lit class="all-none-checkbox">
            <div id="checkbox" role="checkbox" aria-checked="false" aria-label="None of the above"></div>
            <div class="label">None of the above</div>
          </ytcp-checkbox-lit>
          <ytcp-button id="submit-questionnaire-button" disabled aria-disabled="true"><button>Submit rating</button></ytcp-button>
        </ytpp-self-certification-questionnaire>
      </ytcp-uploads-content-ratings>
    </ytcp-uploads-dialog>`;
  const box = document.querySelector("ytcp-checkbox-lit") as Element;
  const tick = document.querySelector("#checkbox") as Element;
  const submit = document.querySelector("#submit-questionnaire-button") as Element;
  tick.addEventListener("click", () => {
    tick.setAttribute("aria-checked", "true");
    box.setAttribute("checked", "");
    submit.removeAttribute("disabled");
    submit.setAttribute("aria-disabled", "false");
  });
  submit.querySelector("button")?.addEventListener("click", () => {
    const note = document.createElement("p");
    note.textContent =
      "Your ad suitability questionnaire is locked since you have submitted your rating.";
    document.querySelector("ytcp-uploads-content-ratings")?.prepend(note);
    submit.setAttribute("disabled", "");
  });
  return document.querySelector("ytcp-uploads-dialog") as Element;
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => vi.restoreAllMocks());

it("ticks None of the above, submits the rating, and then leaves it alone", async () => {
  const root = dialog();
  expect(monetizationUnset(root)).toBe(true);
  expect(adSuitabilityShown(root)).toBe(true);
  const step = await rateAdSuitability(root);
  expect(step).toMatchObject({ ok: true });
  expect(document.querySelector("#checkbox")?.getAttribute("aria-checked")).toBe("true");
  // Locked once submitted: not shown as waiting again.
  expect(adSuitabilityShown(root)).toBe(false);
});
