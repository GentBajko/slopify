import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { findDownload } from "../../slices/storage/downloads.js";
import { studioPlaylistMax } from "../../slices/studio/model.js";
import { packItem, uploadPack } from "../../slices/studio/pack.js";
import {
  bearerToken,
  isExtensionOrigin,
  pairStudioExtension,
  readStudioPlaylist,
  resetStudioPairing,
  saveRealFootage,
  saveStudioPlaylist,
  studioPairing,
  studioPlaylistProblem,
  studioRequestAllowed,
} from "../../slices/studio/settings.js";
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
const playlistBody = z.object({ playlist: z.string().max(studioPlaylistMax * 2) });
const realFootageBody = z.object({ realFootage: z.boolean() });

// How long a "Fill in YouTube Studio" choice stays the one the extension fills in.
const choiceMs = 6 * 60 * 60 * 1000;

// The Studio routes. The ones under `/ext` are the only routes of the app a page from another
// origin may read, and only the paired browser extension: every request carries the pairing
// token, and the CORS headers name the paired extension's origin, never a web page's and never
// `*`. The rest are the Slopify page's own, refused from any other origin.
export function studioRoutes(deps: AppDeps) {
  // What the person chose to fill in last; kept in memory, so a restart asks them to choose
  // again rather than filling in an old choice.
  let chosen: { projectId: string; short: number | undefined; at: number } | undefined;

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

  return (
    new Hono()
      .get("/settings", (c) => {
        // The token is read only by the Slopify page, never by another origin's.
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        return c.json({ playlist: readStudioPlaylist(deps.db), pairing: studioPairing(deps.db) });
      })
      .put("/settings/playlist", zValidator("json", playlistBody, onInvalid), (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        const raw = c.req.valid("json").playlist;
        const invalid = studioPlaylistProblem(raw);
        if (invalid !== undefined)
          return problem(c, {
            status: 400,
            title: titleOf(400),
            detail: invalid,
            extensions: { fields: [{ field: "playlist", message: invalid }] },
          });
        return c.json({ playlist: saveStudioPlaylist(deps.db, raw) });
      })
      .post("/settings/pairing", (c) => {
        const denied = samePage(c);
        if (denied !== undefined) return denied;
        return c.json({ pairing: resetStudioPairing(deps.db) });
      })
      .get("/packs/:projectId", zValidator("param", projectParam, onInvalid), (c) => {
        const result = uploadPack(deps, c.req.valid("param").projectId);
        if (!result.ok) return unknownProject(c);
        return c.json(result.pack);
      })
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
          chosen = { projectId, short, at: deps.clock.now().getTime() };
          return c.json({ chosen: { projectId, short: short ?? null } });
        },
      )
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
        const fresh =
          chosen !== undefined && deps.clock.now().getTime() - chosen.at <= choiceMs
            ? chosen
            : undefined;
        if (fresh === undefined)
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail:
              "Nothing is chosen to fill in. In Slopify, open the project, press Prepare upload, then Fill in YouTube Studio.",
          });
        const result = uploadPack(deps, fresh.projectId);
        const item = result.ok ? packItem(result.pack, fresh.short) : undefined;
        if (!result.ok || item === undefined)
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail:
              "The project chosen to fill in is gone. In Slopify, open the project again and press Fill in YouTube Studio.",
          });
        return c.json({ pack: result.pack, item });
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
        // Only the thumbnails of a pack: the extension needs nothing else from the disk.
        const result = uploadPack(deps, projectId);
        const listed =
          result.ok &&
          result.pack.items.some((item) =>
            item.thumbnails.some((thumbnail) => thumbnail.asset === asset),
          );
        const found = listed ? findDownload(deps, projectId, asset) : undefined;
        if (found === undefined || !found.ok)
          return problem(c, {
            status: 404,
            title: titleOf(404),
            detail:
              "That thumbnail isn't in the project's upload pack any more. Reload the project in Slopify and press Fill in YouTube Studio again.",
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
