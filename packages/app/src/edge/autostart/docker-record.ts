import { join } from "node:path";
import { installSchema, readState, writeState } from "../docker-install/state.js";
import {
  type DockerHost,
  inspectDockerStart,
  type LoginStart,
  loginStartFile,
  loginStartReport,
  loginStartSchema,
} from "./docker.js";
import type { AutostartExec } from "./native.js";
import { autostartQuestion } from "./prompt.js";

/**
 * The --docker installer's part: ask "Start Slopify when you log in?" once (or take
 * --autostart / --no-autostart), look whether Docker starts by itself, and leave the answer in
 * the installation's activation folder, which the container reads at
 * /opt/slopify-install/login-start.json. Docker's own settings are only read, never changed.
 */
export async function recordLoginStart(o: {
  readonly directory: string;
  readonly name: string;
  readonly uid: number;
  readonly flag: boolean | undefined;
  readonly interactive: boolean;
  readonly ask: (question: string) => Promise<boolean | undefined>;
  readonly exec: AutostartExec;
  readonly host: DockerHost;
  readonly now: () => Date;
  readonly report: (line: string) => void;
}): Promise<LoginStart> {
  const install = await readState(join(o.directory, "install.json"), installSchema, o.uid);
  // Rootless Docker runs the container as 0:0 (see compose.yaml's SLOPIFY_USER).
  const manager = install?.user === "0:0" ? "rootless" : "system";
  const path = join(o.directory, "activation", loginStartFile);
  const previous = await readState(path, loginStartSchema, o.uid).catch(() => null);
  let wanted = o.flag ?? previous?.wanted ?? null;
  if (wanted === null && o.interactive) wanted = (await o.ask(autostartQuestion)) ?? null;
  const record: LoginStart = {
    version: 1,
    checkedAt: o.now().toISOString(),
    manager,
    wanted,
    ...(await inspectDockerStart({ exec: o.exec, manager, host: o.host })),
  };
  await writeState(path, record);
  o.report(
    wanted === false
      ? `Slopify in Docker still starts whenever Docker does, because its container restarts with Docker. When you don't want it running: docker stop ${o.name}`
      : loginStartReport(record),
  );
  return record;
}
