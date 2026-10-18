// The facts a run copies when it starts, for the keywords Slopify fills from them: what the
// channel, its links, its cast, its brand kit and its other projects are now. Later edits there
// never change a project already made; Edit project's Refresh keyword facts copies them again.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import type { RunDraft } from "../admission/model.js";
import { listProjects } from "../admission/repo.js";
import { castOfChannel, channelById, projectChannels, resolveChannelId } from "../channels/repo.js";
import { readFontMetadata } from "../fonts/sfnt.js";
import { seriesOf } from "../studio/plan-model.js";
import { allReleases } from "../studio/releases.js";
import { videoOf } from "../studio/videos.js";
import { readChannelLinksFor } from "../youtube/edits-repo.js";
import type { KeywordFacts } from "./values.js";

// ceiling: the titles a prompt is told about. A channel with hundreds of videos would fill the
// prompt with titles; the newest are the ones it is likeliest to repeat.
export const coveredBeforeMax = 50;

export interface FactsDeps {
  readonly db: DatabaseSync;
  readonly paths: Pick<Paths, "dataDir">;
}

// `projectId` is the project the facts are for, when it exists already (a refresh): it is
// neither its own previous video nor one it covered before.
export function keywordFactsFor(
  deps: FactsDeps,
  draft: Pick<RunDraft, "channelId" | "useBrandKit"> & {
    readonly title: string;
    readonly titlePattern?: string | undefined;
  },
  now: Date,
  projectId?: string,
): KeywordFacts {
  const { db } = deps;
  const channelId = resolveChannelId(db, draft.channelId);
  const channel = channelById(db, channelId);
  const channels = projectChannels(db);
  const projects = listProjects(db);
  // A refresh sees the channel as it was before this project, never the episodes made after it.
  const made = projects.find((project) => project.id === projectId)?.createdAt;
  const own = projects.filter(
    (project) =>
      project.id !== projectId &&
      (made === undefined || project.createdAt < made) &&
      (channels.get(project.id) ?? channelId) === channelId,
  );
  const series = seriesOf(draft);
  const sameSeries = own.filter((project) => seriesOf(project.config) === series);
  const later = projects.filter(
    (project) =>
      project.id !== projectId &&
      seriesOf(project.config) === series &&
      (channels.get(project.id) ?? channelId) === channelId,
  );
  const previous = sameSeries[0];
  const previousVideo =
    previous === undefined ? undefined : videoOf(db, previous.id, null)?.videoId;
  const upcoming = allReleases(db).find(
    (release) =>
      release.short === 0 &&
      Date.parse(release.at) > now.getTime() &&
      later.some((project) => project.id === release.projectId),
  );
  const next =
    upcoming === undefined ? undefined : later.find((one) => one.id === upcoming.projectId);
  const links = readChannelLinksFor(db, channelId);
  const cast = castOfChannel(db, channelId);
  const brand = draft.useBrandKit === false ? undefined : channel?.brand;
  const colours = unique([brand?.captionColor, brand?.captionOutlineColor, brand?.titleColor]);
  const fonts = unique(
    [brand?.captionFontId, brand?.titleFontId].map((id) =>
      id === undefined ? undefined : fontName(deps.paths, id),
    ),
  );
  return {
    ...(channel === undefined ? {} : { channel: channel.name }),
    ...(channel?.seriesBrief.trim() ? { series: channel.seriesBrief.trim() } : {}),
    ...(links.length === 0 ? {} : { links: links.map(({ name, url }) => ({ name, url })) }),
    ...(previous === undefined
      ? {}
      : {
          previousVideo: {
            title: previous.title,
            ...(previousVideo === undefined ? {} : { url: `https://youtu.be/${previousVideo}` }),
          },
        }),
    ...(next === undefined ? {} : { nextVideo: { title: next.title } }),
    ...(cast.length === 0
      ? {}
      : { cast: cast.map(({ name, description }) => ({ name, description })) }),
    ...(own.length === 0
      ? {}
      : { coveredBefore: own.slice(0, coveredBeforeMax).map((project) => project.title) }),
    episode: sameSeries.length + 1,
    ...(colours.length === 0 && fonts.length === 0 ? {} : { brand: { colours, fonts } }),
  };
}

// A brand-kit font's name: the bundled one's, or an uploaded font's own. A system font is
// found only by scanning the computer's font folders, which a run's start never waits for, so
// it is left out.
function fontName(paths: Pick<Paths, "dataDir">, id: string): string | undefined {
  if (id === "default") return "Barlow";
  if (!/^uploaded-[a-f0-9]{64}$/.test(id)) return undefined;
  for (const extension of [".ttf", ".otf"]) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(paths.dataDir, "fonts", `${id}${extension}`));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
      throw error;
    }
    return readFontMetadata(bytes)?.[0]?.family;
  }
  return undefined;
}

function unique(values: readonly (string | undefined)[]): readonly string[] {
  return [...new Set(values.filter((value): value is string => value !== undefined))];
}
