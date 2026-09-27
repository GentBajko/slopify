import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { insertPrompt, listPrompts, replacePrompt } from "../library/repo.js";
import { templateById, templateSummaries } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { insertVoice, listVoices } from "../settings/repo.js";
import { installPack, type PackInstallDeps } from "./install.js";
import { starterPacks } from "./packs.js";
import { packTemplate } from "./template.js";

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const done of cleanup.splice(0)) done();
});

function fixture(): PackInstallDeps {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-packs-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(":memory:");
  const clock = fixedClock("2026-09-27T10:00:00.000Z");
  migrate(db, clock);
  let next = 0;
  cleanup.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  return {
    db,
    paths,
    clock,
    ids: { next: () => `id${String(++next).padStart(4, "0")}` },
    log: { write: () => undefined },
    uuid: randomUUID,
  };
}

describe("installPack", () => {
  it("adds every pack's prompts, voice and template once, however often it is pressed", () => {
    const deps = fixture();
    for (const pack of starterPacks) {
      const first = installPack(deps, pack.id);
      expect(first).toMatchObject({ ok: true, value: { added: true } });
      const again = installPack(deps, pack.id);
      expect(again).toMatchObject({ ok: true, value: { added: false } });
      if (!first.ok || !again.ok) throw new Error("not installed");
      expect(again.value).toEqual({ ...first.value, added: false });
      const template = templateById(deps.db, first.value.templateId ?? "");
      expect(template?.name).toBe(`${pack.name} starter`);
      expect(template?.document.form.articlePrompt).toBe(first.value.prompts.article);
      expect(template?.document.form.audio.voice).toBe(pack.voice.voiceId);
    }
    expect(listPrompts(deps.db)).toHaveLength(starterPacks.length * 6);
    expect(listVoices(deps.db)).toHaveLength(starterPacks.length);
    expect(templateSummaries(deps.db)).toHaveLength(starterPacks.length);
  });

  it("never overwrites the user's prompt, voice or template of the same name", () => {
    const deps = fixture();
    const pack = starterPacks[0];
    if (pack === undefined) throw new Error("no packs");
    const article = pack.prompts.find((prompt) => prompt.key === "article");
    if (article === undefined) throw new Error("no article prompt");
    insertPrompt(deps.db, {
      id: "mine",
      kind: "article",
      name: article.name,
      body: "My own words about {{topic}}.",
      slots: ["topic"],
      updatedAt: "2026-09-01",
    });
    insertVoice(deps.db, {
      id: "my-voice",
      provider: pack.voice.provider,
      name: "My favourite",
      voiceId: pack.voice.voiceId,
    });
    const mine = createTemplate(deps, {
      id: randomUUID(),
      name: `${pack.name} starter`,
      document: packTemplate(pack, {}, "sage"),
    });
    if (!mine.ok) throw new Error("template refused");
    const first = installPack(deps, pack.id);
    if (!first.ok) throw new Error("not installed");
    expect(first.value.prompts.article).toBe(`${article.name} (2)`);
    expect(listPrompts(deps.db).find((row) => row.id === "mine")?.body).toBe(
      "My own words about {{topic}}.",
    );
    expect(listVoices(deps.db)).toEqual([
      { id: "my-voice", provider: pack.voice.provider, name: "My favourite", voiceId: "sage" },
    ]);
    expect(templateSummaries(deps.db).map((row) => [row.id === mine.value.id, row.name])).toEqual([
      [true, `${pack.name} starter`],
      [false, `${pack.name} starter (2)`],
    ]);
  });

  it("keeps an installed prompt the user has since edited, and restores one they deleted", () => {
    const deps = fixture();
    const first = installPack(deps, "science");
    if (!first.ok) throw new Error("not installed");
    const edited = listPrompts(deps.db).find((row) => row.name === first.value.prompts.article);
    if (edited === undefined) throw new Error("missing");
    replacePrompt(deps.db, { ...edited, body: "Edited {{topic}}." });
    const thumbnail = listPrompts(deps.db).find(
      (row) => row.name === first.value.prompts.thumbnail,
    );
    deps.db.prepare("DELETE FROM prompts WHERE id=?").run(thumbnail?.id ?? "");
    const again = installPack(deps, "science");
    expect(again).toMatchObject({ ok: true, value: { added: true } });
    expect(listPrompts(deps.db).find((row) => row.id === edited.id)?.body).toBe(
      "Edited {{topic}}.",
    );
    expect(listPrompts(deps.db).some((row) => row.name === first.value.prompts.thumbnail)).toBe(
      true,
    );
  });

  it("uses the pack's own prompt when a prompt of that name already has its exact text", () => {
    const deps = fixture();
    installPack(deps, "history");
    deps.db.prepare("DELETE FROM settings").run();
    const again = installPack(deps, "history", { template: false });
    expect(again).toMatchObject({ ok: true, value: { added: false } });
    expect(listPrompts(deps.db)).toHaveLength(6);
  });

  it("refuses a pack it does not know", () => {
    expect(installPack(fixture(), "cooking")).toEqual({ ok: false, reason: "not-found" });
  });
});
