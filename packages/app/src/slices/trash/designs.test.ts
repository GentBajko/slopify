import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { designHarness, type Harness, pngOf } from "../designs/designs.fake.js";
import { poster } from "../designs/document.fake.js";
import { rendersDir } from "../designs/render.js";
import { createDesign } from "../designs/service.js";
import { trashDesign, trashDesignTemplate } from "./designs.js";
import { deleteNow, listTrash, purgeExpired, restoreItem } from "./service.js";

let h: Harness;
afterEach(() => h.cleanup());

function setup() {
  h = designHarness();
  const made = createDesign(h.deps, {
    id: "d1",
    mutationId: "mutation-0001",
    kind: "edit",
    name: "Me on stage",
    stagedFileId: h.stage(pngOf(10, 10)),
  });
  if (!made.ok) throw new Error(made.message);
  const drawn = join(rendersDir(h.paths), "d1");
  mkdirSync(drawn, { recursive: true });
  writeFileSync(join(drawn, "a4-x.png"), "png");
  const deps = { db: h.db, clock: h.deps.clock, paths: h.paths, log: h.deps.log };
  return { deps, drawn };
}

function template(deps: ReturnType<typeof setup>["deps"]) {
  deps.db.exec("INSERT INTO design_templates (id,head_version,created_at) VALUES ('t1',1,'a')");
  deps.db
    .prepare(
      "INSERT INTO design_template_revisions (template_id,version,name,document_json,created_at) VALUES ('t1',1,'Gig poster',?,'a')",
    )
    .run(JSON.stringify(poster()));
  createDesign(h.deps, {
    id: "s1",
    mutationId: "mutation-0002",
    kind: "design",
    name: "Sample",
    document: poster(),
  });
  deps.db.exec("UPDATE designs SET sample_of='t1' WHERE id='s1'");
  const sample = join(rendersDir(h.paths), "s1");
  mkdirSync(sample, { recursive: true });
  return sample;
}

describe("designs in the trash", () => {
  it("lists a deleted design and puts it back as it was", () => {
    const { deps } = setup();
    expect(trashDesign(deps, "d1")).toEqual({ ok: true, value: null });
    expect(trashDesign(deps, "d1").ok).toBe(false);
    expect(
      listTrash(deps).map((item) => [item.kind, item.id, item.name, item.detail, item.daysLeft]),
    ).toEqual([["design", "d1", "Me on stage", "edit", 30]]);
    expect(restoreItem(deps, "design", "d1")).toEqual({
      ok: true,
      value: { kind: "design", id: "d1", name: "Me on stage", renamedFrom: null },
    });
    expect(deps.db.prepare("SELECT deleted_at FROM designs WHERE id='d1'").get()).toEqual({
      deleted_at: null,
    });
    expect(restoreItem(deps, "design", "d1").ok).toBe(false);
  });

  it("removes a design for good with its versions and drawn files, keeping the pictures", () => {
    const { deps, drawn } = setup();
    expect(deleteNow(deps, "design", "d1").ok).toBe(false);
    trashDesign(deps, "d1");
    expect(deleteNow(deps, "design", "d1")).toEqual({ ok: true, value: null });
    expect(deps.db.prepare("SELECT count(*) AS n FROM design_steps").get()).toEqual({ n: 0 });
    expect(deps.db.prepare("SELECT count(*) AS n FROM image_blobs").get()).toEqual({ n: 1 });
    expect(existsSync(drawn)).toBe(false);
  });

  it("purges a design deleted 30 days ago, files and all", () => {
    const { deps, drawn } = setup();
    trashDesign(deps, "d1");
    h.clock.advance(31 * 24 * 60 * 60_000);
    expect(purgeExpired(deps)).toEqual({ removed: 1, kept: 0 });
    expect(existsSync(drawn)).toBe(false);
  });

  it("keeps a template's hidden sample out of the trash, and removes it with the template", () => {
    const { deps } = setup();
    const sample = template(deps);
    expect(trashDesign(deps, "s1").ok).toBe(false);
    expect(trashDesignTemplate(deps, "t1").ok).toBe(true);
    expect(listTrash(deps).map((item) => [item.kind, item.name])).toEqual([
      ["design-template", "Gig poster"],
    ]);
    expect(restoreItem(deps, "design-template", "t1").ok).toBe(true);
    trashDesignTemplate(deps, "t1");
    expect(deleteNow(deps, "design-template", "t1")).toEqual({ ok: true, value: null });
    expect(deps.db.prepare("SELECT id FROM designs").all()).toEqual([{ id: "d1" }]);
    expect(existsSync(sample)).toBe(false);
    expect(deleteNow(deps, "design-template", "t1").ok).toBe(false);
  });
});
