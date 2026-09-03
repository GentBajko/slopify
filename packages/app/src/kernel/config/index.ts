import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface Config {
  readonly port: number;
  readonly host: string;
  readonly dataDir: string;
  readonly open: boolean;
}

export interface ConfigFlags {
  readonly port?: string | undefined;
  readonly host?: string | undefined;
  readonly "data-dir"?: string | undefined;
  readonly "no-open"?: boolean | undefined;
}

export type ConfigEnv = Readonly<Record<string, string | undefined>>;

const defaultPort = 6969;
const defaultHost = "127.0.0.1";

export function configFrom(flags: ConfigFlags, env: ConfigEnv): Config {
  const port = flags.port ?? env.SLOPIFY_PORT;
  const host = flags.host ?? env.SLOPIFY_HOST ?? defaultHost;
  const dataDir = flags["data-dir"] ?? env.SLOPIFY_DATA_DIR ?? join(homedir(), ".slopify");
  if (host.trim() === "") {
    throw new Error("host must not be empty");
  }
  return {
    port: port === undefined ? defaultPort : parsePort(port),
    host,
    dataDir: resolve(dataDir),
    open: flags["no-open"] === true ? false : !isTruthy(env.SLOPIFY_NO_OPEN),
  };
}

function parsePort(value: string): number {
  const port = Number(value.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `invalid port ${JSON.stringify(value)}: expected an integer between 1 and 65535`,
    );
  }
  return port;
}

function isTruthy(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  const normalised = value.trim().toLowerCase();
  return normalised !== "" && normalised !== "0" && normalised !== "false";
}
