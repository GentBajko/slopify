import { describe, expect, it } from "vitest";
import {
  createNvencProbe,
  createSvtAv1Probe,
  failedNvenc,
  type NvencExec,
} from "./encoder-probe.js";
import { noNvenc, noSvtAv1, nvencWhy } from "./encoding.js";

const log = (): { write: (...args: unknown[]) => void; lines: unknown[][] } => {
  const lines: unknown[][] = [];
  return { write: (...args: unknown[]) => void lines.push(args), lines };
};

// A fake ffmpeg per path: what `-encoders` and `-filters` list, and whether a test encode works.
function fakeExec(
  machines: Readonly<
    Record<
      string,
      | { readonly encoders: string; readonly encodes: boolean; readonly filters?: string }
      | "missing"
    >
  >,
): NvencExec & { readonly calls: string[][] } {
  const calls: string[][] = [];
  const exec = async (bin: string, args: readonly string[]) => {
    calls.push([bin, ...args]);
    const machine = machines[bin];
    if (machine === undefined || machine === "missing") throw new Error(`spawn ${bin} ENOENT`);
    if (args.includes("-encoders")) return machine.encoders;
    if (args.includes("-filters")) return machine.filters ?? everyFilter;
    if (!machine.encodes) throw new Error("ffmpeg exited with code 1: OpenEncodeSessionEx failed");
    return "";
  };
  return Object.assign(exec, { calls });
}

const someFilters =
  " .. ass               V->V       Render ASS\n .. zoompan           V->V       Zoom\n .S xfade             VV->V      Cross fade\n";
const everyFilter = `${someFilters} TS perspective       V->V       Correct perspective\n TS fillborders       V->V       Fill borders\n`;
const withNvenc = " V....D h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)\n";
const withoutNvenc = " V....D libx264              libx264 H.264 / AVC (codec h264)\n";

describe("createNvencProbe", () => {
  it("uses the first ffmpeg that lists NVENC and passes a real test encode, and asks once", async () => {
    const exec = fakeExec({
      "/bundled/ffmpeg": { encoders: withoutNvenc, encodes: true },
      ffmpeg: { encoders: withNvenc, encodes: true },
      "/usr/bin/ffmpeg": { encoders: withNvenc, encodes: true },
    });
    const probe = createNvencProbe({
      candidates: ["/bundled/ffmpeg", "ffmpeg", "/usr/bin/ffmpeg"],
      exec,
      log: log(),
    });
    expect(await probe()).toEqual({ available: true, bin: "ffmpeg" });
    const asked = exec.calls.length;
    expect(await probe()).toEqual({ available: true, bin: "ffmpeg" });
    expect(exec.calls.length).toBe(asked);
    const test = exec.calls.find((call) => call.includes("h264_nvenc"));
    expect(test?.[0]).toBe("ffmpeg");
    expect(test).toContain("lavfi");
    expect(test).toContain("null");
  });

  it("passes over an ffmpeg with NVENC that lacks a filter a video needs, and says which", async () => {
    const logged = log();
    const probe = createNvencProbe({
      candidates: ["/old/ffmpeg"],
      exec: fakeExec({
        "/old/ffmpeg": { encoders: withNvenc, encodes: true, filters: someFilters },
      }),
      log: logged,
    });
    const status = await probe();
    if (status.available) throw new Error("expected NVENC to be unavailable");
    expect(status.reason).toBe(failedNvenc);
    expect(status.detail).toBe(
      "the ffmpeg at /old/ffmpeg has NVENC but not the perspective, fillborders filter a video needs",
    );
  });

  it("says no NVIDIA encoder was found when no ffmpeg lists one", async () => {
    const probe = createNvencProbe({
      candidates: ["/bundled/ffmpeg", "ffmpeg"],
      exec: fakeExec({ "/bundled/ffmpeg": { encoders: withoutNvenc, encodes: true } }),
      log: log(),
    });
    expect(await probe()).toEqual({ available: false, reason: noNvenc });
  });

  it("is unavailable when NVENC is listed but its test encode fails, in plain words with the test's output apart", async () => {
    const logged = log();
    const probe = createNvencProbe({
      candidates: ["/usr/bin/ffmpeg"],
      exec: fakeExec({ "/usr/bin/ffmpeg": { encoders: withNvenc, encodes: false } }),
      log: logged,
    });
    const status = await probe();
    if (status.available) throw new Error("expected NVENC to be unavailable");
    expect(status.reason).toBe(failedNvenc);
    expect(status.reason).not.toMatch(/ffmpeg|Error/);
    expect(status.detail).toMatch(/test encode failed.*OpenEncodeSession/);
    expect(nvencWhy(status)).toBe(`${failedNvenc} (${status.detail ?? ""})`);
  });
});

