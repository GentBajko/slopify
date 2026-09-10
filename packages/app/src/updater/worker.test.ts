import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import type { UpdatePlan } from "./plan.js";
import { performUpdate } from "./worker.js";

// Fixture programs exercise actual process spawning and handoff without running npm,
// installing a package, or opening any user's Slopify data directory.
function serverScript(version: string, fail: boolean): string {
  return `
    import { createServer } from 'node:http';
    import { readFileSync, writeFileSync } from 'node:fs';
    import { join } from 'node:path';
    const args = process.argv.slice(2);
    const root = args[args.indexOf('--data-dir') + 1];
    ${version === "0.6.2" ? "writeFileSync(join(root, 'slopify.db'), 'new database schema');" : ""}
    ${fail ? "process.exit(1);" : ""}
    writeFileSync(join(root, 'child.pid'), String(process.pid));
    writeFileSync(join(root, 'rollback-marker'), process.env.SLOPIFY_UPDATE_FAILED ?? "absent");
    const server = createServer((request, response) => {
      if (request.url.startsWith('/api/update/')) {
        if (request.headers['x-slopify-update-token'] !== process.env.SLOPIFY_UPDATE_TOKEN) {
          response.writeHead(403).end(); return;
        }
        if (request.url === '/api/update/activate') {
          const pointer = JSON.parse(readFileSync(join(root, 'updates', 'current.json'), 'utf8'));
          if (pointer.token !== process.env.SLOPIFY_UPDATE_TOKEN || pointer.version !== '${version}') {
            response.writeHead(409).end(); return;
          }
        }
      }
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ status: 'ok', version: '${version}' }));
      if (request.url === '/shutdown') server.close();
    });
    server.listen(Number(args[args.indexOf('--port') + 1]), args[args.indexOf('--host') + 1]);
  `;
}

it.each([false, true])(
  "hands off to a real fixture process and restores the closed database on boot failure (%s)",
  async (fail) => {
    const root = await mkdtemp(join(tmpdir(), "slopify-update-process-"));
    const server = createServer((_request, response) => response.end("old server"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (address === null || typeof address === "string") throw new Error("Missing fixture port");
    const port = address.port;
    const origin = `http://127.0.0.1:${port}`;
    const oldEntry = join(root, "old.mjs");
    const installer = join(root, "fixture-npm.cjs");
    try {
      await writeFile(join(root, "slopify.db"), "original database");
      await writeFile(oldEntry, serverScript("0.6.1", false));
      await writeFile(
        installer,
        `
      const fs = require('node:fs'); const path = require('node:path');
      const args = process.argv.slice(2); const prefix = args[args.indexOf('--prefix') + 1];
      const directory = path.join(prefix, 'node_modules', '@gentbajko', 'slopify');
      fs.mkdirSync(path.join(directory, 'dist', 'edge'), { recursive: true });
      fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name:'@gentbajko/slopify', version:'0.6.2', type:'module' }));
      fs.writeFileSync(path.join(directory, 'dist', 'edge', 'cli.js'), ${JSON.stringify(serverScript("0.6.2", fail))});
    `,
      );
      const plan: UpdatePlan = {
        token: "a".repeat(64),
        version: "0.6.2",
        previousVersion: "0.6.1",
        oldEntry,
        dataDir: root,
        cwd: root,
        host: "127.0.0.1",
        port,
        npm: { file: process.execPath, args: [installer] },
      };
      const operation = performUpdate(plan, async () => {
        // Installation has completed while the original server is still usable.
        expect(await (await fetch(origin)).text()).toBe("old server");
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      });
      if (fail) await expect(operation).rejects.toThrow("restored");
      else await operation;
      expect(await (await fetch(`${origin}/api/health`)).json()).toEqual({
        status: "ok",
        version: fail ? "0.6.1" : "0.6.2",
      });
      expect(await readFile(join(root, "rollback-marker"), "utf8")).toBe(fail ? "1" : "0");
      expect(await readFile(join(root, "slopify.db"), "utf8")).toBe(
        fail ? "original database" : "new database schema",
      );
      if (fail)
        await expect(readFile(join(root, "updates", "current.json"))).rejects.toMatchObject({
          code: "ENOENT",
        });
      else
        expect(JSON.parse(await readFile(join(root, "updates", "current.json"), "utf8"))).toEqual({
          version: "0.6.2",
          token: "a".repeat(64),
        });
    } finally {
      server.close();
      try {
        await fetch(`${origin}/shutdown`, { signal: AbortSignal.timeout(1000) });
      } catch {
        /* An assertion may fail before the fixture child starts. */
      }
      try {
        const pid = Number(await readFile(join(root, "child.pid"), "utf8"));
        for (let tries = 0; tries < 100; tries++) {
          try {
            process.kill(pid, 0);
          } catch {
            break;
          }
          await delay(10);
        }
      } catch {
        /* No child exists if setup failed. */
      }
      await rm(root, { recursive: true, force: true });
    }
  },
  15_000,
);
