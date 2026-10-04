import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button.js";
import { Callout } from "./callout.js";

// The four states of a region that shows fetched data: loading, failed with nothing to show,
// shown but stale because the latest refresh failed, and loaded (empty or not, which the
// region says itself). A failed first load never reads as an empty result, and every failure
// has Retry in place rather than a page reload.

// What these helpers read of a TanStack query result.
export interface QueryLike<T> {
  readonly data: T | undefined;
  readonly error: Error | null;
  readonly isPending: boolean;
  readonly isFetching: boolean;
  readonly dataUpdatedAt: number;
  readonly refetch: () => Promise<unknown>;
}

const defaultFix = "Check that Slopify is still running, then press Retry.";
const clock = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

function sentence(message: string): string {
  const trimmed = message.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function RetryButton({
  onRetry,
  retrying,
  size = "default",
}: {
  readonly onRetry: () => void;
  readonly retrying: boolean;
  readonly size?: "default" | "small";
}): ReactElement {
  return (
    <Button
      variant={size === "small" ? "quiet" : "secondary"}
      size={size}
      disabled={retrying}
      disabledReason="Trying again…"
      onClick={onRetry}
    >
      {retrying ? "Retrying…" : "Retry"}
    </Button>
  );
}

// Placeholder bars the height of what will load, so the page does not jump when it arrives.
export function LoadingBlock({
  label,
  rows = 2,
  rowClassName = "h-16",
}: {
  // "Loading your projects…", read by screen readers.
  readonly label: string;
  readonly rows?: number;
  readonly rowClassName?: string;
}): ReactElement {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders in a fixed order.
          key={index}
          aria-hidden="true"
          className={cn(
            "rounded-[var(--radius-media)] bg-sunken motion-safe:animate-pulse",
            rowClassName,
          )}
        />
      ))}
    </div>
  );
}

// A first load that failed: what failed, why, and Retry. `compact` is one line for a small
// region beside others.
export function LoadFailed({
  what,
  error,
  fix = defaultFix,
  onRetry,
  retrying,
  compact = false,
}: {
  // "Your projects", "The calendar".
  readonly what: string;
  readonly error: Error;
  readonly fix?: string;
  readonly onRetry: () => void;
  readonly retrying: boolean;
  readonly compact?: boolean;
}): ReactElement {
  const detail = `${sentence(error.message)} ${fix}`;
  if (compact)
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p role="alert" className="m-0 min-w-0 text-small text-danger">
          {`${what} didn't load: ${detail}`}
        </p>
        <RetryButton onRetry={onRetry} retrying={retrying} size="small" />
      </div>
    );
  return (
    <Callout
      tone="danger"
      title={`${what} didn't load`}
      actions={<RetryButton onRetry={onRetry} retrying={retrying} />}
    >
      {detail}
    </Callout>
  );
}

// Data still shown after a refresh failed: how old it is, why it is not newer, and Retry.
export function StaleNote({
  what,
  error,
  updatedAt,
  onRetry,
  retrying,
}: {
  // "your projects".
  readonly what: string;
  readonly error: Error;
  readonly updatedAt: number;
  readonly onRetry: () => void;
  readonly retrying: boolean;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <p role="status" className="m-0 min-w-0 text-small text-ink-2">
        {`Showing ${what} as of ${clock.format(new Date(updatedAt))}. The latest refresh failed: ${sentence(error.message)} ${defaultFix}`}
      </p>
      <RetryButton onRetry={onRetry} retrying={retrying} size="small" />
    </div>
  );
}

// One region's data through its states. `children` draws the loaded data, and says itself when
// it is empty.
export function QueryState<T>({
  query,
  what,
  fix,
  loading,
  compact = false,
  children,
}: {
  readonly query: QueryLike<T>;
  // "Your projects": the start of "Your projects didn't load".
  readonly what: string;
  readonly fix?: string;
  // What stands in while it loads; null for nothing. Absent is one placeholder bar.
  readonly loading?: ReactNode;
  readonly compact?: boolean;
  readonly children: (data: T) => ReactNode;
}): ReactElement {
  const retry = (): void => {
    void query.refetch();
  };
  if (query.data === undefined) {
    if (query.error !== null)
      return (
        <LoadFailed
          what={what}
          error={query.error}
          {...(fix === undefined ? {} : { fix })}
          onRetry={retry}
          retrying={query.isFetching}
          compact={compact}
        />
      );
    return (
      <>
        {loading === undefined ? (
          <LoadingBlock label={`Loading ${what.toLowerCase()}…`} rows={1} />
        ) : (
          loading
        )}
      </>
    );
  }
  return (
    <>
      {query.error === null ? null : (
        <StaleNote
          what={what.toLowerCase()}
          error={query.error}
          updatedAt={query.dataUpdatedAt}
          onRetry={retry}
          retrying={query.isFetching}
        />
      )}
      {children(query.data)}
    </>
  );
}
