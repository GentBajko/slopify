import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { type QueryLike, QueryState } from "./query-state.js";

afterEach(cleanup);

function query(over: Partial<QueryLike<readonly string[]>>): QueryLike<readonly string[]> {
  return {
    data: undefined,
    error: null,
    isPending: true,
    isFetching: true,
    dataUpdatedAt: 0,
    refetch: () => Promise.resolve(),
    ...over,
  };
}

function draw(items: readonly string[]) {
  return items.length === 0 ? <p>None yet</p> : <p>{items.join(", ")}</p>;
}

it("shows a placeholder while loading, never the empty result", () => {
  render(
    <QueryState query={query({})} what="Your videos">
      {draw}
    </QueryState>,
  );
  expect(screen.getByRole("status", { name: "Loading your videos…" })).not.toBeNull();
  expect(screen.queryByText("None yet")).toBeNull();
});

it("says a failed first load and retries in place", async () => {
  const user = userEvent.setup();
  const refetch = vi.fn(() => Promise.resolve());
  render(
    <QueryState
      query={query({ isPending: false, isFetching: false, error: new Error("Timed out"), refetch })}
      what="Your videos"
    >
      {draw}
    </QueryState>,
  );
  expect(screen.getByRole("alert").textContent).toContain(
    "Your videos didn't loadTimed out. Check that Slopify is still running, then press Retry.",
  );
  expect(screen.queryByText("None yet")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(refetch).toHaveBeenCalledOnce();
});

it("keeps showing loaded data after a failed refresh and says how old it is", () => {
  const at = new Date(2026, 9, 4, 14, 2).valueOf();
  render(
    <QueryState
      query={query({
        data: ["One"],
        isPending: false,
        isFetching: false,
        error: new Error("Timed out"),
        dataUpdatedAt: at,
      })}
      what="Your videos"
    >
      {draw}
    </QueryState>,
  );
  expect(screen.getByText("One")).not.toBeNull();
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(at);
  expect(screen.getByRole("status").textContent).toContain(
    `Showing your videos as of ${time}. The latest refresh failed: Timed out.`,
  );
});

it("draws an empty result only once it has loaded", () => {
  render(
    <QueryState query={query({ data: [], isPending: false, isFetching: false })} what="Your videos">
      {draw}
    </QueryState>,
  );
  expect(screen.getByText("None yet")).not.toBeNull();
});
