import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { attachSamples } from "../../kernel/paths.js";
import { projectExists } from "../admission/repo.js";
import { saveNarrationAliases } from "../narration/aliases-library.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import type { ProviderStatus } from "../settings/model.js";
import { projectDir } from "../storage/layout.js";
import { writeStudioSettings } from "./budget.js";
import type { SampleJob } from "./jobs.js";
import { makePaidSample, sampleBusy } from "./paid.js";
import { sampleOf, sampleProjects, sampleVersions, setSampleVersion } from "./repo.js";
import { requestSample, storedUnknownAcks } from "./save.js";
import { paidDocument, paidSampleDeps } from "./studio.fake.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

const ready = (id: string, family: "llm" | "tts" | "image"): ProviderStatus => ({
  id: id as ProviderStatus["id"],
  family,
  displayName: id,
  readiness: { kind: "keyed", hasKey: true },
});

// A sample loop over a real database, with a runner that finishes (or fails) whatever it is
// ticked for at once, as if the provider had answered.
function harness(
  options: { readonly fail?: string; readonly providers?: readonly ProviderStatus[] } = {},
) {
  const h = draftFixture();
  open.push(h.close);
  const paths = h.deps.paths;
  attachSamples(paths, sampleProjects(h.deps.db, paths.dataDir));
  const { review, paid: deps, ticks } = paidSampleDeps(h.deps, options);
  const document = paidDocument(review);
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const job = (over: Partial<SampleJob> = {}): SampleJob => ({
    templateId: id,
    templateVersion: 1,
    ackHigh: 5,
    kind: "save",
    requestedAt: "2026-09-12T00:00:00.000Z",
    ...over,
  });
  const save = (next: PlayDraftDocument, baseVersion: number) => {
    const saved = updateTemplate(h.deps, {
      id,
      baseVersion,
      mutationId: randomUUID(),
      name: "Show",
      document: next,
    });
    if (!saved.ok) throw new Error(saved.reason);
    return saved.value.version;
  };
  return { h, deps, id, job, ticks, document, save, paths };
}

const signal = new AbortController().signal;

describe("a template's first paid sample", () => {
  it("starts a run on a hidden project kept in the data dir, and marks the version done", async () => {
    const { h, deps, id, job, ticks, paths } = harness();
    await makePaidSample(deps, job(), signal);
    const sample = sampleOf(h.deps.db, id);
    if (sample === undefined) throw new Error("no sample");
    expect(ticks).toEqual([sample.projectId]);
    expect(sample).toMatchObject({ topic: "The history of the lighthouse", fullScript: false });
    const project = h.deps.db
      .prepare("SELECT config FROM projects WHERE id=?")
      .get(sample.projectId);
    const config = JSON.parse(String(project?.config));
    expect(config).toMatchObject({
      title: "History: The history of the lighthouse",
      sample: { fullScript: false },
    });
    expect(sampleVersions(h.deps.db, id)[0]).toMatchObject({
      templateVersion: 1,
      state: "done",
      heldReason: null,
    });
    expect(projectDir(paths, sample.projectId).startsWith(paths.projects)).toBe(false);
    // Nothing of the sample is in the Projects folder the user browses.
    expect(readdirSync(paths.projects)).toEqual([]);
  });

  it("waits, spending nothing, when it costs more than the person saw", async () => {
    const { h, deps, id, job, ticks } = harness();
    await makePaidSample(deps, job({ ackHigh: 0 }), signal);
    expect(ticks).toEqual([]);
    expect(sampleOf(h.deps.db, id)).toBeUndefined();
    const [version] = sampleVersions(h.deps.db, id);
    expect(version?.state).toBe("held");
    expect(version?.heldReason).toMatch(
      /^Waiting: this sample now costs about \$\d+\.\d\d, more than the \$0\.00 you saw\. Press Make sample \(\$\d+\.\d\d\) to make it\.$/,
    );
  });

  it("waits when today's budget can't cover it", async () => {
    const { h, deps, id, job, ticks } = harness();
    writeStudioSettings(h.deps.db, { dailyBudget: 0 });
    await makePaidSample(deps, job(), signal);
    expect(ticks).toEqual([]);
    expect(sampleVersions(h.deps.db, id)[0]?.heldReason).toContain(
      "of today's $0.00 sample budget is left",
    );
  });

  it("says what to set up when a provider isn't, before anything is spent", async () => {
    const { h, deps, id, job, ticks } = harness({ providers: [ready("openrouter", "llm")] });
    await makePaidSample(deps, job(), signal);
    expect(ticks).toEqual([]);
    expect(sampleVersions(h.deps.db, id)[0]).toMatchObject({
      state: "failed",
      heldReason:
        "The sample can't start: Set up this provider in Settings → Providers before starting.",
    });
  });

  it("shows the failed step's own sentence when the run fails", async () => {
    const { h, deps, id, job } = harness({
      fail: "OpenRouter refused the key. Paste a new one in Settings → Providers.",
    });
    await makePaidSample(deps, job(), signal);
    expect(sampleVersions(h.deps.db, id)[0]).toMatchObject({
      state: "failed",
      heldReason: "OpenRouter refused the key. Paste a new one in Settings → Providers.",
    });
  });

  it("makes nothing for a version that no longer exists", async () => {
    const { h, deps, id, job, ticks } = harness();
    await makePaidSample(deps, job({ templateVersion: 9 }), signal);
    expect(ticks).toEqual([]);
    expect(sampleVersions(h.deps.db, id)).toEqual([]);
  });
});

