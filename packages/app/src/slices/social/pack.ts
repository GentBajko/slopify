import { projectById } from "../admission/repo.js";
import { render } from "../admission/substitute.js";
import { fillWith } from "../keywords/fill.js";
import { keywordOf } from "../keywords/specs.js";
import { factValues } from "../keywords/values.js";
import { defaultReddit } from "./defaults.js";
import { mediaWarnings, redditWarnings, scheduleFor } from "./fit.js";
import { composeUrls, limitsFor, redditSubmitUrl } from "./limits.js";
import { mediaFor } from "./media.js";
import {
  type PostChoice,
  type PostPack,
  type PostPacks,
  type PostWarning,
  platformLabels,
  type SocialPlatform,
  socialPlatforms,
} from "./model.js";
import { type PostRecord, postsOf } from "./repo.js";
import { type PostSources, postSources, type SourceDeps } from "./sources.js";
import { countFor, fitText, hashtagsFor } from "./text.js";

export type PostPacksResult =
  | { readonly ok: true; readonly packs: PostPacks }
  | { readonly ok: false; readonly reason: "unknown-project" };

// The settings a site's post is made with: the project's own pick, else its template's. Off
// for this project, or a site neither turned on, has none.
export function choiceOf(
  settings: PostSources["config"]["social"],
  record: PostRecord | undefined,
  platform: SocialPlatform,
): { readonly choice: PostChoice; readonly chosenHere: boolean } | undefined {
  const own = record?.choice ?? null;
  if (own !== null) return "off" in own ? undefined : { choice: own, chosenHere: true };
  const base = settings?.[platform];
  return base === undefined ? undefined : { choice: base, chosenHere: false };
}

// Every site the project posts to, each with its post as Prepare upload shows it and the
// extension fills it. A project with no posting settings and no picks of its own has none.
export function postPacks(deps: SourceDeps, projectId: string, now: Date): PostPacksResult {
  const project = projectById(deps.db, projectId);
  if (project === undefined) return { ok: false, reason: "unknown-project" };
  const records = postsOf(deps.db, projectId);
  const settings = project.config.social;
  const wanted = socialPlatforms.filter(
    (platform) =>
      choiceOf(
        settings,
        records.find((one) => one.platform === platform),
        platform,
      ) !== undefined,
  );
  if (wanted.length === 0) return { ok: true, packs: { projectId, packs: [] } };
  const sources = postSources(deps, projectId);
  if (sources === undefined) return { ok: false, reason: "unknown-project" };
  const packs = wanted.flatMap((platform) => {
    const record = records.find((one) => one.platform === platform && one.item === 0);
    const pack = buildPack(sources, platform, record, now);
    return pack === undefined ? [] : [pack];
  });
  return { ok: true, packs: { projectId, packs } };
}

export function packFor(
  deps: SourceDeps,
  projectId: string,
  platform: SocialPlatform,
  now: Date,
): PostPack | undefined {
  const result = postPacks(deps, projectId, now);
  return result.ok ? result.packs.packs.find((pack) => pack.platform === platform) : undefined;
}

function bodyFor(sources: PostSources, choice: PostChoice, platform: SocialPlatform): string {
  switch (choice.text) {
    case "description":
      return sources.description;
    case "summary":
      return sources.summary;
    case "title":
      return sources.title;
    case "prompt":
      return sources.written[platform] ?? "";
    case "custom":
      return customText(sources, choice.custom ?? "");
    case "none":
      return "";
  }
}

// The person's own words with their fields and the keywords Slopify fills: the facts copied
// when the run started, and the summary. A keyword with no value leaves its line out.
function customText(sources: PostSources, custom: string): string {
  const own = render(custom, sources.config.values);
  const values: Record<string, string> = {
    ...factValues(sources.config.keywordFacts, sources.title, "description"),
    Slopify_Summary: sources.summary,
  };
  const filled = fillWith(own, (name) =>
    keywordOf(name)?.name === name
      ? Object.hasOwn(values, name)
        ? (values[name] ?? "")
        : ""
      : undefined,
  );
  return filled.ok ? filled.text.trim() : own.trim();
}

