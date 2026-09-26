import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import type { AppDeps } from "../src/edge/http/app.js";
import { storageRoutes } from "../src/edge/http/storage.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import { createDocumentTheme } from "../src/slices/document/library.js";
import { builtInTheme } from "../src/slices/document/theme.js";
import { insertEntry, insertPrompt, listEntries, listPrompts } from "../src/slices/library/repo.js";
import { draftFixture } from "../src/slices/play-drafts/draft.fake.js";
import { createRebuildDeps } from "../src/slices/rebuild/service.fake.js";
import { previewRebuild } from "../src/slices/rebuild/service.js";
import type { RevisionDeps } from "../src/slices/revisions/model.js";
import { scheduleRows } from "../src/slices/schedules/repo.js";
import { upsertKey, writeSetting } from "../src/slices/settings/repo.js";
import type { BackupImportSummary } from "../src/slices/storage/backup-import.js";
import { outputPath } from "../src/slices/storage/layout.js";
import {
  allTelemetryEvents,
  insertMachine,
  insertTelemetryEvent,
} from "../src/slices/telemetry/repo.js";
import { usageOf } from "../src/slices/telemetry/usage.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

const secret = "sk-live-never-in-a-backup-0123456789";
const machineId = "5b0c1f9e-0d4e-4d7a-9a55-3b1f2f1e7c11";

function routes(deps: RevisionDeps) {
  return new Hono().route(
    "/api/storage",
    storageRoutes({
      ...deps,
      version: "2.2.0-test",
      runner: { hasInflight: () => false },
    } as unknown as AppDeps),
  );
}

