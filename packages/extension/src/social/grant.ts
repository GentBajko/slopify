import type { ExtensionApi, RegisteredScript } from "../browser.js";
import { siteMatches } from "./matches.js";
import { type SocialPlatform, socialPlatforms } from "./types.js";

// "Allow posting on <site>": the site's optional host permission (and the optional
// notifications, for the posts filled at their release time), then its content script,
// registered at run time with the id slopify-social-<site>. Nothing runs on a site until the
// person allows it there; taking the permission back (in the options or the browser's own
// extension settings) unregisters the script at the next sync.

export const fillsAtRelease: readonly SocialPlatform[] = ["instagram", "bluesky", "reddit"];

export const scriptId = (platform: SocialPlatform) => `slopify-social-${platform}`;

export function scriptFor(platform: SocialPlatform): RegisteredScript {
  return {
    id: scriptId(platform),
    matches: siteMatches[platform],
    js: ["social-content.js"],
    runAt: "document_idle",
    persistAcrossSessions: true,
  };
}

export async function allowedSites(api: ExtensionApi): Promise<readonly SocialPlatform[]> {
  const permissions = api.permissions;
  if (permissions === undefined) return [];
  const allowed: SocialPlatform[] = [];
  for (const platform of socialPlatforms)
    if (await permissions.contains({ origins: siteMatches[platform] }).catch(() => false))
      allowed.push(platform);
  return allowed;
}

// Registers the content script of every allowed site and unregisters the others; answers the
// allowed sites. Safe to run any number of times (startup, install, after each change).
export async function syncScripts(api: ExtensionApi): Promise<readonly SocialPlatform[]> {
  const allowed = await allowedSites(api);
  const scripting = api.scripting;
  if (scripting === undefined) return allowed;
  const ids = socialPlatforms.map(scriptId);
  const registered = new Set(
    (await scripting.getRegisteredContentScripts({ ids }).catch(() => [])).map((one) => one.id),
  );
  const stale = socialPlatforms
    .filter((platform) => !allowed.includes(platform) && registered.has(scriptId(platform)))
    .map(scriptId);
  if (stale.length > 0) await scripting.unregisterContentScripts({ ids: stale });
  const wanted = allowed.filter((platform) => !registered.has(scriptId(platform)));
  if (wanted.length > 0) await scripting.registerContentScripts(wanted.map(scriptFor));
  return allowed;
}

// From the options page's button (a click: the browser asks the person). Answers whether the
// site is allowed now.
export async function allowSite(api: ExtensionApi, platform: SocialPlatform): Promise<boolean> {
  if (api.permissions === undefined) return false;
  // A site without a scheduler is filled at the release time, in a background tab: the
  // notification says it's ready to post.
  const granted = await api.permissions.request({
    origins: siteMatches[platform],
    ...(fillsAtRelease.includes(platform) ? { permissions: ["notifications"] } : {}),
  });
  if (!granted) return false;
  await syncScripts(api);
  return true;
}

export async function stopSite(api: ExtensionApi, platform: SocialPlatform): Promise<void> {
  await api.permissions?.remove({ origins: siteMatches[platform] });
  await syncScripts(api);
}
