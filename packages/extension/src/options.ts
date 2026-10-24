import { browserApi } from "./browser.js";
import type { WorkerAnswer } from "./pack.js";
import { renderSites } from "./social/options-sites.js";

// The options page: the Slopify address and the pairing token from Slopify's Settings, and the
// sites the extension may post on. Pairing is done by the background worker, so Slopify sees the
// extension's own origin.

const api = browserApi();
const form = document.getElementById("pair") as HTMLFormElement;
const base = document.getElementById("base") as HTMLInputElement;
const token = document.getElementById("token") as HTMLInputElement;
const status = document.getElementById("status") as HTMLElement;

function say(text: string, tone: "ok" | "error"): void {
  status.textContent = text;
  status.className = tone;
}

void (api.runtime.sendMessage({ type: "status" }) as Promise<WorkerAnswer<string | null>>).then(
  (answer) => {
    if (answer.ok && answer.value !== null) {
      base.value = answer.value;
      say(`Paired with Slopify at ${answer.value}.`, "ok");
    }
  },
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void (
    api.runtime.sendMessage({
      type: "pair",
      base: base.value,
      token: token.value,
    }) as Promise<WorkerAnswer<string>>
  ).then((answer) => {
    if (answer.ok) {
      token.value = "";
      say(
        `Paired with Slopify at ${answer.value}. In Slopify, open a finished project, press Copy for YouTube Studio, then Fill in YouTube Studio.`,
        "ok",
      );
    } else say(answer.message, "error");
  });
});

const sites = document.getElementById("sites");
if (sites !== null) void renderSites(sites, api, (request) => api.runtime.sendMessage(request));
