import { Hono } from "hono";
import {
  exportPortable,
  importPortable,
  portableMaxArchiveBytes,
  storageUsage,
} from "../../slices/storage/portable.js";
import { reconcileStorage } from "../../slices/storage/reconcile.js";
import type { AppDeps } from "./app.js";
import { problem, titleOf } from "./problem.js";

export function storageRoutes(deps: AppDeps) {
  return new Hono()
    .get("/", (c) => c.json(storageUsage({ db: deps.db, paths: deps.paths })))
    .get("/export", (c) => {
      try {
        const bytes = exportPortable({
          db: deps.db,
          paths: deps.paths,
          ids: deps.ids,
          now: () => deps.clock.now().toISOString(),
        });
        return c.body(bytes, 200, {
          "content-type": "application/zip",
          "content-length": String(bytes.byteLength),
          "content-disposition": 'attachment; filename="slopify-backup.zip"',
        });
      } catch {
        return problem(c, {
          status: 500,
          title: titleOf(500),
          detail:
            "Slopify could not create the backup. Check there is free disk space and try again; if it keeps failing, use Download diagnostics in Settings and report it.",
        });
      }
    })
    .put("/import", async (c) => {
      const contentType = c.req.header("content-type") ?? "";
      if (!contentType.includes("application/zip"))
        return problem(c, {
          status: 415,
          title: titleOf(415),
          detail: "Choose a Slopify backup file (.zip) made with Backup & storage in Settings.",
        });
      const upload = await readPortableUpload(c.req.raw);
      if (!upload.ok)
        return problem(c, {
          status: 413,
          title: titleOf(413),
          detail:
            "This backup file is empty or larger than 100 MB. Choose a Slopify backup file under 100 MB.",
        });
      try {
        const imported = importPortable(
          {
            db: deps.db,
            paths: deps.paths,
            ids: deps.ids,
            now: () => deps.clock.now().toISOString(),
          },
          upload.bytes,
        );
        return c.json(imported);
      } catch {
        return problem(c, {
          status: 400,
          title: titleOf(400),
          detail:
            "This file is not a complete Slopify backup; it may be damaged or a different kind of ZIP. Choose a backup made with Backup & storage in Settings.",
        });
      }
    })
    .post("/cleanup", (c) => c.json(reconcileStorage(deps.db, deps.paths)));
}

async function readPortableUpload(
  request: Request,
): Promise<{ readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false }> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > portableMaxArchiveBytes) {
    try {
      await request.body?.cancel();
    } catch {
      // The request is already rejected; cancellation only releases transport resources sooner.
    }
    return { ok: false };
  }
  if (request.body === null) return { ok: false };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (next.value.byteLength > portableMaxArchiveBytes - total) {
        try {
          await reader.cancel();
        } catch {
          // The response is already decided; an upload transport failing cancellation is harmless.
        }
        return { ok: false };
      }
      total += next.value.byteLength;
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) return { ok: false };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, bytes };
}
