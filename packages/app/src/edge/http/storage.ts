import { Hono } from "hono";
import {
  BackupBusyError,
  type BackupDeps,
  planBackup,
  streamBackup,
} from "../../slices/storage/backup-export.js";
import { BackupImportRefused, importBackup } from "../../slices/storage/backup-import.js";
import {
  importPortable,
  portableMaxArchiveBytes,
  storageUsage,
} from "../../slices/storage/portable.js";
import { reconcileStorage } from "../../slices/storage/reconcile.js";
import type { AppDeps } from "./app.js";
import { problem, titleOf } from "./problem.js";

const exportFailed =
  "Slopify could not create the backup. Check there is free disk space and try again; if it keeps failing, use Download diagnostics in Settings and report it.";

export function storageRoutes(deps: AppDeps) {
  const backup = (): BackupDeps => ({
    db: deps.db,
    paths: deps.paths,
    clock: deps.clock,
    ids: deps.ids,
    appVersion: deps.version,
    hasInflight: deps.runner.hasInflight,
  });
  return (
    new Hono()
      .get("/", (c) => c.json(storageUsage({ db: deps.db, paths: deps.paths })))
      // What Export everything would write, asked before the download starts: a download
      // link cannot show a refusal, the browser would save it as the file.
      .get("/export/summary", (c) => {
        try {
          const plan = planBackup(backup());
          return c.json({
            ready: true as const,
            projects: plan.manifest.projects.length,
            files: plan.manifest.files,
            bytes: plan.archiveBytes,
          });
        } catch (error) {
          if (error instanceof BackupBusyError)
            return c.json({ ready: false as const, detail: error.message, busy: error.projects });
          deps.log.write("error", "storage.export", { detail: String(error) });
          return problem(c, { status: 500, title: titleOf(500), detail: exportFailed });
        }
      })
      .get("/export", (c) => {
        let plan: ReturnType<typeof planBackup>;
        try {
          plan = planBackup(backup());
        } catch (error) {
          if (error instanceof BackupBusyError)
            return problem(c, { status: 409, title: titleOf(409), detail: error.message });
          deps.log.write("error", "storage.export", { detail: String(error) });
          return problem(c, { status: 500, title: titleOf(500), detail: exportFailed });
        }
        // Pulled one chunk at a time, so a slow download reads files no faster than it sends.
        const chunks = streamBackup(plan);
        const body = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const next = await chunks.next();
              if (next.done === true) controller.close();
              else controller.enqueue(next.value);
            } catch (error) {
              deps.log.write("error", "storage.export", { detail: String(error) });
              controller.error(error);
            }
          },
          async cancel() {
            await chunks.return(undefined);
          },
        });
        return c.body(body, 200, {
          "content-type": "application/x-tar",
          "content-length": String(plan.archiveBytes),
          "content-disposition": `attachment; filename="${plan.fileName}"`,
        });
      })
      .put("/import", async (c) => {
        const contentType = c.req.header("content-type") ?? "";
        if (contentType.includes("application/x-tar")) return importFull(c.req.raw);
        if (!contentType.includes("application/zip"))
          return problem(c, {
            status: 415,
            title: titleOf(415),
            detail:
              "Choose a Slopify backup file: a .tar made with Export everything, or an older .zip made with Export backup, both in Settings → Backup & storage.",
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

        async function importFull(request: Request): Promise<Response> {
          if (request.body === null)
            return problem(c, {
              status: 400,
              title: titleOf(400),
              detail:
                "The backup file arrived empty. Choose the .tar made with Export everything and import it again.",
            });
          const reader = request.body.getReader();
          try {
            return c.json(await importBackup(backup(), chunksOf(reader)));
          } catch (error) {
            if (error instanceof BackupImportRefused)
              return problem(c, {
                status: error.status,
                title: titleOf(error.status),
                detail: error.message,
              });
            deps.log.write("error", "storage.import", { detail: String(error) });
            return problem(c, {
              status: 500,
              title: titleOf(500),
              detail:
                "The backup wasn't imported and nothing in this install changed. Try again; if it keeps failing, use Download diagnostics in Settings and report it.",
            });
          } finally {
            // A refusal mid-upload stops reading the rest of a file that may be gigabytes.
            await reader.cancel().catch(() => undefined);
          }
        }
      })
      .post("/cleanup", (c) => c.json(reconcileStorage(deps.db, deps.paths)))
  );
}

async function* chunksOf(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<Uint8Array> {
  while (true) {
    const next = await reader.read();
    if (next.done) return;
    yield next.value;
  }
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
