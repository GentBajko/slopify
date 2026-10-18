import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { projectById } from "../../slices/admission/repo.js";
import { webhookBody } from "../../slices/notifications/address.js";
import type { NoticeText } from "../../slices/notifications/rules.js";
import { sendFailureText } from "../../slices/notifications/send.js";
import { readNotificationUrl } from "../../slices/notifications/settings.js";
import { waitsForRelease } from "../../slices/social/due.js";
import { postingExtension, writeExtensionSites } from "../../slices/social/extension.js";
import type { SocialPacksResponse } from "../../slices/social/model.js";
import { postReadyNotice } from "../../slices/social/notice.js";
import { packFor, postPacks } from "../../slices/social/pack.js";
import { readPost, writeChoice, writeReddit, writeTextEdit } from "../../slices/social/repo.js";
import type { Reshaper } from "../../slices/social/reshape.js";
import {
  choiceBody,
  linkBody,
  platformSchema,
  redditBody,
  resultBody,
  textBody,
} from "../../slices/social/schema.js";
import { type MediaDeps, serveMedia } from "../../slices/social/serve.js";
import {
  duePosts,
  fillPost,
  linksToFind,
  nextPost,
  type Refused,
  reportPost,
  setPostLink,
} from "../../slices/social/service.js";
import type { AppDeps } from "./app.js";
import { fileResponse } from "./byte-range.js";
import { extensionAuth } from "./extension-auth.js";
import { idString } from "./ids.js";
import { onInvalid, problem } from "./problem.js";
import { fromSlopifyPage } from "./same-page.js";

// Posting to X, LinkedIn, Instagram, TikTok, Reddit and Bluesky (`slices/social`). The page's
// routes read and change a project's posts; Fill in <site> only puts a post in the extension's
// queue, and nothing here ever posts. The routes under `/ext` are the paired Slopify Studio
// extension's, with the same token and CORS rules as YouTube Studio's (`extension-auth.ts`).

export interface SocialRoutesDeps {
  // Cuts pictures to a site's shape in a child ffmpeg (`slices/social/reshape.ts`).
  readonly reshaper?: Reshaper | undefined;
}

const projectParam = z.object({ projectId: idString });
const postParam = projectParam.extend({ platform: platformSchema });
const fileParam = projectParam.extend({
  file: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9_-]+$/),
});
const nextQuery = z.object({ platform: platformSchema });
const dueQuery = z.object({ hours: z.coerce.number().int().min(1).max(48).optional() });
const sitesBody = z.object({ sites: z.array(platformSchema).max(6) });

