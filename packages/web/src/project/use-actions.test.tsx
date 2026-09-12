import {
  type RevisionControlInput,
  revisionControlSchema,
} from "@app/slices/control/revision-control-schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, expect, it } from "vitest";
import { useApp } from "@/app-context";
import { keys, projectQuery } from "@/queries";
import { body } from "@/routes/project-fixtures";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { revisionView } from "./revision-fixture.js";
import { useProjectActions } from "./use-actions.js";

afterEach(cleanup);
function Probe({ advance, seen }: { readonly advance: () => void; readonly seen: string[] }) {
  const { api } = useApp();
  const client = useQueryClient();
  const query = useQuery(projectQuery(api, "p1"));
  const actions = useProjectActions("p1");
  useEffect(() => {
    if (query.data?.revisionId) seen.push(query.data.revisionId);
  }, [query.data?.revisionId, seen]);
  return (
    <div>
      <span>{query.data?.revisionId ?? "legacy"}</span>
      <button
        type="button"
        disabled={actions.pending}
        onClick={() => actions.run({ kind: "pause" })}
      >
        Pause
      </button>
      <button
        type="button"
        disabled={actions.pending}
        onClick={() => actions.run({ kind: "cancel" })}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          advance();
          client.setQueryData(keys.project("p1"), {
            ...body({ status: "running", stages: [], outputs: [] }),
            revisionId: "r2",
          });
        }}
      >
        New revision
      </button>
      {actions.refusal ? <p role="alert">{actions.refusal.message}</p> : null}
    </div>
  );
}
it("retries an uncertain pause with its original identity after the current revision changes", async () => {
  const user = userEvent.setup();
  let current = { ...body({ status: "running", stages: [], outputs: [] }), revisionId: "r1" };
  const requests: RevisionControlInput[] = [];
  const seen: string[] = [];
  renderApp(
    <Probe
      advance={() => {
        current = { ...body({ status: "running", stages: [], outputs: [] }), revisionId: "r2" };
      }}
      seen={seen}
    />,
    testDeps({
      "GET /api/projects/p1": (request) => jsonAnswer(current)(request),
      "POST /api/projects/p1/pause": async (request) => {
        requests.push(revisionControlSchema.parse(await request.json()));
        if (requests.length === 1) throw new TypeError("Connection lost");
        return jsonAnswer({
          ...body({ status: "running", stages: [], outputs: [] }),
          revisionId: "r1",
        })(request);
      },
    }),
  );
  await screen.findByText("r1");
  await user.click(screen.getByRole("button", { name: "Pause" }));
  await screen.findByText("Connection lost");
  await user.click(screen.getByRole("button", { name: "New revision" }));
  await screen.findByText("r2");
  seen.length = 0;
  await user.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() => expect(requests).toHaveLength(2));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Pause" }).hasAttribute("disabled")).toBe(false),
  );
  expect(requests[0]).toEqual(requests[1]);
  expect(requests[1]?.baseRevisionId).toBe("r1");
  expect(seen).not.toContain("r1");
  await user.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() => expect(requests).toHaveLength(3));
  expect(requests[2]?.baseRevisionId).toBe("r2");
  expect(requests[2]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey);
});
it("prepares a legacy baseline before controlling it and keeps pause and cancel request identities separate", async () => {
  const user = userEvent.setup();
  const requests: RevisionControlInput[] = [];
  const operations: string[] = [];
  renderApp(
    <Probe advance={() => undefined} seen={[]} />,
    testDeps({
      "GET /api/projects/p1": jsonAnswer(body({ status: "running", stages: [], outputs: [] })),
      "POST /api/projects/p1/revisions/prepare": (request) => {
        operations.push("prepare");
        return jsonAnswer({ ok: true, created: true, view: revisionView() })(request);
      },
      "POST /api/projects/p1/pause": async (request) => {
        operations.push("pause");
        requests.push(revisionControlSchema.parse(await request.json()));
        throw new TypeError("Pause uncertain");
      },
      "POST /api/projects/p1/cancel": async (request) => {
        operations.push("cancel");
        requests.push(revisionControlSchema.parse(await request.json()));
        return jsonAnswer({
          ...body({ status: "running", stages: [], outputs: [] }),
          revisionId: "r1",
        })(request);
      },
    }),
  );
  await user.click(screen.getByRole("button", { name: "Pause" }));
  await screen.findByText("Pause uncertain");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(operations).toEqual(["prepare", "pause", "prepare", "cancel"]);
  expect(requests[0]?.baseRevisionId).toBe("r1");
  expect(requests[1]?.baseRevisionId).toBe("r1");
  expect(requests[1]?.idempotencyKey).not.toBe(requests[0]?.idempotencyKey);
});