// An install with one of everything: a made project (article and its PDF), a prompt, an
// intro, a template, a schedule, a document theme, usage, settings, a provider key and a
// telemetry id. Exported over HTTP and imported into an empty data folder, everything but
// the key and the id arrives, and the project opens with its outputs current.
it("carries a whole install into an empty one, without keys or the machine id", async () => {
  const h = await composedFixture({
    llm: () =>
      fakeLlm({
        deltas: [
          "# Rope\n\n## Knots\n\nRope has held knots for sailors, climbers and builders for as long as there has been rope.\n",
        ],
      }),
  });
  const target = layout(mkdtempSync(join(tmpdir(), "slopify-backup-target-")));
  ensureDirs(target, { mode: 0o700 });
  const targetDb = openDb(target.db);
  const drafts = draftFixture();
  try {
    h.setCatalogue({
      ...h.deps.catalogue.read(),
      providers: { ...h.deps.catalogue.read().providers, openrouter: { maxConcurrent: 1 } },
      llm: [
        {
          provider: "openrouter",
          id: "text",
          name: "Text",
          enabled: true,
          deprecated: false,
          source: "https://example.test",
          keywords: [],
          pricing: {},
          llm: { webSearch: true },
        },
      ],
    });
    const base = current(h.deps, h.projectId);
    await save(h.deps, h.projectId, {
      config: {
        ...base.revision.config,
        sources: {
          ...base.revision.config.sources,
          article: "generate",
          images: "off",
          video: "off",
          document: "generate",
        },
        document: { theme: "plain" },
        llm: { provider: "openrouter", model: "text" },
        provided: {},
        rendered: { article: "Write" },
      },
      content: {
        ...base.revision.content,
        articleEdited: false,
        imageOrder: [],
        imageDefinitions: {},
      },
    });
    await start(h.deps, h.projectId, ["article:body", "document:pdf"]);
    await h.runner.settled();
    const madePdf = current(h.deps, h.projectId).outputs.find(
      (row) => row.selected && row.output.role === "document_pdf",
    );
    expect(madePdf).toMatchObject({ state: "ready", available: true });

    const db = h.deps.db;
    const now = h.deps.clock.now().toISOString();
    insertPrompt(db, {
      id: "prompt-1",
      kind: "article",
      name: "Deep dive",
      body: "Write about {{Topic}}.",
      slots: ["Topic"],
      updatedAt: now,
    });
    insertEntry(db, {
      id: "entry-1",
      category: "intro",
      mode: "text",
      name: "Hello",
      body: "Welcome back.",
      slots: [],
      updatedAt: now,
    });
    const templateId = randomUUID();
    db.prepare(
      "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES (?,2,'h',?)",
    ).run(templateId, now);
    for (const version of [1, 2])
      db.prepare(
        "INSERT INTO project_template_revisions(template_id,version,name,document_json,created_at) VALUES (?,?,?,?,?)",
      ).run(templateId, version, `Weekly v${version}`, JSON.stringify(drafts.document), now);
    const scheduleId = randomUUID();
    db.prepare(
      `INSERT INTO schedules(id,name,template_id,template_version,cadence_json,timezone,missed_policy,
        overlap_policy,spend_limit_cents,items_json,topic_keyword,values_json,status,version,creation_hash,
        next_run_at,created_at,updated_at)
       VALUES (?,?,?,2,?,?,'skip','skip',NULL,?,?,?,'active',1,'h',?,?,?)`,
    ).run(
      scheduleId,
      "Every morning",
      templateId,
      JSON.stringify({ kind: "daily", time: "07:00" }),
      "Europe/London",
      JSON.stringify([{ title: "Knots", values: {} }]),
      "Topic",
      JSON.stringify({ Words: "900" }),
      "2026-09-11T07:00:00.000Z",
      now,
      now,
    );
    db.prepare(
      "INSERT INTO schedule_runs(id,schedule_id,scheduled_for,status,project_ids_json,started_at,ended_at) VALUES (?,?,?,'succeeded',?,?,?)",
    ).run(randomUUID(), scheduleId, now, JSON.stringify([h.projectId]), now, now);
    const theme = createDocumentTheme(
      { db, ids: { next: randomUUID }, clock: h.deps.clock },
      { name: "Parchment", values: builtInTheme("plain") },
    );
    expect(theme.ok).toBe(true);
    writeSetting(db, "appearance", JSON.stringify("dark"));
    upsertKey(db, "openrouter", secret, now);
    insertMachine(db, { machineId, noticeSeenAt: now, appVersion: "2.2.0" });
    for (const [id, type, payload] of [
      ["ev-install", "install", { appVersion: "2.2.0" }],
      ["ev-project", "project.created", { appVersion: "2.2.0" }],
      [
        "ev-article",
        "stage.completed",
        {
          appVersion: "2.2.0",
          stage: "article",
          provider: "openrouter",
          tokensIn: 120,
          tokensOut: 800,
        },
      ],
      ["ev-video", "stage.completed", { appVersion: "2.2.0", stage: "video" }],
    ] as const)
      insertTelemetryEvent(db, { id, type, payload, createdAt: now, deliveredAt: null });
    const sourceUsage = usageOf({
      events: allTelemetryEvents(db),
      machineId: null,
      appVersion: "",
    });

    const summary = await routes(h.deps).request("/api/storage/export/summary");
    expect(await summary.json()).toMatchObject({ ready: true, projects: 1 });
    const exported = await routes(h.deps).request("/api/storage/export");
    expect(exported.status).toBe(200);
    expect(exported.headers.get("content-type")).toBe("application/x-tar");
    const archive = new Uint8Array(await exported.arrayBuffer());
    expect(archive.byteLength).toBe(Number(exported.headers.get("content-length")));
    const text = Buffer.from(archive).toString("latin1");
    expect(text).not.toContain(secret);
    expect(text).not.toContain(machineId);
    expect(text).not.toContain("provider_keys");
    expect(text).not.toContain("ev-install");

    migrate(targetDb, h.deps.clock);
    const targetDeps: RevisionDeps = { ...h.deps, db: targetDb, paths: target };
    const put = () =>
      routes(targetDeps).request("/api/storage/import", {
        method: "PUT",
        headers: { "content-type": "application/x-tar" },
        body: archive,
      });
    const response = await put();
    const imported = (await response.json()) as BackupImportSummary;
    expect(response.status, JSON.stringify(imported)).toBe(200);
    expect(imported.projects).toEqual({
      imported: [{ id: h.projectId, title: expect.any(String) }],
      skipped: [],
    });
    expect(imported.schedules).toMatchObject({ added: 1, paused: 1 });
    expect(imported.usage).toEqual({ events: 3, alreadyImported: false });

    // Library, settings and usage.
    expect(listPrompts(targetDb).map((prompt) => prompt.name)).toContain("Deep dive");
    expect(listEntries(targetDb).map((entry) => entry.name)).toEqual(["Hello"]);
    expect(
      targetDb
        .prepare("SELECT version,name FROM project_template_revisions ORDER BY version")
        .all(),
    ).toEqual([
      { version: 1, name: "Weekly v1" },
      { version: 2, name: "Weekly v2" },
    ]);
    expect(scheduleRows(targetDb)).toMatchObject([
      { id: scheduleId, status: "paused", items: [{ title: "Knots" }], topicKeyword: "Topic" },
    ]);
    expect(targetDb.prepare("SELECT count(*) AS n FROM schedule_runs").get()).toEqual({ n: 1 });
    expect(targetDb.prepare("SELECT name FROM document_themes").all()).toEqual([
      { name: "Parchment" },
    ]);
    expect(targetDb.prepare("SELECT value FROM settings WHERE key='appearance'").get()).toEqual({
      value: '"dark"',
    });
    expect(
      usageOf({ events: allTelemetryEvents(targetDb), machineId: null, appVersion: "" }).counters,
    ).toEqual(sourceUsage.counters);
    expect(
      targetDb
        .prepare("SELECT count(*) AS n FROM telemetry_events WHERE delivered_at IS NULL")
        .get(),
    ).toEqual({ n: 0 });

    // No secrets and no identity.
    expect(targetDb.prepare("SELECT count(*) AS n FROM provider_keys").get()).toEqual({ n: 0 });
    expect(targetDb.prepare("SELECT count(*) AS n FROM machine").get()).toEqual({ n: 0 });

    // The project opens with its files, current, with nothing to rebuild.
    const view = current(targetDeps, h.projectId);
    const pdf = view.outputs.find((row) => row.selected && row.output.role === "document_pdf");
    expect(pdf).toMatchObject({ state: "ready", available: true });
    expect(
      readFileSync(outputPath(target, h.projectId, pdf?.output.path ?? ""))
        .subarray(0, 5)
        .toString(),
    ).toBe("%PDF-");
    const rebuild = createRebuildDeps(targetDeps, h.deps.catalogue.read());
    const preview = await previewRebuild(rebuild.deps, {
      projectId: h.projectId,
      baseRevisionId: view.revision.id,
      request: { kind: "allAffected" },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(
      preview.value.work
        .filter((row) => row.disposition !== "reuse")
        .map((row) => row.key)
        .filter((key) => key === "document:pdf" || key === "article:body"),
    ).toEqual([]);

    // The same backup again adds nothing: the project is already here, usage was counted.
    const again = (await (await put()).json()) as BackupImportSummary;
    expect(again.projects.imported).toEqual([]);
    expect(again.projects.skipped).toEqual([
      { id: h.projectId, title: expect.any(String), reason: "It is already in this install." },
    ]);
    expect(again.usage).toEqual({ events: 0, alreadyImported: true });
    expect(again.prompts).toMatchObject({ added: 0, skipped: expect.any(Number) });
    expect(targetDb.prepare("SELECT count(*) AS n FROM schedules").get()).toEqual({ n: 1 });
    expect(
      usageOf({ events: allTelemetryEvents(targetDb), machineId: null, appVersion: "" }).counters,
    ).toEqual(sourceUsage.counters);
  } finally {
    await h.runner.settled();
    h.audioPreviews.close();
    h.close();
    drafts.close();
    targetDb.close();
    rmSync(target.dataDir, { recursive: true, force: true });
  }
});
