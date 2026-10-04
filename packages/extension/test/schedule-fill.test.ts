import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fillSchedule } from "../src/studio-pages.js";

// The Visibility step's schedule picker as read on the live page (2026-10-04): the typed date
// sits in a <form> inside ytcp-date-picker, and Studio ignores a synthetic Enter there; only the
// form's submit (what a real Enter does) commits it to the date shown on the trigger.
function dialog(): Element {
  document.body.innerHTML = `
    <ytcp-uploads-dialog>
      <ytcp-video-visibility-select>
        <ytcp-datetime-picker>
          <div id="datepicker-trigger">Oct 4, 2026</div>
          <div id="time-of-day-container"><input value="12:00 PM" /></div>
        </ytcp-datetime-picker>
      </ytcp-video-visibility-select>
    </ytcp-uploads-dialog>
    <ytcp-date-picker><form><input value="Oct 4, 2026" /></form></ytcp-date-picker>`;
  const trigger = document.querySelector("#datepicker-trigger") as Element;
  const form = document.querySelector("ytcp-date-picker form") as HTMLFormElement;
  const input = form.querySelector("input") as HTMLInputElement;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    trigger.textContent = input.value;
  });
  return document.querySelector("ytcp-uploads-dialog") as Element;
}

beforeEach(() => {
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => vi.restoreAllMocks());

it("commits the typed date the way Studio accepts it, then the time", async () => {
  const at = new Date(2026, 9, 7, 17, 0);
  const step = await fillSchedule(dialog(), at);
  expect(step).toMatchObject({ ok: true });
  expect(document.querySelector("#datepicker-trigger")?.textContent).toBe("Oct 7, 2026");
  expect((document.querySelector("#time-of-day-container input") as HTMLInputElement).value).toBe(
    "5:00 PM",
  );
}, 15_000);
