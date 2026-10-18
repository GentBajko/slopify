import type { WorkerAnswer } from "../pack.js";
import { listed } from "../ui.js";
import { RefusedClick } from "./guard.js";
import { dueHash, findHash, type LookupHash, type SocialRequest } from "./messages.js";
import { watchPrompts } from "./modals.js";
import {
  type FillContext,
  pressFor,
  type Site,
  type SiteReport,
  type Waits,
  waitsOf,
} from "./site.js";
import { type ActivePost, linkPatterns, type PostPack, platformLabels } from "./types.js";

// What a page on a site the extension posts on does (`social-content.ts` wires it to the
// browser):
// - a profile page the worker opened to find a post's link ("#slopify-find=…") looks for it and
//   reports it, then the worker closes the tab;
// - the site's post form (or a form the worker opened at a post's release time,
//   "#slopify-post=…") asks the worker for the site's next waiting post, gets its media, fills
//   the form, reports what it did, and watches for the site's sign that the person posted it,
//   to report the link. It never presses Post: the person does.

export interface RunnerDeps {
  readonly send: <T>(request: SocialRequest) => Promise<WorkerAnswer<T>>;
  readonly files: (pack: PostPack) => Promise<readonly File[]>;
  readonly toast: (text: string, tone: "ok" | "error" | "info", copy?: string) => void;
  readonly navigate: (url: string) => void;
  // The page's address now (the sites change it without reloading).
  readonly href: () => string;
  // Where a post waits while the page moves to another address of the same form.
  readonly storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  readonly waits?: Partial<Waits> | undefined;
  readonly copy?: ((text: string) => Promise<boolean>) | undefined;
  // How long to watch for the post going out, and between looks.
  readonly watchMs?: number;
  readonly lookupMs?: number;
}

export type RunOutcome = "idle" | "moved" | "filled" | "failed" | "found" | "not-found";

const carryKey = "slopify-post-carry";

