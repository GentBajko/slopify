import { describe, expect, it } from "vitest";
import { fingerprint } from "../../kernel/runner/work.js";
import { planDependencies, type RetainedWork, type WorkRecipe } from "./dependencies.js";

const image: WorkRecipe = {
  key: "image:i1",
  stage: "images",
  kind: "provider",
  requestFingerprint: "same",
  fingerprint: "same",
  dependsOn: [],
  unresolved: false,
};
const retainedImage: RetainedWork = {
  key: image.key,
  requestFingerprint: "same",
  fingerprint: "same",
  available: true,
  inflight: false,
  pieceIds: ["piece1"],
};

it("keeps independent saved-prompt images while requiring review of provided audio", () => {
  const desired: WorkRecipe[] = [
    image,
    {
      key: "audio:provided",
      stage: "audio",
      kind: "provided",
      requestFingerprint: "new",
      fingerprint: "new",
      dependsOn: ["article:body"],
      unresolved: false,
    },
  ];
  const result = planDependencies(
    desired,
    desired.map((one) => ({
      key: one.key,
      requestFingerprint: "same",
      fingerprint: "same",
      available: true,
      inflight: false,
      pieceIds: [],
    })),
  );
  expect(result.map((one) => [one.key, one.disposition])).toEqual([
    ["image:i1", "reuse"],
    ["audio:provided", "review"],
  ]);
});

describe("retained work admission", () => {
  it.each([
    { available: true, inflight: false },
    { available: false, inflight: true },
  ])("reuses matching retained work in state %j", (state) => {
    expect(planDependencies([image], [{ ...retainedImage, ...state }])).toMatchObject([
      { key: image.key, disposition: "reuse", inflight: state.inflight, pieceIds: ["piece1"] },
    ]);
  });

  it("regenerates a missing asset when no matching request is in flight", () => {
    expect(planDependencies([image], [{ ...retainedImage, available: false }])).toMatchObject([
      { disposition: "generate", inflight: false, pieceIds: [] },
    ]);
  });

  it("does not reuse another work key or an older request", () => {
    expect(
      planDependencies(
        [image],
        [
          { ...retainedImage, key: "image:i2" },
          { ...retainedImage, fingerprint: "previous" },
        ],
      ),
    ).toMatchObject([{ disposition: "generate", pieceIds: [] }]);
  });

  it("does not reuse a regenerated request despite the same request fingerprint", () => {
    const requestFingerprint = fingerprint({ text: "Hello.", voice: "one" });
    expect(
      planDependencies(
        [{ ...image, requestFingerprint, fingerprint: fingerprint([requestFingerprint, "new"]) }],
        [
          {
            ...retainedImage,
            requestFingerprint,
            fingerprint: fingerprint([requestFingerprint, null]),
          },
        ],
      ),
    ).toMatchObject([{ disposition: "generate" }]);
  });

  it("blocks unresolved inputs even when a retained output is available", () => {
    expect(planDependencies([{ ...image, unresolved: true }], [retainedImage])).toMatchObject([
      { disposition: "blocked" },
    ]);
  });

  it("reuses provided work with matching inputs", () => {
    expect(planDependencies([{ ...image, kind: "provided" }], [retainedImage])).toMatchObject([
      { disposition: "reuse" },
    ]);
  });

  it("blocks unavailable provided content even when its changed inputs would need review", () => {
    expect(
      planDependencies(
        [{ ...image, kind: "provided", unresolved: true }],
        [{ ...retainedImage, fingerprint: "old", available: false }],
      ),
    ).toMatchObject([{ disposition: "blocked" }]);
    expect(planDependencies([{ ...image, kind: "provided" }], [])).toMatchObject([
      { disposition: "blocked" },
    ]);
  });

  it("rebuilds local export inputs without imposing stage-wide invalidation", () => {
    const exportRecipe: WorkRecipe = {
      ...image,
      key: "export:video",
      stage: "video",
      kind: "local",
      dependsOn: [image.key],
    };
    const desired = Object.freeze([exportRecipe, image]);
    const retained = Object.freeze([retainedImage]);
    expect(planDependencies(desired, retained)).toMatchObject([
      { key: "export:video", disposition: "local", dependsOn: [image.key] },
      { key: image.key, disposition: "reuse" },
    ]);
    expect(desired).toEqual([exportRecipe, image]);
    expect(retained).toEqual([retainedImage]);
  });
});
