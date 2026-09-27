import { parseArgs } from "node:util";

const options = {
  port: { type: "string" },
  host: { type: "string" },
  "data-dir": { type: "string" },
  "projects-dir": { type: "string" },
  "no-open": { type: "boolean" },
  docker: { type: "boolean" },
  "host-cli": { type: "string" },
  "accept-host-cli": { type: "boolean" },
  autostart: { type: "boolean" },
  "no-autostart": { type: "boolean" },
  help: { type: "boolean", short: "h" },
  version: { type: "boolean", short: "v" },
} as const;

export type CliValues = ReturnType<typeof parse>["values"];

function parse(args: readonly string[]) {
  return parseArgs({ args: [...args], allowPositionals: true, options });
}

export type CliArgs =
  | { readonly kind: "help" }
  | { readonly kind: "version" }
  | { readonly kind: "run"; readonly values: CliValues; readonly positionals: readonly string[] };

// Node's own wording for a bad flag ("Unknown option '--foo'. To specify a positional argument
// starting with a '-', place it after '--'") is replaced by one that says where the list is.
export function parseCli(args: readonly string[]): CliArgs {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse(args);
  } catch (error) {
    const code =
      error instanceof Error && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
    if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      const flag = /'([^']+)'/.exec(error instanceof Error ? error.message : "")?.[1];
      throw new Error(
        `Slopify doesn't know the option ${flag ?? "you gave"}. Run npx @gentbajko/slopify --help to see every option.`,
      );
    }
    if (code === "ERR_PARSE_ARGS_INVALID_OPTION_VALUE")
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}. Run npx @gentbajko/slopify --help to see how each option is written.`,
      );
    throw error;
  }
  if (parsed.values.help === true || parsed.positionals[0] === "help") return { kind: "help" };
  if (parsed.values.version === true) return { kind: "version" };
  return { kind: "run", values: parsed.values, positionals: parsed.positionals };
}

export function helpText(version: string): string {
  return `Slopify ${version}: makes narrated YouTube videos, Shorts, articles and PDFs from a topic.

Usage
  npx @gentbajko/slopify [options]            Start Slopify on this machine and open it in the browser
  npx @gentbajko/slopify --docker [options]   Install (or reinstall) Slopify in Docker (install --docker works too)
  npx @gentbajko/slopify@latest update        Update Slopify while it runs, or the Docker install (waits for running work first)

Options for starting Slopify
  --port <number>       The port the web app listens on (default 6969; or SLOPIFY_PORT)
  --host <address>      The address it listens on (default 127.0.0.1, only this machine; or SLOPIFY_HOST)
  --data-dir <folder>   Where Slopify keeps its database, settings and logs (default ~/.slopify; or SLOPIFY_DATA_DIR)
  --no-open             Don't open the browser when Slopify starts (or SLOPIFY_NO_OPEN=1)
  --autostart           Start Slopify when you log in, without asking
  --no-autostart        Don't start Slopify when you log in, without asking

Options for the Docker install
  --docker              Install or update Slopify in Docker instead of running it directly
  --projects-dir <folder>  The folder on this machine where the Docker version keeps project files
  --host-cli=off        Use API keys only; don't connect the AI CLIs installed on this machine
  --accept-host-cli     Connect the AI CLIs installed on this machine without asking

Other
  -h, --help            Show this list
  -v, --version         Print the version

More: https://slopify.stream`;
}
