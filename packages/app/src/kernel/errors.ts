// The one sentence a failure carries: an Error's message, or whatever else was thrown as text.
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// The Node file-system code (`ENOENT`, `EEXIST`) of a thrown value, if it carries one.
export function errnoCode(error: unknown): string | undefined {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : undefined;
}

export function hasErrnoCode(error: unknown, code: string): boolean {
  return errnoCode(error) === code;
}

// A path that is missing, not a directory, not readable or a link loop: nothing to read there.
export function isUnreachablePath(error: unknown): boolean {
  const code = errnoCode(error);
  return code !== undefined && ["ENOENT", "ENOTDIR", "EACCES", "EPERM", "ELOOP"].includes(code);
}

// A failure's own sentence and every cause it wraps, for the log. The page shows only the
// sentence; the chain is the only place a "download interrupted" says the server closed the
// stream.
export function causedBy(error: unknown): string {
  const chain = [errorText(error)];
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause !== undefined && cause !== null && chain.length < 6) {
    chain.push(cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return chain.join(" <- ");
}

// The sentence for a check that can only fail through a bug. `what` says which check, in words a
// person can report; `retry` names the button that is right on the screen the message appears on.
export function internalError(what: string, retry = "Try again"): string {
  return `Slopify hit an internal error (${what}). ${retry}; if it happens again, use Download diagnostics in Settings and report it.`;
}