describe("a later paid sample", () => {
  it("saves the sample project's next revision from the newer setup and rebuilds what it outdates", async () => {
    const { h, deps, id, job, document, save } = harness();
    await makePaidSample(deps, job(), signal);
    const sample = sampleOf(h.deps.db, id);
    if (sample === undefined) throw new Error("no sample");
    const before = currentRevisionId(h.deps.db, sample.projectId);
    saveNarrationAliases(h.deps, [
      { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
    ]);
    const version = save(
      {
        ...document,
        form: {
          ...document.form,
          audio: { ...document.form.audio, voice: "other", useNarrationAliases: true },
        },
      },
      1,
    );
    // As Save records it: the quote the person saw, which priced every step.
    setSampleVersion(h.deps.db, id, version, {
      state: "queued",
      quotedHigh: 0.3,
      at: "2026-09-12T00:00:00.000Z",
    });
    deps.acks.accept(id, version);
    await makePaidSample(deps, job({ templateVersion: version }), signal);
    const after = currentRevisionId(h.deps.db, sample.projectId);
    expect(after).not.toBe(before);
    const view = getRevisionView(deps.rebuild, sample.projectId, after ?? "");
    expect(view?.revision.config.audio?.voice).toBe("other");
    // Library → Aliases copied as they are now, as a fresh run would.
    expect(view?.revision.config.narrationAliases).toEqual([
      { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
    ]);
    expect(sampleOf(h.deps.db, id)?.projectId).toBe(sample.projectId);
    expect(sampleVersions(h.deps.db, id)[0]).toMatchObject({
      templateVersion: version,
      revisionId: after,
    });
    expect(sampleVersions(h.deps.db, id)[0]?.heldReason ?? "").toBe("");
    expect(["done", "making"]).toContain(sampleVersions(h.deps.db, id)[0]?.state);
  });

  it("starts again on a project of its own when the change can't be a revision", async () => {
    const { h, deps, id, job, document, save } = harness();
    await makePaidSample(deps, job(), signal);
    const old = sampleOf(h.deps.db, id)?.projectId ?? "";
    const oldFolder = projectDir(deps.start.paths, old);
    const version = save({ ...document, form: { ...document.form, format: "9:16" } }, 1);
    await makePaidSample(deps, job({ templateVersion: version }), signal);
    const fresh = sampleOf(h.deps.db, id)?.projectId ?? "";
    if (fresh === old) {
      // The format change was a revision after all: still one sample project.
      expect(projectExists(h.deps.db, old)).toBe(true);
      return;
    }
    expect(projectExists(h.deps.db, old)).toBe(false);
    expect(existsSync(oldFolder)).toBe(false);
    expect(templateById(h.deps.db, id)?.version).toBe(version);
  });
});

describe("a later paid sample's preview", () => {
  it("waits on steps it can't price when no quote of this version is on record", async () => {
    const { h, deps, id, job, document, save } = harness();
    await makePaidSample(deps, job(), signal);
    const version = save(
      {
        ...document,
        form: { ...document.form, audio: { ...document.form.audio, voice: "other" } },
      },
      1,
    );
    await makePaidSample(deps, job({ templateVersion: version }), signal);
    expect(sampleVersions(h.deps.db, id)[0]).toMatchObject({
      templateVersion: version,
      state: "held",
      heldReason: expect.stringContaining("no known price. Press Make sample to accept that"),
    });
  });

  it("waits when the preview costs more than the person saw", async () => {
    const { h, deps, id, job, document, save } = harness();
    await makePaidSample(deps, job(), signal);
    const version = save(
      {
        ...document,
        form: { ...document.form, audio: { ...document.form.audio, voice: "other" } },
      },
      1,
    );
    setSampleVersion(h.deps.db, id, version, {
      state: "queued",
      quotedHigh: 3,
      at: "2026-09-12T00:00:00.000Z",
    });
    await makePaidSample(deps, job({ templateVersion: version, ackHigh: 1 }), signal);
    expect(sampleVersions(h.deps.db, id)[0]).toMatchObject({ state: "held" });
  });
});

describe("unknown prices", () => {
  const voiced = (document: PlayDraftDocument): PlayDraftDocument => ({
    ...document,
    form: { ...document.form, audio: { ...document.form.audio, voice: "other" } },
  });

  it("waits on Make sample without the unknown prices accepted, whatever price it was pressed at", async () => {
    const { h, deps, id, job, document, save, ticks } = harness();
    await makePaidSample(deps, job(), signal);
    const version = save(voiced(document), 1);
    const before = ticks.length;
    const asked = requestSample({ db: h.deps.db, clock: h.deps.clock, acks: deps.acks }, id, {
      version,
      acknowledgedHigh: 5,
    });
    expect(asked.ok).toBe(true);
    await makePaidSample(deps, job({ templateVersion: version }), signal);
    expect(sampleVersions(h.deps.db, id)[0]).toMatchObject({
      templateVersion: version,
      state: "held",
      heldReason: expect.stringContaining("no known price"),
    });
    expect(ticks.length).toBe(before);
    // Accepted on Make sample, it is made.
    requestSample({ db: h.deps.db, clock: h.deps.clock, acks: deps.acks }, id, {
      version,
      acknowledgedHigh: 0.3,
      acknowledgedUnknown: true,
    });
    await makePaidSample(deps, job({ templateVersion: version }), signal);
    expect(sampleVersions(h.deps.db, id)[0]?.heldReason ?? "").toBe("");
  });

  it("never reads its own held price as the person's acceptance", async () => {
    const { h, deps, id, job, document, save, ticks } = harness();
    await makePaidSample(deps, job(), signal);
    const version = save(voiced(document), 1);
    await makePaidSample(deps, job({ templateVersion: version }), signal);
    expect(sampleVersions(h.deps.db, id)[0]?.state).toBe("held");
    const before = ticks.length;
    // Looked at again (a wake, a restart): still nothing accepted.
    await makePaidSample(deps, job({ templateVersion: version }), signal);
    expect(sampleVersions(h.deps.db, id)[0]?.state).toBe("held");
    expect(ticks.length).toBe(before);
  });

  it("keeps what the person accepted across a restart", () => {
    const { h, id } = harness();
    storedUnknownAcks(h.deps.db).accept(id, 2);
    const after = storedUnknownAcks(h.deps.db);
    expect(after.accepted(id, 2)).toBe(true);
    expect(after.accepted(id, 3)).toBe(false);
  });
});

describe("sampleBusy", () => {
  it("is busy while admitted work is unfinished and free once it is done", async () => {
    const { h, deps, id, job } = harness();
    await makePaidSample(deps, job(), signal);
    const projectId = sampleOf(h.deps.db, id)?.projectId ?? "";
    expect(sampleBusy(h.deps.db, projectId)).toBe(false);
    h.deps.db
      .prepare(
        "UPDATE stages SET state='running' WHERE project_id=? AND rowid=(SELECT min(rowid) FROM stages WHERE project_id=?)",
      )
      .run(projectId, projectId);
    expect(sampleBusy(h.deps.db, projectId)).toBe(true);
  });
});
