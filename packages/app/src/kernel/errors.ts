// A failure's own sentence and every cause it wraps, for the log. The page shows only the
// sentence; the chain is the only place a "download interrupted" says the server closed the
// stream.
export function causedBy(error: unknown): string {
  const chain = [error instanceof Error ? error.message : String(error)];
  let cause = error instanceof Error ? error.cause : undefined;
  while (cause !== undefined && cause !== null && chain.length < 6) {
    chain.push(cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return chain.join(" <- ");
}
