import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { derive } from "../../kernel/runner/graph.js";
import { listProjects, projectById, stagesOf } from "../../slices/admission/repo.js";
import { channelById } from "../../slices/channels/repo.js";
import { readSetting, writeSetting } from "../../slices/settings/repo.js";
import { findDownload } from "../../slices/storage/downloads.js";
import { backfillVideos } from "../../slices/studio/backfill.js";
import {
  type FillQueueItem,
  studioPlaylistMax,
  studioUploadUrl,
} from "../../slices/studio/model.js";
import { packItem, uploadPack } from "../../slices/studio/pack.js";
import { writeUploadPick } from "../../slices/studio/pick.js";
import {
  assignedSlot,
  freeSlots,
  postingPlanSchema,
  readPlan,
  setSlot,
  unschedule,
  writePlan,
} from "../../slices/studio/plan.js";
import {
  enqueueFill,
  type FillEntry,
  fillNow,
  readFillQueue,
  removeFill,
} from "../../slices/studio/queue.js";
import {
  autoCommentKey,
  bearerToken,
  isExtensionOrigin,
  pairStudioExtension,
  readChannelPlaylists,
  readStudioPlaylists,
  resetStudioPairing,
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
    .array(z.object({ title: z.string().max(200), videoId: z.string().regex(videoIdPattern) }))
    .max(200),
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

  // A project ready to upload takes the plan's next free slot when its upload is prepared;
  // one whose long video is on YouTube already doesn't.
  const planned = (projectId: string): void => {
    if (videoOf(deps.db, projectId, null)?.uploadState === "done") return;
    const result = uploadPack(deps, projectId);
    if (!result.ok || result.pack.items[0]?.video == null) return;
    assignedSlot(deps.db, readPlan(deps.db), projectId, deps.clock.now());
  };
  const slotChoices = () => freeSlots(deps.db, readPlan(deps.db), deps.clock.now(), 9);
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
      // The posting plan and the coming free slots.
      .get("/plan", (c) => {
        const plan = readPlan(deps.db);
        return c.json({ plan, free: freeSlots(deps.db, plan, deps.clock.now(), 9) });
      })
      .put("/plan", zValidator("json", postingPlanSchema, onInvalid), (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        writePlan(deps.db, c.req.valid("json"));
        const plan = readPlan(deps.db);
        return c.json({ plan, free: freeSlots(deps.db, plan, deps.clock.now(), 9) });
      })
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
        return c.json({ ...result.pack, slotChoices: slotChoices() });
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
          if (wanted === null) unschedule(deps.db, projectId, deps.clock.now());
          else {
            const free = slotChoices().some(
              (one) => one.row === wanted.row && one.longAt === wanted.longAt,
            );
            if (!free)
              return problem(c, {
                status: 409,
                title: titleOf(409),
                detail:
                  "That slot is taken or past. Reload Prepare upload and choose one of the slots it lists.",
              });
            setSlot(deps.db, projectId, wanted, deps.clock.now());
          }
          const result = uploadPack(deps, projectId);
          return result.ok
            ? c.json({ ...result.pack, slotChoices: slotChoices() })
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
        const found = backfillVideos(
          deps,
          c.req.valid("json").videos,
          deps.clock.now().toISOString(),
        );
        return c.json({ found });
      })
      // The extension popup: finished projects not marked uploaded, each with its video and
      // shorts, and which of them are on YouTube already (`youtube_videos`).
      .get("/ext/ready", (c) => {
        allowOrigin(c, false);
        if (!extAllowed(c)) return refused(c);
        const uploads = uploadedProjects(deps.db);
        const aside = setAsideProjects(deps.db);
        const projects = listProjects(deps.db).flatMap((project) => {
          if (uploads.has(project.id)) return [];
          const state = derive(stagesOf(deps.db, project.id), project.paused === true);
          const finished =
            state === "done" ||
            state === "partial" ||
            (state === "pending" && aside.has(project.id));
          if (!finished) return [];
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
                ...(item.scheduleAt === undefined ? {} : { scheduleAt: item.scheduleAt }),
              })),
            },
          ];
        });
        return c.json({ projects });
      })
      // The popup's click: that upload goes first in line, and the extension opens Studio's
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
        fillNow(deps.db, projectId, short ?? null, deps.clock.now());
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
        // fillNow puts each first, so the last short goes in first and short 1 ends up first.
        for (const item of shorts.toReversed())
          fillNow(deps.db, projectId, item.short ?? null, deps.clock.now());
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
        return c.json({
          finish: withItems(waitingTasks(deps.db, "finish")),
          comments: withItems(waitingTasks(deps.db, "comment")),
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
          videos: doneVideos(deps.db).map((video) => ({
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
