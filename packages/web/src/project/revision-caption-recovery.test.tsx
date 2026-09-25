import type {
  RevisionEdit,
  RevisionOutputView,
  RevisionView,
} from "@app/slices/revisions/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { RevisionContentEditors } from "./revision-content.js";
import { revisionView } from "./revision-fixture.js";
import { formOfRevision } from "./revision-form-state.js";

afterEach(cleanup);
function output(
  workKey: string,
  role: RevisionOutputView["output"]["role"],
  durationMs: number | null,
): RevisionOutputView {
  return {
    recordId: workKey,
    publicationId: null,
    selected: true,
    slot: role,
    workKey,
    assetId: workKey,
    fingerprint: workKey,
    state: "ready",
    available: true,
    output: {
      id: workKey,
      projectId: "p1",
      stageKind: role === "audio_export" || role === "subtitle_words" ? "video" : "audio",
      role,
      path: workKey,
      originalFilename: null,
      bytes: 10,
      durationMs,
      meta: {},
      createdAt: "today",
    },
  };
}
function narrated(source: "provide" | "generate" = "provide"): RevisionView {
  const base = revisionView();
  const outputs = [
    output(source === "provide" ? "audio:provided" : "audio:body:concat", "audio_body", 4000),
    output("subtitles:timing", "subtitle_words", null),
  ];
  return {
    ...base,
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        sources: { ...base.revision.config.sources, audio: source },
      },
      fingerprints: Object.fromEntries(outputs.map((row) => [row.workKey, row.fingerprint])),
    },
    outputs,
  };
}
function Harness({
  view,
  changed = () => {},
}: {
  readonly view: RevisionView;
  readonly changed?: (edit: RevisionEdit) => void;
}) {
  const [edit, setEdit] = useState(() => formOfRevision(view));
  return (
    <RevisionContentEditors
      view={view}
      edit={edit}
      fields={[]}
      onPending={() => {}}
      onChange={(next) => {
        setEdit(next);
        changed(next);
      }}
    />
  );
}
function renderTiming(view: RevisionView, end: number) {
  const changed = vi.fn();
  renderApp(
    <Harness view={view} changed={changed} />,
    testDeps({
      "GET /files/p1/revisions/r1/subtitles%3Atiming": jsonAnswer({
        words: [{ text: "Hello.", start: 0, end }],
      }),
    }),
  );
  return changed;
}
it.each(["provide", "generate"] as const)(
  "edits aligned captions from complete %s narration before any final export",
  async (source) => {
    const user = userEvent.setup();
    const changed = renderTiming(narrated(source), 4);
    await user.click(screen.getByRole("button", { name: "Edit existing caption cues" }));
    await screen.findByRole("textbox", { name: "Text for caption 1" });
    expect(changed.mock.lastCall?.[0].content.subtitleCues.audioFingerprint).toBe(
      "subtitles:timing",
    );
  },
);
it.each([true, false])(
  "includes generated entries and silence gaps in cue bounds (%s)",
  async (within) => {
    const base = narrated("generate");
    const entries = [
      output("audio:intro", "audio_intro", 1000),
      output("audio:outro", "audio_outro", 2000),
    ];
    const view: RevisionView = {
      ...base,
      outputs: [...base.outputs, ...entries],
      revision: {
        ...base.revision,
        config: {
          ...base.revision.config,
          intro: { name: "Welcome", mode: "text" },
          outro: { name: "Bye", mode: "text" },
          silenceGapSeconds: 0.5,
        },
        fingerprints: {
          ...base.revision.fingerprints,
          ...Object.fromEntries(entries.map((row) => [row.workKey, row.fingerprint])),
        },
      },
    };
    const changed = renderTiming(view, within ? 8 : 8.1);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Edit existing caption cues" }));
    if (within) await screen.findByRole("textbox", { name: "Text for caption 1" });
    else {
      await screen.findByRole("alert");
      expect(changed).not.toHaveBeenCalled();
    }
  },
);
it("ignores dormant entry settings, old entry audio and gaps for a supplied whole narration", async () => {
  const base = narrated();
  const view: RevisionView = {
    ...base,
    outputs: [...base.outputs, output("audio:intro", "audio_intro", 5000)],
    revision: {
      ...base.revision,
      config: {
        ...base.revision.config,
        intro: { name: "Old intro", mode: "text" },
        silenceGapSeconds: 3,
      },
    },
  };
  const changed = renderTiming(view, 4.1);
  await userEvent.setup().click(screen.getByRole("button", { name: "Edit existing caption cues" }));
  await screen.findByRole("alert");
  expect(changed).not.toHaveBeenCalled();
});
it.each([
  "missing",
  "missing with current export",
  "unavailable",
  "outdated",
  "unselected",
  "fingerprint",
  "unknown",
  "missing intro",
])("does not enable caption editing from %s narration or an outdated export", (failure) => {
  const base = narrated("generate");
  const view: RevisionView = {
    ...base,
    revision: {
      ...base.revision,
      fingerprints: { ...base.revision.fingerprints, "export:wav": "export:wav" },
      config: {
        ...base.revision.config,
        ...(failure === "missing intro"
          ? { intro: { name: "Welcome", mode: "text" as const } }
          : {}),
      },
    },
    outputs: [
      ...base.outputs.flatMap((row) =>
        row.output.role !== "audio_body"
          ? [row]
          : failure.startsWith("missing") && failure !== "missing intro"
            ? []
            : [
                {
                  ...row,
                  available: failure !== "unavailable",
                  selected: failure !== "unselected",
                  state: failure === "outdated" ? ("outdated" as const) : row.state,
                  fingerprint: failure === "fingerprint" ? "old" : row.fingerprint,
                  output: {
                    ...row.output,
                    durationMs: failure === "unknown" ? null : row.output.durationMs,
                  },
                },
              ],
      ),
      {
        ...output("export:wav", "audio_export", 9000),
        state: failure === "missing with current export" ? "ready" : "outdated",
      },
    ],
  };
  renderTiming(view, 1);
  expect(
    (screen.getByRole("button", { name: "Edit existing caption cues" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it("uses a matching completed export for unknown metadata only when all narration is present", async () => {
  const base = narrated();
  const view: RevisionView = {
    ...base,
    revision: {
      ...base.revision,
      fingerprints: { ...base.revision.fingerprints, "export:wav": "export:wav" },
    },
    outputs: [
      ...base.outputs.map((row) => ({ ...row, output: { ...row.output, durationMs: null } })),
      output("export:wav", "audio_export", 4000),
    ],
  };
  renderTiming(view, 4);
  await userEvent.setup().click(screen.getByRole("button", { name: "Edit existing caption cues" }));
  await screen.findByRole("textbox", { name: "Text for caption 1" });
});
it("lets users correct retained cues against replacement narration without silently rebinding them", async () => {
  const base = narrated();
  const saved = {
    audioFingerprint: "previous-narration",
    cues: [{ id: "c1", text: "Retained words.", start: 0, end: 3 }],
  };
  const view: RevisionView = {
    ...base,
    revision: { ...base.revision, content: { ...base.revision.content, subtitleCues: saved } },
  };
  const changed = vi.fn();
  renderApp(<Harness view={view} changed={changed} />, testDeps({}));
  expect(screen.getByText(/earlier narration/)).toBeTruthy();
  expect(changed).not.toHaveBeenCalled();
  const user = userEvent.setup();
  await user.clear(screen.getByRole("textbox", { name: "Text for caption 1" }));
  await user.type(screen.getByRole("textbox", { name: "Text for caption 1" }), "Corrected words.");
  await user.click(screen.getByRole("button", { name: "Apply caption edits to draft" }));
  expect(changed.mock.lastCall?.[0].content.subtitleCues).toEqual({
    ...saved,
    cues: [{ ...saved.cues[0], text: "Corrected words." }],
  });
  expect(screen.getByText(/earlier narration/)).toBeTruthy();
});

it.each(["missing", "unknown"])(
  "retains manual captions but holds their editor for %s narration",
  (failure) => {
    const base = narrated();
    const saved = {
      audioFingerprint: "previous-narration",
      cues: [{ id: "c1", text: "Keep my words.", start: 0, end: 1 }],
    };
    const view: RevisionView = {
      ...base,
      revision: { ...base.revision, content: { ...base.revision.content, subtitleCues: saved } },
      outputs:
        failure === "missing"
          ? []
          : base.outputs.map((row) => ({ ...row, output: { ...row.output, durationMs: null } })),
    };
    const changed = vi.fn();
    renderApp(<Harness view={view} changed={changed} />, testDeps({}));
    expect(screen.queryByRole("textbox", { name: "Text for caption 1" })).toBeNull();
    expect(screen.getByText(/subtitle timing\s+is ready/)).toBeTruthy();
    expect(changed).not.toHaveBeenCalled();
  },
);
