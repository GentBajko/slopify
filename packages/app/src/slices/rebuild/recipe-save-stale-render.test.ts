import { expect, it } from "vitest";
import { readyView } from "./recipe-fixture.js";
import { planRevision } from "./recipe-save.js";

// A version from an older Slopify that never recorded a render's fingerprint: its render was
// made from what the step asked for then. Saving it unchanged must not take the old file for
// the render the step asks for now.
it("leaves a render made for another recipe outdated when the version never recorded it", () => {
  const view = readyView();
  const key = "export:video";
  expect(view.revision.fingerprints[key]).toBeDefined();
  const { [key]: _forgotten, ...fingerprints } = view.revision.fingerprints;
  const base = {
    ...view,
    revision: { ...view.revision, fingerprints },
    outputs: view.outputs.map((row) =>
      row.workKey === key ? { ...row, fingerprint: "made-from-older-audio" } : row,
    ),
  };
  const saved = planRevision(base, {
    config: base.revision.config,
    content: base.revision.content,
  });
  if (!saved.ok) throw new Error("Save rejected.");
  const render = saved.manifest.outputs.find((row) => row.workKey === key);
  expect(render?.state).toBe("outdated");
  expect(render?.fingerprint).toBe("made-from-older-audio");
  // Every other output stays as it was.
  expect(
    saved.manifest.outputs.filter((row) => row.workKey !== key && row.state !== "ready"),
  ).toEqual([]);
});

it("keeps a render the version recorded, whatever fingerprint scheme its file carries", () => {
  const view = readyView();
  const key = "export:video";
  const base = {
    ...view,
    outputs: view.outputs.map((row) =>
      row.workKey === key ? { ...row, fingerprint: "older-scheme" } : row,
    ),
  };
  const saved = planRevision(base, {
    config: base.revision.config,
    content: base.revision.content,
  });
  if (!saved.ok) throw new Error("Save rejected.");
  expect(saved.manifest.outputs.find((row) => row.workKey === key)?.state).toBe("ready");
});
