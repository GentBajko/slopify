import { Fragment, type ReactElement, type ReactNode } from "react";

// A sentence that names a command to run ("remove it with tailscale serve --https=443 off")
// shows the command as code: in the monospace face with no ligatures, so "--" stays two hyphens
// and a selection copies exactly what is typed. Only the commands Slopify's own sentences name
// are recognised: a tailscale or npx call and its arguments.

const starts = new Set(["tailscale", "npx"]);
const words = new Set(["serve", "funnel", "status", "off", "on", "up", "reset"]);

// One argument of a command, its trailing punctuation already taken off.
function argument(token: string, open: boolean): boolean {
  if (open) return true;
  return (
    words.has(token) ||
    /^--[\w-]+(?:=\S+)?$/u.test(token) ||
    /^https?:\/\/\S+$/u.test(token) ||
    /^@[\w./@-]+$/u.test(token) ||
    /^<[^>]*>?$/u.test(token) ||
    /^\d+$/u.test(token)
  );
}

export function splitCommands(
  text: string,
): readonly { readonly text: string; readonly command: boolean }[] {
  const tokens = text.split(/( )/u);
  const parts: { text: string; command: boolean }[] = [];
  const push = (piece: string, command: boolean) => {
    const last = parts.at(-1);
    if (last !== undefined && last.command === command) last.text += piece;
    else parts.push({ text: piece, command });
  };
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index] ?? "";
    if (!starts.has(token) || tokens[index + 2] === undefined) {
      push(token, false);
      index += 1;
      continue;
    }
    // The command and its arguments, up to the first token that isn't one; a placeholder such
    // as <Slopify's port> runs on to its closing bracket.
    let command = token;
    let at = index + 2;
    let open = false;
    let tail = "";
    while (at < tokens.length) {
      const next = tokens[at] ?? "";
      const bare = next.replace(/[.,;:)]+$/u, "");
      if (bare === "" || !argument(bare, open)) break;
      command += ` ${bare}`;
      open = (open || bare.includes("<")) && !bare.includes(">");
      at += 2;
      if (bare !== next) {
        tail = next.slice(bare.length);
        break;
      }
    }
    if (command === token) {
      push(token, false);
      index += 1;
      continue;
    }
    push(command, true);
    if (tail !== "") push(tail, false);
    index = at - 1;
  }
  return parts;
}

export function CommandText({ text }: { readonly text: string }): ReactElement {
  const parts: ReactNode[] = splitCommands(text).map((part, index) =>
    part.command ? (
      <code
        // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed sentence, in order.
        key={index}
        className="sl-code sl-command"
      >
        {part.text}
      </code>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one fixed sentence, in order.
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
  return <>{parts}</>;
}
