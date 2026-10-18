import { expect, it } from "vitest";
import { assetPath, assetPathOrUndefined } from "./mutation-assets.js";
import { revisionFixture } from "./revision.fake.js";

it("reads a project's asset path, tolerantly or strictly", () => {
  const h = revisionFixture();
  try {
    h.deps.db
      .prepare(
        "INSERT INTO project_assets(id,project_id,path,bytes,created_at) VALUES ('a1',?,'images/a.png',3,'now')",
      )
      .run(h.projectId);
    expect(assetPathOrUndefined(h.deps, h.projectId, "a1")).toBe("images/a.png");
    expect(assetPath(h.deps, h.projectId, "a1")).toBe("images/a.png");
    expect(assetPathOrUndefined(h.deps, h.projectId, "missing")).toBeUndefined();
    expect(assetPathOrUndefined(h.deps, "other-project", "a1")).toBeUndefined();
    expect(() => assetPath(h.deps, h.projectId, "missing")).toThrow();
  } finally {
    h.close();
  }
});