function buildPack(
  sources: PostSources,
  platform: SocialPlatform,
  record: PostRecord | undefined,
  now: Date,
): PostPack | undefined {
  const picked = choiceOf(sources.config.social, record, platform);
  if (picked === undefined) return undefined;
  const { choice } = picked;
  const site = platformLabels[platform];
  const tier = sources.channel.xTier;
  const limits = limitsFor(platform, tier);
  const warnings: PostWarning[] = [];

  const { media, warnings: mediaMissing } = mediaFor(platform, choice.media, sources.media);
  warnings.push(...mediaMissing, ...mediaWarnings(platform, media, tier));

  const body = bodyFor(sources, choice, platform);
  if (choice.text !== "none" && body === "")
    warnings.push({ code: "text-missing", sentence: missingText(choice, site) });
  const link = choice.link ? sources.youtubeLink : null;
  if (choice.link && link === null)
    warnings.push({
      code: "link-missing",
      sentence:
        "The YouTube link isn't known yet, so the post goes without it. It is added once the video is on YouTube (Prepare upload → Fill in YouTube Studio, or paste the video's link there).",
    });
  const hashtags = hashtagsFor(
    [sources.tags, sources.shortHashtags],
    Math.min(choice.hashtags, limits.hashtags),
  );
  const fitted = fitText({ body, link, hashtags }, limits, site);
  if (fitted.notice !== undefined) warnings.push({ code: "text-cut", sentence: fitted.notice });
  const edit = record?.textEdit ?? null;
  const text = edit ?? fitted.text;
  const used = countFor(text, limits.unit);
  if (edit !== null && used > limits.text)
    warnings.push({
      code: "text-too-long",
      sentence: `The text is ${String(used)} characters; ${site} takes ${String(limits.text)}. Shorten it in the post's text box, or press Reset to go back to the written text.`,
    });

  const main = media.find((one) => one.kind === "short" || one.kind === "video");
  const shortNumber = main?.kind === "short" ? (choice.media.short ?? 1) : undefined;
  const item =
    shortNumber === undefined
      ? sources.youtube.items[0]
      : sources.youtube.items.find((one) => one.kind === "short" && one.short === shortNumber);
  const release = scheduleFor(platform, item?.scheduleAt ?? null, now);
  warnings.push(...release.warnings);

  const reddit =
    platform === "reddit"
      ? (record?.reddit ?? defaultReddit(sources.title.slice(0, 300)))
      : undefined;
  if (reddit !== undefined) warnings.push(...redditWarnings(reddit));

  return {
    projectId: sources.projectId,
    projectTitle: sources.title,
    platform,
    item: 0,
    choice,
    chosenHere: picked.chosenHere,
    text,
    generated: fitted.text,
    edited: edit !== null,
    count: { used, max: limits.text, unit: limits.unit },
    hashtags,
    link,
    media,
    aiLabel: limits.aiLabel && media.length > 0,
    schedule: release.schedule,
    ...(reddit === undefined ? {} : { reddit }),
    ...(platform === "x" ? { xTier: tier } : {}),
    composeUrl:
      reddit === undefined
        ? composeUrls[platform]
        : redditSubmitUrl({
            subreddit: reddit.subreddit,
            title: reddit.title,
            ...(reddit.kind === "text" ? { text } : {}),
            ...(reddit.kind === "link" && sources.youtubeLink !== null
              ? { url: sources.youtubeLink }
              : {}),
          }),
    warnings,
    status: {
      state: record?.state ?? "none",
      url: record?.url ?? null,
      message: record?.message ?? null,
      at:
        record === undefined
          ? null
          : (record.postedAt ?? record.scheduledAt ?? record.filledAt ?? record.waitingAt),
      by: record?.by ?? null,
    },
  };
}

function missingText(choice: PostChoice, site: string): string {
  switch (choice.text) {
    case "prompt":
      return `The ${site} post isn't written yet. It is written by the post prompt after the video's description; let the run finish, or use Continue the run on the project page.`;
    case "description":
    case "summary":
      return `There is no description to post yet. Let the Video stage write the YouTube description, or pick another text source for ${site}.`;
    case "custom":
      return `The post's own text is empty. Type it in the post's settings, or pick another text source for ${site}.`;
    case "title":
    case "none":
      return `The post has no text. Pick a text source for ${site}.`;
  }
}
