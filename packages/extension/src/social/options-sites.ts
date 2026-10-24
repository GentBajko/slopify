import type { ExtensionApi } from "../browser.js";
import { allowedSites, allowSite, fillsAtRelease, stopSite } from "./grant.js";
import type { SocialRequest } from "./messages.js";
import { platformLabels, type SocialPlatform, socialPlatforms } from "./types.js";

// The options page's "Posting" list: one row per site, with "Allow posting on <site>" (the
// browser asks the person for that site only) or, once allowed, "Stop posting on <site>". The
// worker is told after each change, so Slopify's Copy for YouTube Studio knows which Fill buttons work.

export async function renderSites(
  list: HTMLElement,
  api: ExtensionApi,
  send: (request: SocialRequest) => Promise<unknown>,
): Promise<void> {
  const allowed = await allowedSites(api);
  const doc = list.ownerDocument;
  list.replaceChildren(
    ...socialPlatforms.map((platform) => row(doc, platform, allowed.includes(platform))),
  );
  for (const button of list.querySelectorAll<HTMLButtonElement>("button[data-site]"))
    button.addEventListener("click", () => {
      const platform = button.dataset.site as SocialPlatform;
      const allowing = button.dataset.allowed !== "true";
      const status = list.querySelector<HTMLElement>(`[data-status="${platform}"]`);
      // The permission request must start from the click itself, before anything is awaited.
      const change = allowing
        ? allowSite(api, platform)
        : stopSite(api, platform).then(() => false);
      void change
        .then(async (now) => {
          await send({ type: "social-sites" });
          await renderSites(list, api, send);
          if (allowing && !now && status !== null)
            list
              .querySelector<HTMLElement>(`[data-status="${platform}"]`)
              ?.replaceChildren(
                `Not allowed: the browser's prompt was declined. Press Allow posting on ${platformLabels[platform]} again to allow it.`,
              );
        })
        .catch((error: unknown) => {
          if (status !== null)
            status.textContent = `Couldn't change ${platformLabels[platform]}: ${error instanceof Error ? error.message : String(error)}`;
        });
    });
}

function row(doc: Document, platform: SocialPlatform, allowed: boolean): HTMLElement {
  const site = platformLabels[platform];
  const item = doc.createElement("li");
  const button = doc.createElement("button");
  button.type = "button";
  button.dataset.site = platform;
  button.dataset.allowed = String(allowed);
  button.textContent = allowed ? `Stop posting on ${site}` : `Allow posting on ${site}`;
  const status = doc.createElement("span");
  status.dataset.status = platform;
  status.textContent = allowed
    ? fillsAtRelease.includes(platform)
      ? `Allowed. ${site} has no scheduler: Slopify fills the post at its release time and notifies you to press Post.`
      : `Allowed. Slopify sets ${site}'s own scheduler to the release time; you press Schedule.`
    : "Not allowed: the extension does nothing on this site.";
  item.append(button, " ", status);
  return item;
}
