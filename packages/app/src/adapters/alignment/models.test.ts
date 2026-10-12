import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { englishSubtitleModels } from "../../kernel/ports/subtitles.js";
import { alignmentModel, englishModels } from "./cache.js";
import { modelFor } from "./index.js";
import { multilingualModel } from "./multilingual.js";

const revision = "a19f851b3d42865797e410752b4c570c871e4825";
const repo = `https://huggingface.co/Xenova/wav2vec2-base-960h/resolve/${revision}/onnx`;

describe("the English subtitle timing models", () => {
  it("offers fp32, fp16 and int8 of the same pinned conversion", () => {
    expect(englishSubtitleModels).toEqual(["fp32", "fp16", "int8"]);
    expect(englishModels.fp32).toMatchObject({
      url: `${repo}/model.onnx`,
      bytes: 377_887_594,
      sha256: "e46614273f03ff4b87923a965e417fa72004825522cb007c9c25633b8475490d",
    });
    expect(englishModels.fp16).toMatchObject({
      url: `${repo}/model_fp16.onnx`,
      bytes: 189_192_204,
      sha256: "378348ee38b739cc77e77e3fb8502f0f40ed53da0dbf7401b24c25c8fafe03de",
    });
    // The model every install used before the choice: same file, same name in the cache, so an
    // install that switches back finds it already there.
    expect(englishModels.int8).toEqual({
      filename: "wav2vec2-base-960h-cd5040c1.onnx",
      url: `${repo}/model_quantized.onnx`,
      bytes: 95_286_046,
      sha256: "cd5040c147381580ed73258143dd8e0c28e800a09e74ee42ee2b3e8cb4d760a3",
    });
  });

  it("keeps each model under its own name in the cache, so they can sit side by side", () => {
    const names = [...Object.values(englishModels), multilingualModel].map(
      (model) => model.filename,
    );
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives the bigger downloads time to finish on a slow line", () => {
    // 378 MB in 20 minutes is about 2.5 Mbit/s.
    expect(englishModels.fp32.timeoutMs).toBeGreaterThanOrEqual(1_200_000);
    expect(englishModels.fp16.timeoutMs).toBeGreaterThanOrEqual(600_000);
  });

  it("defaults to the most accurate model", () => {
    expect(alignmentModel).toBe(englishModels.fp32);
  });

  it("times English with the chosen model and every other language with the multilingual one", () => {
    for (const choice of englishSubtitleModels) {
      expect(modelFor(undefined, choice)).toBe(englishModels[choice]);
      expect(modelFor("en", choice)).toBe(englishModels[choice]);
      expect(modelFor("de", choice)).toBe(multilingualModel);
    }
  });
});

describe("the Docker image's seed", () => {
  it("bakes in the default model where the image's environment says it is", async () => {
    const dockerfile = await readFile(
      new URL("../../../../../Dockerfile", import.meta.url),
      "utf8",
    );
    expect(dockerfile).toContain(
      `SLOPIFY_SUBTITLE_MODEL_SEED=/opt/slopify/models/english-subtitles/${alignmentModel.filename}`,
    );
    const source = await readFile(
      new URL("../../../../../docker/subtitle-model/SOURCE.txt", import.meta.url),
      "utf8",
    );
    expect(source).toContain(alignmentModel.filename);
    expect(source).toContain(alignmentModel.url);
    expect(source).toContain(alignmentModel.sha256);
  });
});
