import { createInterface } from "node:readline/promises";
import type { AutostartService } from "./service.js";

export const autostartQuestion = "Start Slopify when you log in? (Y/n) ";

// The two flags as one answer: undefined when neither was given.
export function autostartFlag(values: {
  readonly autostart?: boolean | undefined;
  readonly "no-autostart"?: boolean | undefined;
}): boolean | undefined {
  if (values.autostart === true && values["no-autostart"] === true)
    throw new Error(
      "--autostart and --no-autostart say opposite things. Keep the one you mean and try again.",
    );
  return values.autostart === true ? true : values["no-autostart"] === true ? false : undefined;
}

// Y, yes or just Enter is yes; n or no is no; anything else is no answer.
export function readAnswer(text: string): boolean | undefined {
  const answer = text.trim().toLowerCase();
  if (answer === "" || answer === "y" || answer === "yes") return true;
  if (answer === "n" || answer === "no") return false;
  return undefined;
}

// One question on the terminal. Ctrl+C still stops Slopify: the question gives up and the
// signal goes on to the handler that shuts the server down.
export async function askTerminal(question: string): Promise<boolean | undefined> {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  const interrupted = new Promise<undefined>((resolve) => {
    terminal.once("SIGINT", () => {
      terminal.close();
      resolve(undefined);
      process.kill(process.pid, "SIGINT");
    });
  });
  try {
    return await Promise.race([terminal.question(question).then(readAnswer), interrupted]);
  } catch {
    return undefined;
  } finally {
    terminal.close();
  }
}

/**
 * `npx @gentbajko/slopify`: --autostart / --no-autostart set the switch; without them an
 * interactive terminal is asked once, unless the first-run screen or Settings already asked.
 * Never fails the start: a refusal is printed with what to do.
 */
export async function settleAutostart(options: {
  readonly autostart: AutostartService;
  readonly flag: boolean | undefined;
  readonly interactive: boolean;
  readonly ask: (question: string) => Promise<boolean | undefined>;
  readonly report: (line: string) => void;
  readonly warn: (line: string) => void;
}): Promise<void> {
  try {
    let wanted = options.flag;
    if (wanted === undefined) {
      if (!(await options.autostart.unanswered())) return;
      // Started without a terminal (a service, a script, a desktop shortcut): nobody can answer
      // here, so the question stays open for the first-run screen and Settings → General.
      if (!options.interactive) {
        options.report(
          "To start Slopify when you log in, turn it on in the app: the first-run screen offers it, or Settings → General → Start Slopify when I log in.",
        );
        return;
      }
      wanted = await options.ask(autostartQuestion);
      if (wanted === undefined) return;
    }
    const view = await options.autostart.set(wanted);
    if (!view.available) {
      options.report(view.summary);
      return;
    }
    options.report(
      view.enabled === true
        ? `${view.summary} Login entry: ${view.where}. Turn it off in Settings → General.`
        : `${view.summary} Turn it on any time in Settings → General.`,
    );
  } catch (error) {
    options.warn(error instanceof Error ? error.message : String(error));
  }
}
