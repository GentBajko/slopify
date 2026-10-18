import { existsSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { stagingPath } from "../storage/layout.js";
import { designHarness, type Harness, pngOf } from "./designs.fake.js";
import { poster } from "./document.fake.js";
import {
  createDesign,
  getDesign,
  listDesignViews,
  setDesignHead,
  stepPicture,
  updateDesignRecord,
} from "./service.js";

let h: Harness;
afterEach(() => h.cleanup());

const base = { id: "d1", mutationId: "mutation-0001", kind: "edit", name: "Me on stage" } as const;

describe("making a design", () => {
  it("starts an edit from an upload: the picture is stored and the staging copy let go", () => {
    h = designHarness();
    const staged = h.stage(pngOf(1200, 1600));
    const made = createDesign(h.deps, { ...base, stagedFileId: staged });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect(made.value.steps).toEqual([
      expect.objectContaining({
        n: 1,
        kind: "upload",
        state: "ready",
        width: 1200,
        height: 1600,
        parentId: null,
      }),
    ]);
    expect(made.value.headStepId).toBe(made.value.steps[0]?.id);
    expect(made.value.channelId).toBe("00000000-0000-4000-8000-000000000001");
    expect(stepPicture(h.db, "d1", made.value.steps[0]?.id ?? "")?.bytes).toEqual(
      pngOf(1200, 1600),
    );
    expect(existsSync(stagingPath(h.paths, staged))).toBe(false);
    expect(h.db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
    expect(h.events).toEqual([{ kind: "design.changed", designId: "d1" }]);
  });

  it("refuses a file that is not a picture, one too large, one still uploading or gone", () => {
    h = designHarness();
    const refusal = (input: object) => {
      const made = createDesign(h.deps, { ...base, ...input });
      return made.ok ? "made" : made.message;
    };
    expect(refusal({ stagedFileId: h.stage(new TextEncoder().encode("GIF89a....")) })).toBe(
      "This file is not a PNG or JPEG picture Slopify can read. Upload a PNG or JPEG file.",
    );
    expect(refusal({ stagedFileId: h.stage(new Uint8Array(10 * 1024 * 1024 + 1)) })).toBe(
      "This picture is larger than 10 MB. Save it smaller (for example as a JPEG) and upload it again.",
    );
    expect(refusal({ stagedFileId: h.stage(pngOf(10, 10), "copying") })).toBe(
      "The picture is still uploading. Wait for it to finish, then try again.",
    );
    expect(refusal({ stagedFileId: "nope" })).toBe(
      "The uploaded picture is gone. Upload it again.",
    );
    expect(refusal({})).toBe(
      "An edit starts from a picture. Upload a PNG or JPEG, then press Edit.",
    );
    expect(refusal({ fromStepSha: "a".repeat(64) })).toBe(
      "That picture is no longer kept. Choose another version, or upload the picture again.",
    );
    expect(refusal({ kind: "design" })).toBe(
      "A designed piece needs its settings. Choose its picture, text and formats, then press Make.",
    );
    expect(refusal({ channelId: "gone", stagedFileId: h.stage(pngOf(10, 10)) })).toBe(
      "That channel no longer exists. Choose another channel, then press Make again.",
    );
    expect(refusal({ projectId: "gone", stagedFileId: h.stage(pngOf(10, 10)) })).toBe(
      "That project no longer exists or is in the trash. Choose another project, or leave it out.",
    );
    expect(refusal({ name: "" })).toMatch(/^The design can't be made: /);
    expect(h.db.prepare("SELECT count(*) AS n FROM designs").get()).toEqual({ n: 0 });
  });

  it("makes a blank designed piece, and one from another design's version", () => {
    h = designHarness();
    const blank = createDesign(h.deps, { ...base, kind: "design", document: poster() });
    expect(blank.ok && blank.value.steps).toEqual([]);
    const first = createDesign(h.deps, {
      ...base,
      id: "d2",
      mutationId: "mutation-0002",
      stagedFileId: h.stage(pngOf(30, 20)),
    });
    const sha = first.ok ? (first.value.steps[0]?.sha256 ?? "") : "";
    const copy = createDesign(h.deps, {
      ...base,
      id: "d3",
      mutationId: "mutation-0003",
      fromStepSha: sha,
    });
    expect(
      copy.ok && copy.value.steps.map((step) => [step.sha256, step.width, step.height]),
    ).toEqual([[sha, 30, 20]]);
  });

  it("answers a repeated request with the same design, and refuses its id reused for another", () => {
    h = designHarness();
    const input = { ...base, kind: "design", document: poster() };
    const first = createDesign(h.deps, input);
    expect(createDesign(h.deps, input)).toEqual(first);
    const reused = createDesign(h.deps, { ...input, name: "Other" });
    expect(reused.ok ? "made" : reused.reason).toBe("mutation-reused");
    const sameId = createDesign(h.deps, { ...input, mutationId: "mutation-0099" });
    expect(sameId.ok ? "made" : sameId.reason).toBe("mutation-reused");
    expect(listDesignViews(h.db)).toHaveLength(1);
  });

  it("leaves hidden template samples and deleted designs out of every list", () => {
    h = designHarness();
    createDesign(h.deps, { ...base, kind: "design", document: poster() });
    createDesign(h.deps, {
      ...base,
      id: "d2",
      mutationId: "mutation-0002",
      kind: "design",
      document: poster(),
    });
    h.db.exec("UPDATE designs SET sample_of='t1' WHERE id='d2'");
    expect(listDesignViews(h.db).map((design) => design.id)).toEqual(["d1"]);
    h.db.exec("UPDATE designs SET deleted_at='x' WHERE id='d1'");
    expect(listDesignViews(h.db)).toEqual([]);
    expect(getDesign(h.deps, "d1").ok).toBe(false);
  });
});

describe("changing a design", () => {
  function made() {
    h = designHarness();
    const result = createDesign(h.deps, { ...base, stagedFileId: h.stage(pngOf(100, 100)) });
    if (!result.ok) throw new Error(result.message);
    return result.value;
  }

  it("renames, links to a project and turns an edit into a designed piece", () => {
    const design = made();
    h.db.exec("INSERT INTO projects VALUES ('p1','One','16:9','{}','a','a')");
    h.clock.advance(1000);
    const changed = updateDesignRecord(h.deps, "d1", {
      baseUpdatedAt: design.updatedAt,
      name: "Poster",
      projectId: "p1",
      document: poster(),
      values: { Event: "Late Set" },
    });
    expect(
      changed.ok && [
        changed.value.name,
        changed.value.projectId,
        changed.value.kind,
        changed.value.values,
      ],
    ).toEqual(["Poster", "p1", "design", { Event: "Late Set" }]);
    expect(listDesignViews(h.db, "p1").map((one) => one.id)).toEqual(["d1"]);
    const unlinked = updateDesignRecord(h.deps, "d1", {
      baseUpdatedAt: changed.ok ? changed.value.updatedAt : "",
      projectId: null,
    });
    expect(unlinked.ok && unlinked.value.projectId).toBeNull();
  });

  it("refuses a change made on an older copy, handing back the current one", () => {
    const design = made();
    h.clock.advance(1000);
    updateDesignRecord(h.deps, "d1", { baseUpdatedAt: design.updatedAt, name: "First" });
    const stale = updateDesignRecord(h.deps, "d1", {
      baseUpdatedAt: design.updatedAt,
      name: "Second",
    });
    expect(
      stale.ok ? "saved" : [stale.reason, stale.message, (stale.current as { name: string }).name],
    ).toEqual([
      "changed",
      "This design changed in another tab or by an agent. Reload it to see the change, then make yours again.",
      "First",
    ]);
  });

  it("refuses an unknown design, project or document", () => {
    const design = made();
    const reason = (id: string, input: object) => {
      const result = updateDesignRecord(h.deps, id, { baseUpdatedAt: design.updatedAt, ...input });
      return result.ok ? "saved" : result.reason;
    };
    expect(reason("gone", { name: "x" })).toBe("not-found");
    expect(reason("d1", { projectId: "gone" })).toBe("project-not-found");
    expect(reason("d1", { document: { version: 2 } })).toBe("invalid");
  });

  it("continues from a version that has its picture, and only one of this design's", () => {
    const design = made();
    const step = design.steps[0]?.id ?? "";
    expect(setDesignHead(h.deps, "d1", { stepId: step }).ok).toBe(true);
    h.db.exec("UPDATE design_steps SET state='failed', sha256=NULL");
    const failed = setDesignHead(h.deps, "d1", { stepId: step });
    expect(failed.ok ? "moved" : failed.message).toBe(
      "That version has no picture yet. Wait for it to finish, or press Try again on it.",
    );
    const other = setDesignHead(h.deps, "d1", { stepId: "nope" });
    expect(other.ok ? "moved" : other.reason).toBe("not-found");
    expect(stepPicture(h.db, "d1", "nope")).toBeUndefined();
  });
});