function hashParams(href: string): URLSearchParams {
  return new URLSearchParams(new URL(href).hash.replace(/^#/, ""));
}

export async function runSocialPage(
  site: Site,
  doc: Document,
  deps: RunnerDeps,
): Promise<RunOutcome> {
  const location = new URL(deps.href());
  const hash = hashParams(location.toString());
  const waits = waitsOf(deps.waits);
  const lookup = hash.get(findHash);
  if (lookup !== null) return findLink(site, doc, deps, waits, lookup);

  const due = hash.has(dueHash);
  const late = hash.get("late") === "1";
  const carried = deps.storage?.getItem(carryKey) ?? null;
  deps.storage?.removeItem(carryKey);
  if (carried === null && !due && !site.isCompose(location)) return "idle";

  let active: ActivePost;
  if (carried !== null) active = JSON.parse(carried) as ActivePost;
  else {
    const answer = await deps.send<ActivePost>({ type: "social-next", platform: site.platform });
    if (!answer.ok) {
      // A post form opened by hand with nothing waiting is the person's own post.
      if (due) deps.toast(answer.message, "error");
      return "idle";
    }
    active = answer.value;
  }
  const { pack } = active;
  const moved = site.pageFor?.(pack, location) ?? null;
  if (moved !== null && carried === null) {
    deps.storage?.setItem(carryKey, JSON.stringify(active));
    deps.navigate(due ? `${moved}#${location.hash.replace(/^#/, "")}` : moved);
    return "moved";
  }
  return fillPost(site, doc, deps, waits, pack, { due, late });
}

async function fillPost(
  site: Site,
  doc: Document,
  deps: RunnerDeps,
  waits: Waits,
  pack: PostPack,
  flags: { readonly due: boolean; readonly late: boolean },
): Promise<RunOutcome> {
  const name = platformLabels[site.platform];
  const report = (
    state: "filled" | "failed" | "scheduled" | "posted",
    extra: Partial<Record<"url" | "message", string>> = {},
  ) =>
    deps.send<boolean>({
      type: "social-result",
      projectId: pack.projectId,
      platform: pack.platform,
      item: pack.item,
      state,
      ...extra,
      due: flags.due,
      late: flags.late,
      title: pack.projectTitle,
    });
  deps.toast(`Filling the ${name} post for ${pack.projectTitle}…`, "info");
  let files: readonly File[];
  try {
    files = await deps.files(pack);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await report("failed", { message });
    deps.toast(message, "error", pack.text);
    return "failed";
  }

  const press = pressFor(site);
  const stopPrompts = watchPrompts(doc, site.platform, press, () =>
    deps.toast(
      `${name} asked to change an account setting; Slopify closed it with Cancel and changed nothing.`,
      "info",
    ),
  );
  let result: SiteReport;
  try {
    const context: FillContext = {
      doc,
      location: new URL(deps.href()),
      pack,
      files,
      waits,
      press,
      copy: deps.copy,
    };
    result = await site.fill(context);
  } catch (error) {
    stopPrompts();
    const message =
      error instanceof RefusedClick
        ? error.message
        : `The ${name} fill stopped: ${error instanceof Error ? error.message : String(error)}. Fill the rest by hand (Copy has the text).`;
    await report("failed", { message });
    deps.toast(message, "error", pack.text);
    return "failed";
  }
  // The prompts keep coming a while after the fill (TikTok's, a few seconds after the video).
  setTimeout(stopPrompts, 2 * 60 * 1000);

  if (!result.filled) {
    const message =
      result.missing.length > 0
        ? `Nothing was filled: ${name}'s post form has changed, and Slopify couldn't find ${listed(result.missing)}. Press Copy for the post's text and fill it by hand. Updating the extension (Slopify → Settings → YouTube Studio → Download) may fix it.`
        : result.notes.map((note) => note.message).join(" ");
    await report("failed", { message });
    deps.toast(message, "error", pack.text);
    for (const note of result.notes)
      if (note.copy !== undefined) deps.toast(note.message, "error", note.copy);
    return "failed";
  }

  const problems = result.notes.filter((note) => !note.ok).map((note) => note.message);
  await report("filled", problems.length === 0 ? {} : { message: problems.join(" ") });
  for (const note of result.notes) deps.toast(note.message, note.ok ? "ok" : "error", note.copy);
  for (const warning of pack.warnings) deps.toast(warning.sentence, "info");
  deps.toast(
    result.scheduled
      ? `Filled. Check the post and press ${name}'s Schedule yourself: Slopify never posts.`
      : `Filled. Check the post and press ${name}'s Post yourself: Slopify never posts.`,
    "ok",
  );
  void watchPublished(site, doc, deps, waits, result.scheduled, (state, url) =>
    report(state, url === undefined ? {} : { url }),
  );
  return "filled";
}

// Looks for the site's sign that the post went out (or was scheduled), for up to `watchMs`,
// and reports it once.
export async function watchPublished(
  site: Site,
  doc: Document,
  deps: RunnerDeps,
  waits: Waits,
  scheduled: boolean,
  report: (state: "posted" | "scheduled", url?: string) => Promise<unknown>,
): Promise<boolean> {
  const until = deps.watchMs ?? 30 * 60 * 1000;
  for (let waited = 0; waited <= until; waited += 1000) {
    const seen = site.published(doc, new URL(deps.href()));
    if (seen !== null) {
      const url =
        seen.url !== undefined && linkPatterns[site.platform].test(seen.url) ? seen.url : undefined;
      // A post the site scheduled shows the same sign as one it posted, without a link.
      const state =
        seen.state === "posted" && scheduled && url === undefined ? "scheduled" : seen.state;
      await report(state, url);
      return true;
    }
    await waits.sleep(1000);
  }
  return false;
}

async function findLink(
  site: Site,
  doc: Document,
  deps: RunnerDeps,
  waits: Waits,
  raw: string,
): Promise<RunOutcome> {
  let lookup: LookupHash;
  try {
    lookup = JSON.parse(raw) as LookupHash;
  } catch {
    await deps.send({ type: "social-lookup-done" });
    return "not-found";
  }
  const limit = deps.lookupMs ?? 20_000;
  for (let waited = 0; waited <= limit; waited += 500) {
    const url = site.findLink(doc, new URL(deps.href()), lookup.start);
    if (url !== null && linkPatterns[site.platform].test(url)) {
      await deps.send({
        type: "social-result",
        projectId: lookup.projectId,
        platform: site.platform,
        state: "posted",
        url,
        lookup: true,
      });
      return "found";
    }
    await waits.sleep(500);
  }
  await deps.send({ type: "social-lookup-done" });
  return "not-found";
}
