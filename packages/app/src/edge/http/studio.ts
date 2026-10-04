import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { derive } from "../../kernel/runner/graph.js";
import { listProjects, projectById, stagesOf } from "../../slices/admission/repo.js";
import { channelById } from "../../slices/channels/repo.js";
import { scheduleById, scheduleRunOfProject } from "../../slices/schedules/repo.js";
import { readSetting, writeSetting } from "../../slices/settings/repo.js";
import { findDownload } from "../../slices/storage/downloads.js";
import { backfillVideos } from "../../slices/studio/backfill.js";
import { releaseCalendar } from "../../slices/studio/calendar.js";
import {
  type FillQueueItem,
  playlistUses,
  studioPlaylistMax,
  studioUploadUrl,
} from "../../slices/studio/model.js";
import { packItem, uploadPack } from "../../slices/studio/pack.js";
import { channelPerformance } from "../../slices/studio/performance.js";
import { writeUploadPick } from "../../slices/studio/pick.js";
import {
  postingPlanSchema,
  readPlan,
  readStoredPlan,
  weekdayIn,
  writePlan,
} from "../../slices/studio/plan.js";
import { leadHoursMax, seriesOf } from "../../slices/studio/plan-model.js";
import {
  enqueueFill,
  type FillEntry,
  fillOnly,
  readFillQueue,
  removeFill,
} from "../../slices/studio/queue.js";
import {
  allReleases,
  freeSlots,
  type PlanWho,
  planReleases,
  readLeadHours,
  releasesOf,
  setRelease,
  swapReleases,
  writeLeadHours,
} from "../../slices/studio/releases.js";
import { parseStudioExport, readReport, saveReport } from "../../slices/studio/report.js";
import { statsFromReport } from "../../slices/studio/report-stats.js";
import {
  autoCommentKey,
  bearerToken,
  exportViewProblem,
  exportViews,
  isExtensionOrigin,
  pairStudioExtension,
  readChannelPlaylists,
  readExportView,
  readStudioPlaylists,
  resetStudioPairing,
  saveExportView,
  saveProjectPlaylists,
  saveRealFootage,
  saveStudioPlaylists,
  studioPairing,
  studioPlaylistsMax,
  studioPlaylistsProblem,
  studioRequestAllowed,
} from "../../slices/studio/settings.js";
import {
  abResults,
  abVariantSchema,
  projectStats,
  saveAbResult,
  saveStats,
} from "../../slices/studio/stats.js";
import {
  confirmUpload,
  doneVideos,
  forgetVideo,
  projectVideos,
  recordVideo,
  setChecks,
  setTaskState,
  videoIdOf,
  videoIdPattern,
  videoOf,
  waitingTasks,
  type YoutubeVideo,
} from "../../slices/studio/videos.js";
import { setAsideProjects, uploadedProjects } from "../../slices/uploads/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const projectParam = z.object({ projectId: id });
const fileParam = z.object({
  projectId: id,
  asset: z
    .string()
    .max(64)
    .regex(/^[a-z0-9-]+$/),
});
const chooseBody = z.object({ short: z.number().int().min(1).max(99).optional() });
const queueItemBody = z.object({
  projectId: id,
  short: z.number().int().min(1).max(99).nullable().optional(),
});
const playlistsBody = z.object({
  playlists: z
    .array(
      z.object({
        name: z.string().max(studioPlaylistMax * 2),
        byDefault: z.boolean(),
        // Long videos, shorts or both (absent: both).
        for: z.enum(playlistUses).optional(),
      }),
    )
    .max(studioPlaylistsMax),
  // A channel's own list; absent is the default every other channel uses.
  channelId: id.optional(),
});
// The names this project's uploads go into; null goes back to the channel's defaults.
const projectPlaylistsBody = z.object({
  playlists: z.array(z.string().max(studioPlaylistMax)).max(studioPlaylistsMax).nullable(),
});
const realFootageBody = z.object({ realFootage: z.boolean() });
const pickBody = z.object({
  title: z.number().int().min(0).max(9),
  thumbnail: z.number().int().min(0).max(9),
});
const shortField = z.number().int().min(1).max(99).nullable().optional();
const extVideoBody = z.object({
  projectId: id,
  short: shortField,
  videoId: z.string().regex(videoIdPattern),
});
const videoLinkBody = z.object({ short: shortField, link: z.string().max(500) });
const slotBody = z.object({
  slot: z.object({ row: z.string().min(1).max(20), longAt: z.string().max(40) }).nullable(),
});
const taskResultBody = z.object({
  task: z.enum(["finish", "comment"]),
  projectId: id,
  short: shortField,
  ok: z.boolean(),
  message: z.string().max(2000),
});
const statsBody = z.object({
  projectId: id,
  short: shortField,
  videoId: z.string().regex(videoIdPattern),
  impressions: z.number().nonnegative().optional(),
  ctr: z.number().min(0).max(100).optional(),
  views: z.number().nonnegative().optional(),
  averageViewSeconds: z.number().nonnegative().optional(),
  watchHours: z.number().nonnegative().optional(),
  abVariants: z.array(abVariantSchema).max(3).optional(),
});
const backfillBody = z.object({
  videos: z
    .array(
      z.object({
        title: z.string().max(200),
        videoId: z.string().regex(videoIdPattern),
        checks: z.string().max(100).optional(),
      }),
    )
    .max(200),
  close: z.boolean().optional(),
});
// The extension builds the app ships (`scripts/copy-extension.mjs`), by browser.
const extensionFiles: Readonly<Record<string, string>> = {
  "chrome.zip": "slopify-studio-chrome.zip",
  "firefox.zip": "slopify-studio-firefox.zip",
};
const extensionParam = z.object({ file: z.enum(["chrome.zip", "firefox.zip"]) });

