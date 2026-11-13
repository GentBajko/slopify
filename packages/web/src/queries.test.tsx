import { focusManager, useQuery } from "@tanstack/react-query";
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useApp } from "@/app-context";
import { pronunciationGapsQuery, pronunciationsHeardQuery } from "@/queries";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";

afterEach(cleanup);

// Both checks read a project's whole saved version on the server, and a run's events and a
// save already ask for them again, so a return to the window leaves them alone.
it("does not ask for the name checks again when the window comes back", async () => {
  const asked = { gaps: 0, heard: 0, other: 0 };
  function Checks() {
    const { api } = useApp();
    useQuery(pronunciationGapsQuery(api, "p1"));
    useQuery(pronunciationsHeardQuery(api, "p1"));
    useQuery({
      queryKey: ["something-else"],
      queryFn: () => {
        asked.other += 1;
        return asked.other;
      },
    });
    return null;
  }
  renderApp(
    <Checks />,
    testDeps({
      "GET /api/projects/p1/pronunciations/gaps": (request) => {
        asked.gaps += 1;
        return jsonAnswer({ gaps: [] })(request);
      },
      "GET /api/projects/p1/pronunciations/heard": (request) => {
        asked.heard += 1;
        return jsonAnswer({ names: [] })(request);
      },
    }),
  );
  await waitFor(() => expect(asked).toEqual({ gaps: 1, heard: 1, other: 1 }));
  try {
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(asked.other).toBe(2));
    expect(asked).toMatchObject({ gaps: 1, heard: 1 });
  } finally {
    focusManager.setFocused(undefined);
  }
});
