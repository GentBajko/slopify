import { chmod, lstat, unlink } from "node:fs/promises";
import { Server } from "node:http";
import { connect } from "node:net";
import { join } from "node:path";
import { createAdaptorServer } from "@hono/node-server";
import { hostCliRoutes, hostGate } from "../edge/http/host-cli.js";
import type { HostCliPorts } from "../kernel/ports/host-cli.js";
import { hasCode } from "./paths.js";

export async function startHostServer(options: {
  readonly directory: string;
  readonly token: string;
  readonly version: string;
  readonly ports: HostCliPorts;
}): Promise<{
  stop: () => Promise<void>;
  pauseAdmissions: () => void;
  resumeAdmissions: () => void;
}> {
  const socket = join(options.directory, "cli.sock");
  if (Buffer.byteLength(socket) > 100) throw new Error("Use a shorter host helper socket path.");
  const directory = await lstat(options.directory);
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (process.getuid && directory.uid !== process.getuid())
  )
    throw new Error("Unsafe host helper directory.");
  try {
    const existing = await lstat(socket);
    if (!existing.isSocket() || (process.getuid && existing.uid !== process.getuid()))
      throw new Error("Unsafe host helper socket.");
    if (await listening(socket))
      throw new Error(
        `A Slopify host helper is already listening on ${socket}. Stop it first (systemctl --user stop slopify-cli-bridge.service).`,
      );
    await unlink(socket);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
  const gate = hostGate();
  const app = hostCliRoutes({ ...options, gate });
  const server = createAdaptorServer({ fetch: app.fetch });
  if (!(server instanceof Server)) throw new Error("Host helper requires HTTP over a Unix socket.");
  server.headersTimeout = 10_000;
  server.requestTimeout = 35_000;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  await chmod(socket, 0o666);
  const owned = await lstat(socket);
  let stopping: Promise<void> | undefined;
  return {
    pauseAdmissions: gate.pause,
    resumeAdmissions: gate.resume,
    stop: () => {
      stopping ??= (async () => {
        gate.stop();
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            server.closeAllConnections();
            resolve();
          }, 5000);
          timer.unref();
          server.close(() => {
            clearTimeout(timer);
            resolve();
          });
          server.closeIdleConnections();
        });
        try {
          const current = await lstat(socket);
          if (current.ino === owned.ino && current.dev === owned.dev) await unlink(socket);
        } catch (error) {
          if (!hasCode(error, "ENOENT")) throw error;
        }
      })();
      return stopping;
    },
  };
}
function listening(path: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const socket = connect(path);
    socket.setTimeout(1000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Could not verify existing host socket."));
    });
    socket.once("error", (error) => {
      socket.destroy();
      if (hasCode(error, "ECONNREFUSED")) resolve(false);
      else reject(new Error("Could not verify existing host socket."));
    });
  });
}