export function socialRoutes(deps: AppDeps) {
  const { allowOrigin, allowed, refused } = extensionAuth(deps.db);
  const media: MediaDeps = {
    db: deps.db,
    paths: deps.paths,
    reshaper: deps.social?.reshaper,
    ...(deps.designs === undefined
      ? {}
      : {
          renderDesign: async (designId, format, signal) => {
            const drawn = await deps.designs?.renderer.render(designId, format, "png", signal);
            return drawn?.ok === true
              ? { ok: true as const, path: drawn.value.path }
              : {
                  ok: false as const,
                  sentence:
                    drawn?.message ??
                    "The design couldn't be drawn. Open it in Library → Designs to check it, then reload Prepare upload.",
                };
          },
        }),
  };
  const samePage = (c: Context): Response | undefined =>
    fromSlopifyPage(c, deps.remoteAccess?.remoteHost)
      ? undefined
      : problem(c, {
          status: 403,
          detail:
            "For your safety, a project's posts can only be changed from the Slopify page itself. Open Slopify and try again there.",
        });
  const answer = (c: Context, projectId: string): Response => {
    const result = postPacks(deps, projectId, deps.clock.now());
    if (!result.ok) return unknownProject(c);
    const body: SocialPacksResponse = {
      ...result.packs,
      extension: postingExtension(deps.db),
    };
    return c.json(body);
  };
  const refusal = (c: Context, refused: Refused): Response =>
    problem(c, { status: refused.status, detail: refused.sentence });
  const posting = (c: Context, projectId: string, platform: Parameters<typeof packFor>[2]) =>
    packFor(deps, projectId, platform, deps.clock.now()) === undefined
      ? problem(c, {
          status: 404,
          detail:
            "This project doesn't post there. Turn the site on in the post's settings under Prepare upload, or in Edit project → Upload pack.",
        })
      : undefined;
  // A post filled at its release time tells the Notification URL, when one is set. Never
  // awaited: the extension's report doesn't wait on it.
  const notify = (text: NoticeText, projectId: string): void => {
    const url = readNotificationUrl(deps.db);
    const send = deps.sendNotification;
    if (url === null || send === undefined) return;
    void send(url, webhookBody(text)).then((sent) => {
      if (!sent.ok)
        deps.log.write("warn", "social.notify", { projectId, detail: sendFailureText(sent) });
    });
  };
  const changed = (projectId: string) =>
    deps.hub.emit(projectId, { type: "project.updated", projectId });

  return (
    new Hono()
      .get("/packs/:projectId", zValidator("param", projectParam, onInvalid), (c) =>
        answer(c, c.req.valid("param").projectId),
      )
      // The project's own pick for one site: other settings, not posting there ({off: true}),
      // or back to the template's (null).
      .put(
        "/packs/:projectId/:platform/choice",
        zValidator("param", postParam, onInvalid),
        zValidator("json", choiceBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId, platform } = c.req.valid("param");
          if (postPacks(deps, projectId, deps.clock.now()).ok === false) return unknownProject(c);
          const { choice } = c.req.valid("json");
          const config = projectById(deps.db, projectId)?.config.social?.[platform];
          if (
            choice !== null &&
            !("off" in choice) &&
            choice.text === "prompt" &&
            config?.text !== "prompt"
          )
            return problem(c, {
              status: 409,
              detail:
                "A post written by a post prompt is a paid step, so it is set in Edit project → Upload pack, where Save shows its cost. Pick another text source here, or turn it on there.",
            });
          writeChoice(deps.db, { projectId, platform }, choice, deps.clock.now());
          changed(projectId);
          return answer(c, projectId);
        },
      )
      .put(
        "/packs/:projectId/:platform/text",
        zValidator("param", postParam, onInvalid),
        zValidator("json", textBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId, platform } = c.req.valid("param");
          const missing = posting(c, projectId, platform);
          if (missing !== undefined) return missing;
          writeTextEdit(deps.db, { projectId, platform }, c.req.valid("json"), deps.clock.now());
          changed(projectId);
          return answer(c, projectId);
        },
      )
      .delete(
        "/packs/:projectId/:platform/text",
        zValidator("param", postParam, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId, platform } = c.req.valid("param");
          const missing = posting(c, projectId, platform);
          if (missing !== undefined) return missing;
          writeTextEdit(deps.db, { projectId, platform }, null, deps.clock.now());
          changed(projectId);
          return answer(c, projectId);
        },
      )
      .put(
        "/packs/:projectId/:platform/reddit",
        zValidator("param", postParam, onInvalid),
        zValidator("json", redditBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId, platform } = c.req.valid("param");
          if (platform !== "reddit")
            return problem(c, {
              status: 400,
              detail:
                "Only a Reddit post has a subreddit, title and flair. Open the Reddit post instead.",
            });
          const missing = posting(c, projectId, platform);
          if (missing !== undefined) return missing;
          writeReddit(
            deps.db,
            { projectId, platform },
            c.req.valid("json").reddit,
            deps.clock.now(),
          );
          changed(projectId);
          return answer(c, projectId);
        },
      )
      // The post's link, pasted by the person (posted by hand, or the extension missed it); null
      // removes it, so the post can be filled again.
      .put(
        "/packs/:projectId/:platform/link",
        zValidator("param", postParam, onInvalid),
        zValidator("json", linkBody, onInvalid),
        (c) => {
          const denied = samePage(c);
          if (denied !== undefined) return denied;
          const { projectId, platform } = c.req.valid("param");
          const result = setPostLink(
            deps,
            projectId,
            platform,
            c.req.valid("json").url,
            deps.clock.now(),
          );
          if (!result.ok) return refusal(c, result);
          changed(projectId);
          return answer(c, projectId);
        },
      )
      // Fill in <site>: never offered to agents or the assistant (`excluded-routes.ts`).
      .post("/packs/:projectId/:platform/fill", zValidator("param", postParam, onInvalid), (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        const { projectId, platform } = c.req.valid("param");
        const result = fillPost(deps, projectId, platform, deps.clock.now());
        if (!result.ok) return refusal(c, result);
        changed(projectId);
        return c.json({
          pack: result.pack,
          waitsForRelease: result.waitsForRelease,
          url: result.pack.composeUrl,
        });
      })
      .get("/media/:projectId/:file", zValidator("param", fileParam, onInvalid), async (c) => {
        const { projectId, file } = c.req.valid("param");
        return served(
          c,
          await serveMedia(media, projectId, file, deps.clock.now(), c.req.raw.signal),
        );
      })
      // The extension's routes.
      .options("/ext/*", (c) => {
        allowOrigin(c, false);
        return c.body(null, 204);
      })
      .get("/ext/next", zValidator("query", nextQuery, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!allowed(c)) return refused(c);
        const { platform } = c.req.valid("query");
        const next = nextPost(deps, platform, deps.clock.now());
        if (next === undefined)
          return problem(c, {
            status: 404,
            detail:
              "Nothing is waiting to be filled on this site. In Slopify, open the project, press Prepare upload, then Fill in the site's post.",
          });
        changed(next.pack.projectId);
        return c.json(next);
      })
      .get("/ext/packs/:projectId/:platform", zValidator("param", postParam, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!allowed(c)) return refused(c);
        const { projectId, platform } = c.req.valid("param");
        const pack = packFor(deps, projectId, platform, deps.clock.now());
        return pack === undefined ? unknownPost(c) : c.json(pack);
      })
      .get("/ext/files/:projectId/:file", zValidator("param", fileParam, onInvalid), async (c) => {
        allowOrigin(c, false);
        if (!allowed(c)) return refused(c);
        const { projectId, file } = c.req.valid("param");
        return served(
          c,
          await serveMedia(media, projectId, file, deps.clock.now(), c.req.raw.signal),
        );
      })
      .get("/ext/due", zValidator("query", dueQuery, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!allowed(c)) return refused(c);
        const hours = c.req.valid("query").hours ?? 24;
        return c.json({ posts: duePosts(deps, deps.clock.now(), hours * 3_600_000) });
      })
      .post("/ext/result", zValidator("json", resultBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!allowed(c)) return refused(c);
        const body = c.req.valid("json");
        const result = reportPost(deps, body, deps.clock.now());
        if (!result.ok) return refusal(c, result);
        changed(body.projectId);
        if (body.state === "filled" && waitsForRelease(body.platform) && result.pack !== undefined)
          notify(postReadyNotice(result.pack), body.projectId);
        return c.json({ status: readPost(deps.db, body).state });
      })
      .get("/ext/find-links", (c) => {
        allowOrigin(c, false);
        if (!allowed(c)) return refused(c);
        return c.json({ posts: linksToFind(deps, deps.clock.now()) });
      })
      // Which sites the extension may post on, as its options last granted them.
      .post("/ext/sites", zValidator("json", sitesBody, onInvalid), (c) => {
        allowOrigin(c, false);
        if (!allowed(c)) return refused(c);
        writeExtensionSites(deps.db, c.req.valid("json").sites, deps.clock.now());
        return c.json(postingExtension(deps.db));
      })
  );
}

function served(c: Context, result: Awaited<ReturnType<typeof serveMedia>>): Response {
  if (!result.ok) return problem(c, { status: result.status, detail: result.sentence });
  return fileResponse(c, result.path, result.bytes, {
    "content-type": result.contentType,
    "content-disposition": `inline; filename="${result.filename.replace(/["\\]/g, "")}"`,
    "x-content-type-options": "nosniff",
  });
}

function unknownProject(c: Context): Response {
  return problem(c, {
    status: 404,
    detail: "This project no longer exists. Go back to Projects and open it again.",
  });
}

function unknownPost(c: Context): Response {
  return problem(c, {
    status: 404,
    detail:
      "That project no longer posts to this site. In Slopify, open the project's Prepare upload and press Fill again.",
  });
}
