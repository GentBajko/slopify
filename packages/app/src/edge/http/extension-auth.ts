import type { DatabaseSync } from "node:sqlite";
import type { Context } from "hono";
import {
  bearerToken,
  isExtensionOrigin,
  studioPairing,
  studioRequestAllowed,
} from "../../slices/studio/settings.js";
import { problem } from "./problem.js";

export interface ExtensionAuth {
  // The CORS headers for the extension: its own origin, echoed only when it is allowed.
  readonly allowOrigin: (c: Context, pairing: boolean) => void;
  readonly allowed: (c: Context) => boolean;
  readonly refused: (c: Context) => Response;
}

// The paired Slopify Studio extension's access to the `/ext` routes: every request carries the
// pairing token, and the CORS headers name the paired extension's origin, never a web page's
// and never `*`.
export function extensionAuth(db: DatabaseSync): ExtensionAuth {
  const allowOrigin = (c: Context, pairing: boolean): void => {
    const origin = c.req.header("origin");
    const paired = studioPairing(db).origin;
    c.header("Vary", "Origin");
    if (!isExtensionOrigin(origin)) return;
    if (origin === paired || pairing) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Headers", "authorization, content-type");
      c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      c.header("Access-Control-Max-Age", "600");
    }
  };
  const allowed = (c: Context): boolean =>
    studioRequestAllowed(db, bearerToken(c.req.header("authorization")), c.req.header("origin"));
  const refused = (c: Context): Response =>
    problem(c, {
      status: 401,
      title: "Unauthorized",
      detail:
        "The Slopify Studio extension isn't paired with this Slopify. Copy the pairing token from Slopify's Settings → YouTube Studio and posting into the extension's options and press Pair.",
    });
  return { allowOrigin, allowed, refused };
}