const withSvt =
  " V..... libsvtav1            SVT-AV1 encoder (codec av1)\n V....D libx264              libx264 H.264 (codec h264)\n";

describe("createSvtAv1Probe", () => {
  it("uses the first ffmpeg with SVT-AV1 and x264 that passes a test encode, and asks once", async () => {
    const exec = fakeExec({
      "/bundled/ffmpeg": { encoders: withoutNvenc, encodes: true },
      "/usr/bin/ffmpeg": { encoders: withSvt, encodes: true },
    });
    const probe = createSvtAv1Probe({
      candidates: ["/bundled/ffmpeg", "/usr/bin/ffmpeg"],
      exec,
      log: log(),
    });
    expect(await probe()).toEqual({ available: true, bin: "/usr/bin/ffmpeg" });
    const asked = exec.calls.length;
    await probe();
    expect(exec.calls.length).toBe(asked);
    const test = exec.calls.find((call) => call.includes("libsvtav1"));
    expect(test?.[0]).toBe("/usr/bin/ffmpeg");
    expect(test).toContain("lavfi");
  });

  it("passes over an ffmpeg with SVT-AV1 but no x264, which the clips under captions need", async () => {
    const probe = createSvtAv1Probe({
      candidates: ["/odd/ffmpeg"],
      exec: fakeExec({
        "/odd/ffmpeg": {
          encoders: " V..... libsvtav1            SVT-AV1 encoder (codec av1)\n",
          encodes: true,
        },
      }),
      log: log(),
    });
    const status = await probe();
    if (status.available) throw new Error("expected SVT-AV1 to be unavailable");
    expect(status.detail).toMatch(/libx264/);
  });

  it("says no SVT-AV1 was found when no ffmpeg lists it", async () => {
    const probe = createSvtAv1Probe({
      candidates: ["/bundled/ffmpeg"],
      exec: fakeExec({ "/bundled/ffmpeg": { encoders: withoutNvenc, encodes: true } }),
      log: log(),
    });
    expect(await probe()).toEqual({ available: false, reason: noSvtAv1 });
  });

  it("is unavailable when its test encode fails", async () => {
    const probe = createSvtAv1Probe({
      candidates: ["/usr/bin/ffmpeg"],
      exec: fakeExec({ "/usr/bin/ffmpeg": { encoders: withSvt, encodes: false } }),
      log: log(),
    });
    const status = await probe();
    if (status.available) throw new Error("expected SVT-AV1 to be unavailable");
    expect(status.detail).toMatch(/test encode failed/);
  });
});

describe("createNvencProbe per codec", () => {
  it("test-encodes HEVC and AV1 on the card that passed, once each", async () => {
    const calls: string[][] = [];
    const exec: NvencExec = async (bin, args) => {
      calls.push([bin, ...args]);
      if (args.includes("-encoders")) return withNvenc;
      if (args.includes("-filters")) return everyFilter;
      if (args.includes("av1_nvenc")) throw new Error("ffmpeg exited with code 1: no AV1");
      return "";
    };
    const probe = createNvencProbe({ candidates: ["/usr/bin/ffmpeg"], exec, log: log() });
    expect(await probe("hevc")).toEqual({ available: true, bin: "/usr/bin/ffmpeg" });
    const av1 = await probe("av1");
    if (av1.available) throw new Error("expected AV1 on the card to be unavailable");
    expect(av1.reason).toBe("This NVIDIA graphics card can't encode AV1.");
    expect(av1.detail).toMatch(/no AV1/);
    const asked = calls.length;
    await probe("av1");
    await probe("hevc");
    await probe();
    expect(calls.length).toBe(asked);
    expect(await probe()).toEqual({ available: true, bin: "/usr/bin/ffmpeg" });
  });
});