// The Studio routes. The ones under `/ext` are the only routes of the app a page from another
// origin may read, and only the paired browser extension: every request carries the pairing
// token, and the CORS headers name the paired extension's origin, never a web page's and never
// `*`. The rest are the Slopify page's own, refused from any other origin.
export function studioRoutes(deps: AppDeps) {
  // What waits to be filled, with each project's title; entries whose project is gone are left
  // out (the extension drops them when it reaches them).
  const queueView = (entries: readonly FillEntry[]): readonly FillQueueItem[] =>
    entries.flatMap((entry) => {
      const project = projectById(deps.db, entry.projectId);
      return project === undefined ? [] : [{ ...entry, projectTitle: project.title }];
    });

  const samePage = (c: Context): Response | undefined => {
    const origin = c.req.header("origin");
    if (origin === undefined || origin === new URL(c.req.url).origin) return undefined;
    return problem(c, {
      status: 403,
      title: titleOf(403),
      detail:
        "For your safety, YouTube Studio settings can only be changed from the Slopify page itself. Open Slopify and try again there.",
    });
  };
  // The CORS headers for the extension: its own origin, echoed only when it is allowed.
  const allowOrigin = (c: Context, pairing: boolean): void => {
    const origin = c.req.header("origin");
    const paired = studioPairing(deps.db).origin;
    c.header("Vary", "Origin");
    if (!isExtensionOrigin(origin)) return;
    if (origin === paired || pairing) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Headers", "authorization, content-type");
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      c.header("Access-Control-Max-Age", "600");
    }
  };
  const refused = (c: Context): Response =>
    problem(c, {
      status: 401,
      title: "Unauthorized",
      detail:
        "The Slopify Studio extension isn't paired with this Slopify. Copy the pairing token from Slopify's Settings → YouTube Studio into the extension's options and press Pair.",
    });

  // A project's place in the plan: its series, and the schedule and run day that made it.
  const whoOf = (projectId: string, series: string): PlanWho => {
    const run = scheduleRunOfProject(deps.db, projectId);
    if (run === undefined) return { series };
    const schedule = scheduleById(deps.db, run.scheduleId);
    return {
      series,
      schedule: run.scheduleId,
      runDay: weekdayIn(schedule?.timezone ?? "UTC", new Date(run.scheduledFor)),
    };
  };
  // A project ready to upload gets its release times from the posting plan when its upload is
  // prepared (`releases.ts`).
  // A long video already on YouTube keeps when it went up; its shorts still get times.
  const planned = (projectId: string): void => {
    const long = videoOf(deps.db, projectId, null);
    const out = long?.uploadState === "done" ? long.recordedAt : undefined;
    const result = uploadPack(deps, projectId);
    if (!result.ok || (out === undefined && result.pack.items[0]?.video == null)) return;
    planReleases(
      deps.db,
      readPlan(deps.db),
      {
        id: projectId,
        ...whoOf(projectId, result.pack.series),
        shorts: result.pack.items.filter((item) => item.kind === "short").length,
        ...(out === undefined ? {} : { longOut: out }),
      },
      deps.clock.now(),
    );
  };
  // Settings shows only the lines saved there; each schedule shows its own.
  const planBody = () => ({
    plan: readStoredPlan(deps.db),
    leadHours: readLeadHours(deps.db),
    series: [...new Set(listProjects(deps.db).map((project) => seriesOf(project.config)))]
      .filter((one) => one !== "")
      .toSorted(),
  });
  // A report and, for each of its videos Slopify made, the project and which upload it is.
  const reportBody = (channelId: string) => {
    const report = readReport(deps.db, channelId);
    const known = new Map(
      listProjects(deps.db).flatMap((project) =>
        projectVideos(deps.db, project.id).map(
          (video) =>
            [
              video.videoId,
              { projectId: project.id, short: video.short, projectTitle: project.title },
            ] as const,
        ),
      ),
    );
    return {
      exportView: readExportView(deps.db, channelId),
      report,
      projects:
        report === null
          ? {}
          : Object.fromEntries(
              report.rows.flatMap((row) => {
                const found = known.get(row.videoId);
                return found === undefined ? [] : [[row.videoId, found]];
              }),
            ),
    };
  };
  const slotChoices = (projectId: string, series: string) =>
    freeSlots(deps.db, readPlan(deps.db), whoOf(projectId, series), deps.clock.now(), 9);
  // Finished projects not marked uploaded: the popup's list and the calendar's candidates.
  const finishedProjects = () => {
    const uploads = uploadedProjects(deps.db);
    const aside = setAsideProjects(deps.db);
    return listProjects(deps.db).filter((project) => {
      if (uploads.has(project.id)) return false;
      const state = derive(stagesOf(deps.db, project.id), project.paused === true);
      return (
        state === "done" || state === "partial" || (state === "pending" && aside.has(project.id))
      );
    });
  };
  const extAllowed = (c: Context): boolean =>
    studioRequestAllowed(
      deps.db,
      bearerToken(c.req.header("authorization")),
      c.req.header("origin"),
    );
  return (
    new Hono()
      .get("/settings", (c) => {
        // The token is read only by the Slopify page, never by another origin's.
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        return c.json({
          playlists: readStudioPlaylists(deps.db),
          channelPlaylists: readChannelPlaylists(deps.db),
          pairing: studioPairing(deps.db),
          autoComment: readSetting(deps.db, autoCommentKey) === "on",
        });
      })
      // Post and pin each video's comment once it is public (opt-in: it posts in your name).
      .put(
        "/settings/auto-comment",
        zValidator("json", z.object({ on: z.boolean() }), onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          writeSetting(deps.db, autoCommentKey, c.req.valid("json").on ? "on" : "off");
          return c.json({ autoComment: c.req.valid("json").on });
        },
      )
      // The posting plan, its lead time, and the series the projects use (for the lines' picker).
      .get("/plan", (c) => c.json(planBody()))
      .put("/plan", zValidator("json", postingPlanSchema, onInvalid), (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        writePlan(deps.db, c.req.valid("json"));
        return c.json(planBody());
      })
      .put(
        "/settings/lead-hours",
        zValidator(
          "json",
          z.object({ hours: z.number().int().min(1).max(leadHoursMax) }).strict(),
          onInvalid,
        ),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          writeLeadHours(deps.db, c.req.valid("json").hours);
          return c.json(planBody());
        },
      )
      // Calendar → Releases: the coming weeks' long videos and shorts with their times and
      // states, the plan's free times, and the finished projects that could fill them.
      .get(
        "/releases",
        zValidator("query", z.object({ weeks: z.coerce.number().int().min(1).max(8).optional() })),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const finished = finishedProjects();
          // Every finished project gets its times, and so does any project already holding a
          // release (its shorts may still need theirs).
          for (const id of new Set([
            ...finished.map((project) => project.id),
            ...allReleases(deps.db).map((release) => release.projectId),
          ]))
            planned(id);
          return c.json(
            releaseCalendar(deps, {
              now: deps.clock.now(),
              weeks: c.req.valid("query").weeks ?? 2,
              candidates: finished.map((project) => project.id),
            }),
          );
        },
      )
      // One project's release times (its long video and each short, with their upload-by), the
      // plan's free times for its series, for the project page's Release block.
      .get("/releases/:projectId", zValidator("param", projectParam, onInvalid), (c) => {
        const { projectId } = c.req.valid("param");
        planned(projectId);
        const pack = uploadPack(deps, projectId);
        if (!pack.ok) return unknownProject(c);
        const leadMs = readLeadHours(deps.db) * 3_600_000;
        const releases = releasesOf(deps.db, projectId);
        return c.json({
          leadHours: readLeadHours(deps.db),
          items: pack.pack.items
            .filter((item) => item.video !== null || item.kind === "video")
            .map((item) => {
              const short = item.short ?? 0;
              const at = releases.find((release) => release.short === short)?.at ?? "";
              return {
                short,
                title: item.title,
                at: at === "" ? null : at,
                uploadBy: at === "" ? null : new Date(Date.parse(at) - leadMs).toISOString(),
                onYoutube: videoOf(deps.db, projectId, item.short ?? null)?.uploadState === "done",
              };
            }),
          free: slotChoices(projectId, pack.pack.series),
        });
      })
      // Swap with…: two videos trade their release times; their shorts follow each.
      .post(
        "/releases/:projectId/swap",
        zValidator("param", projectParam, onInvalid),
        zValidator("json", z.object({ with: id }).strict(), onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId } = c.req.valid("param");
          const other = c.req.valid("json").with;
          const swapped = transact(deps.db, () =>
            swapReleases(deps.db, projectId, other, deps.clock.now()),
          );
          if (!swapped)
            return problem(c, {
              status: 409,
              title: titleOf(409),
              detail:
                "Both videos need a release time to swap. Give this one a time first, or reload the page and pick another video.",
            });
          planned(projectId);
          planned(other);
          return c.json({ releases: releasesOf(deps.db, projectId) });
        },
      )
      // Moves one release (a time), sets it to "not scheduled" (null), or puts a project into a
      // free time of the plan (short 0 with its line).
      .put(
        "/releases/:projectId",
        zValidator("param", projectParam, onInvalid),
        zValidator(
          "json",
          z
            .object({
              short: z.number().int().min(0).max(99),
              at: z.iso.datetime().nullable(),
              line: z.string().min(1).max(20).optional(),
            })
            .strict(),
          onInvalid,
        ),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId } = c.req.valid("param");
          if (uploadPack(deps, projectId).ok === false) return unknownProject(c);
          const { short, at, line } = c.req.valid("json");
          setRelease(deps.db, projectId, short, at ?? "", line ?? null, deps.clock.now());
          planned(projectId);
          return c.json({ releases: releasesOf(deps.db, projectId) });
        },
      )
      .put("/settings/playlists", zValidator("json", playlistsBody, onInvalid), (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        const { playlists: raw, channelId } = c.req.valid("json");
        if (channelId !== undefined && channelById(deps.db, channelId) === undefined)
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail:
              "The playlists weren't saved: that channel no longer exists. Reload Settings → YouTube Studio and pick the channel again.",
          });
        const invalid = studioPlaylistsProblem(raw);
        if (invalid !== undefined)
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: invalid,
            extensions: { fields: [{ field: "playlists", message: invalid }] },
          });
        return c.json({
          playlists: saveStudioPlaylists(deps.db, raw, channelId),
          channelId: channelId ?? null,
        });
      })
      .post("/settings/pairing", (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        return c.json({ pairing: resetStudioPairing(deps.db) });
      })
      .get("/packs/:projectId", zValidator("param", projectParam, onInvalid), (c) => {
        const { projectId } = c.req.valid("param");
        planned(projectId);
        const result = uploadPack(deps, projectId);
        if (!result.ok) return unknownProject(c);
        return c.json({ ...result.pack, slotChoices: slotChoices(projectId, result.pack.series) });
      })
      // Prepare upload's slot picker: another free slot of the plan, or none.
      .put(
        "/packs/:projectId/slot",
        zValidator("param", projectParam, onInvalid),
        zValidator("json", slotBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId } = c.req.valid("param");
          const wanted = c.req.valid("json").slot;
          const before = uploadPack(deps, projectId);
          if (!before.ok) return unknownProject(c);
          if (wanted === null) setRelease(deps.db, projectId, 0, "", null, deps.clock.now());
          else {
            const free = slotChoices(projectId, before.pack.series).some(
              (one) => one.row === wanted.row && one.longAt === wanted.longAt,
            );
            if (!free)
              return problem(c, {
                status: 409,
                title: titleOf(409),
                detail:
                  "That slot is taken or past. Reload Prepare upload and choose one of the slots it lists.",
              });
            setRelease(deps.db, projectId, 0, wanted.longAt, wanted.row, deps.clock.now());
          }
          planned(projectId);
          const result = uploadPack(deps, projectId);
          return result.ok
            ? c.json({ ...result.pack, slotChoices: slotChoices(projectId, result.pack.series) })
            : unknownProject(c);
        },
      )
      // Prepare upload's AI use tick: the project's uploaded clips are real footage.
      .put(
        "/packs/:projectId/real-footage",
        zValidator("param", projectParam, onInvalid),
        zValidator("json", realFootageBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId } = c.req.valid("param");
          if (!uploadPack(deps, projectId).ok) return unknownProject(c);
          saveRealFootage(deps.db, projectId, c.req.valid("json").realFootage);
          const result = uploadPack(deps, projectId);
          return result.ok ? c.json(result.pack) : unknownProject(c);
        },
      )
      // Prepare upload's pick: which title and thumbnail the upload carries; the A/B test tries
      // the others once the video is public.
      .put(
        "/packs/:projectId/pick",
        zValidator("param", projectParam, onInvalid),
        zValidator("json", pickBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId } = c.req.valid("param");
          if (!uploadPack(deps, projectId).ok) return unknownProject(c);
          writeUploadPick(deps.db, projectId, c.req.valid("json"));
          const result = uploadPack(deps, projectId);
          return result.ok ? c.json(result.pack) : unknownProject(c);
        },
      )
      // Prepare upload's playlist ticks: which of the channel's playlists this project goes into.
      .put(
        "/packs/:projectId/playlists",
        zValidator("param", projectParam, onInvalid),
        zValidator("json", projectPlaylistsBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId } = c.req.valid("param");
          if (!uploadPack(deps, projectId).ok) return unknownProject(c);
          saveProjectPlaylists(deps.db, projectId, c.req.valid("json").playlists);
          const result = uploadPack(deps, projectId);
          return result.ok ? c.json(result.pack) : unknownProject(c);
        },
      )
      .post(
        "/packs/:projectId/choose",
        zValidator("param", projectParam, onInvalid),
        zValidator("json", chooseBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId } = c.req.valid("param");
          const { short } = c.req.valid("json");
          const result = uploadPack(deps, projectId);
          if (!result.ok) return unknownProject(c);
          if (packItem(result.pack, short) === undefined)
            return problem(c, {
              status: 404,
              title: titleOf(404),
              detail: `This project has no short ${String(short)}. Reload the project page and press Prepare upload again.`,
            });
          const queue = enqueueFill(deps.db, projectId, short ?? null, deps.clock.now());
          return c.json({ chosen: { projectId, short: short ?? null }, queue: queueView(queue) });
        },
      )
      // What waits for the extension, oldest first: each new upload dialog takes the first.
      // Studio's numbers for a project's videos, and every finished A/B test (Library).
      .get("/stats/:projectId", zValidator("param", projectParam, onInvalid), (c) =>
        c.json({ stats: projectStats(deps.db, c.req.valid("param").projectId) }),
      )
      .get("/ab-results", (c) => c.json({ results: abResults(deps.db) }))
      // Channels → YouTube numbers: Studio's Advanced-mode export, imported as the zip Studio
      // downloads, and which project each of its videos is.
      .get(
        "/channels/:channelId/report",
        zValidator("param", z.object({ channelId: id }), onInvalid),
        (c) => c.json(reportBody(c.req.valid("param").channelId)),
      )
      .post(
        "/channels/:channelId/report",
        zValidator("param", z.object({ channelId: id }), onInvalid),
        bodyLimit({
          maxSize: 30 * 1024 * 1024,
          onError: (c) =>
            problem(c, {
              status: 413,
              title: titleOf(413),
              detail:
                "That file is larger than 30 MB, which a Studio export never is. Export again from Studio's Advanced mode and import the zip it downloads.",
            }),
        }),
        async (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { channelId } = c.req.valid("param");
          const parsed = parseStudioExport(
            new Uint8Array(await c.req.arrayBuffer()),
            deps.clock.now().toISOString(),
          );
          if (!parsed.ok)
            return problem(c, { status: 400, title: titleOf(400), detail: parsed.message });
          saveReport(deps.db, channelId, parsed.report);
          statsFromReport(deps.db, parsed.report, parsed.report.importedAt);
          return c.json(reportBody(channelId));
        },
      )
      // The Analytics view the extension exports every day for this channel; null forgets it.
      .put(
        "/channels/:channelId/export-view",
        zValidator("param", z.object({ channelId: id }), onInvalid),
        zValidator("json", z.object({ url: z.string().max(4000).nullable() }), onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { channelId } = c.req.valid("param");
          const { url } = c.req.valid("json");
          const wrong = url === null || url.trim() === "" ? undefined : exportViewProblem(url);
          if (wrong !== undefined)
            return problem(c, {
              status: 400,
              title: titleOf(400),
              detail: wrong,
              extensions: { fields: [{ field: "url", message: wrong }] },
            });
          saveExportView(deps.db, channelId, url);
          return c.json(reportBody(channelId));
        },
      )
      // The extension: each channel's Analytics view to export.
      .get("/ext/export-views", (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        return c.json({ views: exportViews(deps.db) });
      })
      // The extension exported a channel's view: the zip Studio's Export makes, as Studio sends
      // it (base64). Saved as an import would be, and each known video's numbers with it.
      .post(
        "/ext/report",
        bodyLimit({
          maxSize: 40 * 1024 * 1024,
          onError: (c) =>
            problem(c, {
              status: 413,
              title: titleOf(413),
              detail: "Studio's export was larger than Slopify takes (40 MB).",
            }),
        }),
        zValidator(
          "json",
          z.object({
            channelId: id,
            zippedData: z
              .string()
              .min(1)
              .max(40 * 1024 * 1024),
          }),
          onInvalid,
        ),
        (c) => {
          allowOrigin(c, false);
          if (!extAllowed(c)) return refused(c);
          const { channelId, zippedData } = c.req.valid("json");
          const now = deps.clock.now().toISOString();
          const parsed = parseStudioExport(
            new Uint8Array(Buffer.from(zippedData, "base64url")),
            now,
          );
          if (!parsed.ok)
            return problem(c, { status: 400, title: titleOf(400), detail: parsed.message });
          saveReport(deps.db, channelId, parsed.report);
          const videos = statsFromReport(deps.db, parsed.report, now);
          return c.json({ rows: parsed.report.rows.length, videos });
        },
      )
      // Channels → YouTube: the channel's videos on YouTube with Studio's numbers and totals.
      .get(
        "/channels/:channelId/performance",
        zValidator("param", z.object({ channelId: id }), onInvalid),
        (c) => c.json(channelPerformance(deps, c.req.valid("param").channelId)),
      )
      // The YouTube videos a project's uploads became, and their A/B tests.
      .get("/videos/:projectId", zValidator("param", projectParam, onInvalid), (c) =>
        c.json({ videos: projectVideos(deps.db, c.req.valid("param").projectId) }),
      )
      // A video's link pasted in Slopify, for an upload made without the extension; an empty
      // link forgets it.
      .put(
        "/videos/:projectId",
        zValidator("param", projectParam, onInvalid),
        zValidator("json", videoLinkBody, onInvalid),
        (c) => {
          const wrong = samePage(c);
          if (wrong !== undefined) return wrong;
          const { projectId } = c.req.valid("param");
          const { short, link } = c.req.valid("json");
          if (link.trim() === "") {
            forgetVideo(deps.db, projectId, short ?? null);
            return c.json({ videos: projectVideos(deps.db, projectId) });
          }
          const videoId = videoIdOf(link);
          if (videoId === undefined)
            return problem(c, {
              status: 400,
              title: titleOf(400),
              detail:
                "That isn't a YouTube video link. Copy the video's link from YouTube Studio (Details → Video link, like https://youtu.be/…) and paste it again.",
            });
          recordVideo(deps.db, projectId, short ?? null, videoId, deps.clock.now().toISOString());
          return c.json({ videos: projectVideos(deps.db, projectId) });
        },
      )
      .get("/queue", (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        return c.json({ queue: queueView(readFillQueue(deps.db, deps.clock.now())) });
      })
      .post("/queue/remove", zValidator("json", queueItemBody, onInvalid), (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        const { projectId, short } = c.req.valid("json");
        return c.json({
          queue: queueView(removeFill(deps.db, projectId, short ?? null, deps.clock.now())),
        });
      })
      // The extension's own zips, for Settings' and Prepare upload's Download.
      .get("/extension/:file", zValidator("param", extensionParam, onInvalid), (c) => {
        const { file } = c.req.valid("param");
        const name = extensionFiles[file] ?? "";
        const path = deps.extensionDist === undefined ? undefined : join(deps.extensionDist, name);
        const stat = path === undefined ? undefined : statSync(path, { throwIfNoEntry: false });
        if (path === undefined || stat === undefined || !stat.isFile())
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail:
              "The Slopify Studio extension isn't included in this copy of Slopify, so there is nothing to download. Update or reinstall Slopify; when running from the repository, run `npm run build` at its root, which builds the extension too.",
          });
        return c.body(Readable.toWeb(createReadStream(path)), 200, {
          "content-type": "application/zip",
          "content-length": String(stat.size),
          "content-disposition": `attachment; filename="${name}"`,
          "x-content-type-options": "nosniff",
        });
      })
      // The extension's routes.
      .options("/ext/pair", (c) => {
        allowOrigin(c, true);
        return c.body(null, 204);
      })
      .options("/ext/*", (c) => {
        allowOrigin(c, false);
        return c.body(null, 204);
      })
      .post("/ext/pair", (c) => {
        allowOrigin(c, true);
        const result = pairStudioExtension(
          deps.db,
          bearerToken(c.req.header("authorization")),
          c.req.header("origin"),
          deps.clock.now(),
        );
        if (!result.ok)
          return result.reason === "bad-token"
            ? refused(c)
            : problem(c, {
                status: 403,
                title: titleOf(403),
                detail:
                  "Only the Slopify Studio browser extension can pair with Slopify. Install it (see Settings → YouTube Studio) and pair from its options page.",
              });
        // The origin is paired now; the response carries its headers.
        allowOrigin(c, false);
        return c.json({ paired: true, origin: result.pairing.origin });
      })
      .get("/ext/pack", (c) => {
        allowOrigin(c, false);
        if (
          !studioRequestAllowed(
            deps.db,
            bearerToken(c.req.header("authorization")),
            c.req.header("origin"),
          )
        )
          return refused(c);
        // The first waiting item that can still be filled; one whose project or short is gone
        // leaves the queue.
        const now = deps.clock.now();
        let gone = 0;
        for (const entry of readFillQueue(deps.db, now)) {
          const result = uploadPack(deps, entry.projectId);
          const item = result.ok ? packItem(result.pack, entry.short ?? undefined) : undefined;
          if (result.ok && item !== undefined) {
            const waiting = readFillQueue(deps.db, now).length;
            return c.json({ pack: result.pack, item, waiting });
          }
          removeFill(deps.db, entry.projectId, entry.short, now);
          gone += 1;
        }
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail:
            gone > 0
              ? "The project chosen to fill in is gone. In Slopify, open the project again, press Prepare upload, then Fill in YouTube Studio."
              : "Nothing is waiting to be filled in. In Slopify, open the project, press Prepare upload, then Fill in YouTube Studio.",
        });
      })
      // The extension filled an item: it leaves the queue, so the next upload dialog takes the
      // next one.
      .post("/ext/filled", zValidator("json", queueItemBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (
          !studioRequestAllowed(
            deps.db,
            bearerToken(c.req.header("authorization")),
            c.req.header("origin"),
          )
        )
          return refused(c);
        const { projectId, short } = c.req.valid("json");
        const left = removeFill(deps.db, projectId, short ?? null, deps.clock.now());
        return c.json({ waiting: left.length });
      })
      // Rows of Studio's Content list (title and video id), matched to projects by title so
      // uploads made by hand get their links too (`backfill.ts`).
      .post("/ext/backfill", zValidator("json", backfillBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const { videos } = c.req.valid("json");
        const found = backfillVideos(deps, videos, deps.clock.now().toISOString());
        for (const video of videos)
          if (video.checks !== undefined) setChecks(deps.db, video.videoId, video.checks);
        return c.json({ found });
      })
      // The extension popup: finished projects not marked uploaded, each with its video and
      // shorts, and which of them are on YouTube already (`youtube_videos`).
      .get("/ext/ready", (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const projects = finishedProjects().flatMap((project) => {
          planned(project.id);
          const result = uploadPack(deps, project.id);
          if (!result.ok || result.pack.items[0]?.video == null) return [];
          return [
            {
              projectId: project.id,
              title: project.title,
              items: result.pack.items.map((item) => ({
                kind: item.kind,
                short: item.short ?? null,
                title: item.title,
                ready: item.video !== null,
                uploaded: videoOf(deps.db, project.id, item.short ?? null)?.uploadState === "done",
                started: videoOf(deps.db, project.id, item.short ?? null)?.uploadState === "filled",
                ...(videoOf(deps.db, project.id, item.short ?? null) === undefined
                  ? {}
                  : { videoId: videoOf(deps.db, project.id, item.short ?? null)?.videoId }),
                ...(item.scheduleAt === undefined
                  ? {}
                  : {
                      scheduleAt: item.scheduleAt,
                      // When it must be scheduled by, so the checks finish before release.
                      uploadBy: new Date(
                        Date.parse(item.scheduleAt) - readLeadHours(deps.db) * 3_600_000,
                      ).toISOString(),
                    }),
              })),
            },
          ];
        });
        return c.json({ projects });
      })
      // The popup's click: only that upload waits, and the extension opens Studio's
      // upload page, where the dialog takes it.
      .post("/ext/upload", zValidator("json", queueItemBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const { projectId, short } = c.req.valid("json");
        const result = uploadPack(deps, projectId);
        if (!result.ok || packItem(result.pack, short ?? undefined) === undefined)
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail: "That upload isn't in the project any more. Open the popup again.",
          });
        planned(projectId);
        fillOnly(deps.db, [{ projectId, short: short ?? null }], deps.clock.now());
        return c.json({ url: studioUploadUrl });
      })
      // The popup's Upload all Shorts: each short not on YouTube yet waits, in order, and the
      // upload dialogs take them one after another.
      .post("/ext/upload-all", zValidator("json", z.object({ projectId: id }), onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const { projectId } = c.req.valid("json");
        planned(projectId);
        const result = uploadPack(deps, projectId);
        if (!result.ok) return unknownProject(c);
        const shorts = result.pack.items.filter(
          (item) =>
            item.kind === "short" &&
            item.video !== null &&
            videoOf(deps.db, projectId, item.short ?? null)?.uploadState !== "done",
        );
        fillOnly(
          deps.db,
          shorts.map((item) => ({ projectId, short: item.short ?? null })),
          deps.clock.now(),
        );
        return c.json({ url: studioUploadUrl, count: shorts.length });
      })
      // One project's upload pack, for a Studio page opened for one of its uploads.
      .get("/ext/packs/:projectId", zValidator("param", projectParam, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const result = uploadPack(deps, c.req.valid("param").projectId);
        return result.ok ? c.json(result.pack) : unknownProject(c);
      })
      // What waits for the extension on YouTube's side: the Details touches after an upload,
      // and the comments to pin once public.
      .get("/ext/tasks", (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const withItems = (videos: readonly YoutubeVideo[]) =>
          videos.flatMap((video) => {
            const result = uploadPack(deps, video.projectId);
            const item = result.ok ? packItem(result.pack, video.short ?? undefined) : undefined;
            return item === undefined
              ? []
              : [{ projectId: video.projectId, short: video.short, videoId: video.videoId, item }];
          });
        // A video on YouTube, due in the coming weeks, whose checks Studio hasn't cleared (or
        // the extension hasn't read): the extension reads the Content list for them.
        const soon = deps.clock.now().getTime();
        const checks = doneVideos(deps.db).some((video) => {
          if (video.checks === "ok") return false;
          const at = releasesOf(deps.db, video.projectId).find(
            (release) => release.short === (video.short ?? 0),
          )?.at;
          return at !== undefined && at !== "" && Date.parse(at) > soon;
        });
        return c.json({
          finish: withItems(waitingTasks(deps.db, "finish")),
          comments: withItems(waitingTasks(deps.db, "comment")),
          checks,
        });
      })
      .post("/ext/task-result", zValidator("json", taskResultBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const { task, projectId, short, ok, message } = c.req.valid("json");
        setTaskState(deps.db, task, projectId, short ?? null, ok ? "done" : "failed", message);
        return c.json({ ok: true });
      })
      // Every video on YouTube, for the numbers the extension reads from Studio.
      .get("/ext/known-videos", (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        return c.json({
          // The export brings every video's numbers; only an A/B test's result needs a visit.
          videos: doneVideos(deps.db)
            .filter((video) => video.short === null && video.abState === "started")
            .map((video) => ({
              projectId: video.projectId,
              short: video.short,
              videoId: video.videoId,
            })),
        });
      })
      .post("/ext/stats", zValidator("json", statsBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const body = c.req.valid("json");
        const readAt = deps.clock.now().toISOString();
        // A visit for the A/B result alone brings no numbers: the export's are kept.
        const numbers = [
          body.impressions,
          body.ctr,
          body.views,
          body.averageViewSeconds,
          body.watchHours,
        ].some((one) => one !== undefined);
        if (numbers)
          saveStats(deps.db, {
            projectId: body.projectId,
            short: body.short ?? null,
            videoId: body.videoId,
            readAt,
            impressions: body.impressions ?? null,
            ctr: body.ctr ?? null,
            views: body.views ?? null,
            averageViewSeconds: body.averageViewSeconds ?? null,
            watchHours: body.watchHours ?? null,
          });
        if (body.abVariants !== undefined && body.abVariants.length > 1)
          saveAbResult(deps.db, {
            projectId: body.projectId,
            short: body.short ?? null,
            videoId: body.videoId,
            readAt,
            variants: body.abVariants,
          });
        return c.json({ ok: true });
      })
      // The extension read the new video's id from Studio's upload dialog. It is "filled" until
      // Studio says it was scheduled or published (`/ext/video/done`): a cancelled upload isn't
      // on YouTube.
      .post("/ext/video", zValidator("json", extVideoBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const { projectId, short, videoId } = c.req.valid("json");
        recordVideo(
          deps.db,
          projectId,
          short ?? null,
          videoId,
          deps.clock.now().toISOString(),
          "filled",
        );
        return c.json({ recorded: true });
      })
      // Studio showed "Video scheduled" or "Video published". An upload with an A/B test to run
      // (other titles, or several thumbnails) now waits for its video to be public: scheduled
      // videos are private until then, and Studio tests only public ones.
      .post("/ext/video/done", zValidator("json", extVideoBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const { projectId, short, videoId } = c.req.valid("json");
        if (!confirmUpload(deps.db, projectId, short ?? null, videoId))
          recordVideo(deps.db, projectId, short ?? null, videoId, deps.clock.now().toISOString());
        // The Details touches (a short's related video, the long video's end screen and
        // captions) wait for the extension now, and the comment for the video to be public.
        const confirmedPack = uploadPack(deps, projectId);
        const confirmedItem = confirmedPack.ok
          ? packItem(confirmedPack.pack, short ?? undefined)
          : undefined;
        if (
          confirmedItem !== undefined &&
          (confirmedItem.relatedVideoId !== undefined ||
            confirmedItem.endScreenVideoId !== undefined ||
            confirmedItem.captions !== undefined)
        )
          setTaskState(deps.db, "finish", projectId, short ?? null, "waiting", null);
        if (
          confirmedItem?.kind === "video" &&
          confirmedItem.pinnedComment !== undefined &&
          readSetting(deps.db, autoCommentKey) === "on"
        )
          setTaskState(deps.db, "comment", projectId, short ?? null, "waiting", null);
        return c.json({ confirmed: true });
      })
      .get("/ext/files/:projectId/:asset", zValidator("param", fileParam, onInvalid), (c) => {
        allowOrigin(c, false);
        if (
          !studioRequestAllowed(
            deps.db,
            bearerToken(c.req.header("authorization")),
            c.req.header("origin"),
          )
        )
          return refused(c);
        const { projectId, asset } = c.req.valid("param");
        // Only a pack's own files, its videos, thumbnails and captions: the extension puts the
        // video into Studio's upload dialog, the thumbnails into Details and the captions file
        // into Subtitles, and needs nothing else.
        const result = uploadPack(deps, projectId);
        const listed =
          result.ok &&
          result.pack.items.some(
            (item) =>
              item.video?.asset === asset ||
              item.captions?.asset === asset ||
              item.thumbnails.some((thumbnail) => thumbnail.asset === asset),
          );
        const found = listed ? findDownload(deps, projectId, asset) : undefined;
        if (found === undefined || !found.ok)
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail:
              "That file isn't in the project's upload pack any more. Reload the project in Slopify and press Fill in YouTube Studio again.",
          });
        return c.body(Readable.toWeb(createReadStream(found.download.path)), 200, {
          "content-type": found.download.contentType,
          "content-length": String(found.download.bytes),
          "x-content-type-options": "nosniff",
        });
      })
  );
}

function unknownProject(c: Context): Response {
  return problem(c, {
    status: 404,
    title: titleOf(404),
    detail: "This project no longer exists. Go back to Projects and open it again.",
  });
}
