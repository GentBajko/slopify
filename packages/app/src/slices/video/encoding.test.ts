import { spawn } from "node:child_process";
import { getPriority } from "node:os";
import { describe, expect, it } from "vitest";
import {
  codecArgs,
  codecQuality,
  copyTag,
  noNvenc,
  noSvtAv1,
  nvencQuality,
  renderMachine,
  setRenderPriority,
} from "./encoding.js";

const bt709 = [
  "-colorspace",
  "bt709",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-color_range",
  "tv",
];

const log = (): { write: (...args: unknown[]) => void; lines: unknown[][] } => {
  const lines: unknown[][] = [];
  return { write: (...args: unknown[]) => void lines.push(args), lines };
};

describe("codecArgs", () => {
  it("encodes x264 at its default preset, tagged BT.709 limited range", () => {
    const x264 = { kind: "x264", clipSpeed: "thorough" } as const;
    expect(codecArgs(x264, "final", undefined)).toEqual([
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...bt709,
    ]);
    expect(codecArgs(x264, "intermediate", undefined)).toEqual([
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...bt709,
      "-crf",
      "16",
    ]);
    const grainy = { grade: "none", atmosphere: "none", vignette: "off", grain: "subtle" } as const;
    expect(codecArgs(x264, "intermediate", grainy)).toEqual([
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...bt709,
      "-tune",
      "grain",
      "-crf",
      "16",
    ]);
  });

  it("encodes the intermediate clips with x264's veryfast preset at the same quality when Fast", () => {
    const fast = { kind: "x264", clipSpeed: "fast" } as const;
    expect(codecArgs(fast, "intermediate", undefined)).toEqual([
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...bt709,
      "-preset",
      "veryfast",
      "-crf",
      "16",
    ]);
    // A clip joined by copying is the finished picture, so it keeps the thorough preset.
    expect(codecArgs(fast, "final", undefined)).toEqual([
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      ...bt709,
    ]);
  });

  // A clip that draws its own captions is the finished picture and its frames' only encode.
  it("encodes a clip with its own captions as a finished picture, a step quicker when Fast", () => {
    const x264 = { kind: "x264", clipSpeed: "thorough" } as const;
    const fast = { kind: "x264", clipSpeed: "fast" } as const;
    const nvenc = { kind: "nvenc", bin: "/usr/bin/ffmpeg", clipSpeed: "fast" } as const;
    expect(codecArgs(x264, "captioned", undefined)).toEqual(codecArgs(x264, "final", undefined));
    expect(codecArgs(fast, "captioned", undefined)).toEqual([
      ...codecArgs(x264, "final", undefined),
      "-preset",
      "faster",
    ]);
    expect(codecArgs(nvenc, "captioned", undefined)).toEqual(codecArgs(nvenc, "final", undefined));
  });

  it("encodes on the NVIDIA card at its highest quality, constant quality per role", () => {
    const nvenc = { kind: "nvenc", bin: "/usr/bin/ffmpeg", clipSpeed: "thorough" } as const;
    const grainy = { grade: "none", atmosphere: "none", vignette: "off", grain: "strong" } as const;
    for (const role of ["intermediate", "final"] as const) {
      const args = codecArgs(nvenc, role, grainy);
      const after = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
      expect(after("-c:v")).toBe("h264_nvenc");
      expect(after("-preset")).toBe("p7");
      expect(after("-tune")).toBe("hq");
      expect(after("-rc")).toBe("vbr");
      expect(after("-cq")).toBe(String(nvencQuality[role]));
      expect(after("-b:v")).toBe("0");
      expect(args).not.toContain("-multipass");
      expect(after("-pix_fmt")).toBe("yuv420p");
      expect(args.slice(-bt709.length)).toEqual(bt709);
      // x264's grain tuning means nothing to NVENC.
      expect(args).not.toContain("grain");
    }
    expect(nvencQuality.intermediate).toBeLessThan(nvencQuality.final);
  });
});

describe("codecArgs for HEVC and AV1", () => {
  const grainy = { grade: "none", atmosphere: "none", vignette: "off", grain: "subtle" } as const;
  const x264 = { kind: "x264", clipSpeed: "thorough" } as const;

  it("encodes HEVC on the processor with x265, tagged hvc1, one keyframe every 250 frames", () => {
    const x265 = { kind: "x265", clipSpeed: "thorough" } as const;
    for (const role of ["final", "captioned"] as const)
      expect(codecArgs(x265, role, grainy)).toEqual([
        "-c:v",
        "libx265",
        "-pix_fmt",
        "yuv420p",
        ...bt709,
        "-tune",
        "grain",
        "-preset",
        "medium",
        "-crf",
        String(codecQuality.x265Crf),
        "-g",
        "250",
        "-tag:v",
        "hvc1",
        "-x265-params",
        "log-level=error",
      ]);
    // A clip decoded again under captions stays x264 at CRF 16: nobody watches it.
    expect(codecArgs(x265, "intermediate", grainy)).toEqual(
      codecArgs(x264, "intermediate", grainy),
    );
    expect(codecArgs({ ...x265, clipSpeed: "fast" }, "intermediate", undefined)).toEqual(
      codecArgs({ ...x264, clipSpeed: "fast" }, "intermediate", undefined),
    );
  });

  it("encodes AV1 on the processor with SVT-AV1 at the measured preset and CRF", () => {
    const svt = { kind: "svtav1", bin: "/usr/bin/ffmpeg", clipSpeed: "fast" } as const;
    for (const role of ["final", "captioned"] as const)
      expect(codecArgs(svt, role, grainy)).toEqual([
        "-c:v",
        "libsvtav1",
        "-pix_fmt",
        "yuv420p",
        ...bt709,
        "-preset",
        String(codecQuality.svtav1Preset),
        "-crf",
        String(codecQuality.svtav1Crf),
        "-g",
        "250",
      ]);
    expect(codecArgs(svt, "intermediate", undefined)).toEqual(
      codecArgs({ ...x264, clipSpeed: "fast" }, "intermediate", undefined),
    );
  });

  it.each([
    ["hevc", "hevc_nvenc", codecQuality.hevcNvenc],
    ["av1", "av1_nvenc", codecQuality.av1Nvenc],
  ] as const)("encodes %s on the NVIDIA card in the H.264 encoder's style", (codec, name, cq) => {
    const h264 = { kind: "nvenc", bin: "/usr/bin/ffmpeg", clipSpeed: "thorough" } as const;
    const nvenc = { ...h264, codec } as const;
    for (const role of ["final", "captioned"] as const) {
      const args = codecArgs(nvenc, role, grainy);
      const after = (flag: string): string | undefined => args[args.indexOf(flag) + 1];
      expect(after("-c:v")).toBe(name);
      expect(after("-preset")).toBe("p7");
      expect(after("-tune")).toBe("hq");
      expect(after("-rc")).toBe("vbr");
      expect(after("-cq")).toBe(String(cq));
      expect(after("-b:v")).toBe("0");
      expect(after("-g")).toBe("250");
      expect(after("-pix_fmt")).toBe("yuv420p");
      expect(args.slice(-bt709.length)).toEqual(bt709);
      if (codec === "hevc") expect(after("-tag:v")).toBe("hvc1");
      else expect(args).not.toContain("-tag:v");
    }
    // The clips under captions stay exactly as H.264 on the card makes them today.
    expect(codecArgs(nvenc, "intermediate", grainy)).toEqual(
      codecArgs(h264, "intermediate", grainy),
    );
  });

  it("keeps H.264 on the card byte for byte as it was", () => {
    const nvenc = { kind: "nvenc", bin: "/usr/bin/ffmpeg", clipSpeed: "thorough" } as const;
    expect(codecArgs(nvenc, "final", undefined)).toEqual([
      "-c:v",
      "h264_nvenc",
      "-preset",
      "p7",
      "-tune",
      "hq",
      "-rc",
      "vbr",
      "-cq",
      "28.5",
      "-b:v",
      "0",
      "-g",
      "250",
      "-pix_fmt",
      "yuv420p",
      ...bt709,
    ]);
  });

  it("tags HEVC as hvc1 when the clips are joined by copying, and nothing else", () => {
    expect(copyTag({ kind: "x265", clipSpeed: "thorough" })).toEqual(["-tag:v", "hvc1"]);
    expect(copyTag({ kind: "nvenc", bin: "f", clipSpeed: "thorough", codec: "hevc" })).toEqual([
      "-tag:v",
      "hvc1",
    ]);
    expect(copyTag(x264)).toEqual([]);
    expect(copyTag({ kind: "nvenc", bin: "f", clipSpeed: "thorough" })).toEqual([]);
    expect(copyTag({ kind: "nvenc", bin: "f", clipSpeed: "thorough", codec: "av1" })).toEqual([]);
    expect(copyTag({ kind: "svtav1", bin: "f", clipSpeed: "thorough" })).toEqual([]);
  });
});

describe("renderMachine", () => {
  const available = async () => ({ available: true as const, bin: "/usr/bin/ffmpeg" });
  const missing = async () => ({ available: false as const, reason: noNvenc });

  it("encodes on the processor with the chosen clip speed and priority", async () => {
    const result = await renderMachine({
      settings: {
        videoEncoder: "cpu",
        clipEncodeSpeed: "fast",
        renderPriority: "normal",
        videoRenderConcurrency: 1,
      },
      nvenc: missing,
      log: log(),
    });
    expect(result).toEqual({
      machine: { encode: { kind: "x264", clipSpeed: "fast" }, priority: "normal" },
    });
  });

  it("encodes on the NVIDIA card when it is chosen and works", async () => {
    const result = await renderMachine({
      settings: {
        videoEncoder: "nvidia",
        clipEncodeSpeed: "thorough",
        renderPriority: "background",
        videoRenderConcurrency: 1,
      },
      nvenc: available,
      log: log(),
    });
    expect(result).toEqual({
      machine: {
        encode: { kind: "nvenc", bin: "/usr/bin/ffmpeg", clipSpeed: "thorough" },
        priority: "background",
      },
    });
  });

  it("falls back to the processor with a notice and a warning when the card does not work", async () => {
    const logged = log();
    const result = await renderMachine({
      settings: {
        videoEncoder: "nvidia",
        clipEncodeSpeed: "thorough",
        renderPriority: "background",
        videoRenderConcurrency: 1,
      },
      nvenc: missing,
      log: logged,
    });
    expect(result.machine.encode).toEqual({ kind: "x264", clipSpeed: "thorough" });
    expect(result.notice).toMatch(/processor/);
    expect(result.notice).toMatch(/Settings → Production defaults → Video encoder/);
    expect(logged.lines[0]?.[0]).toBe("warn");
  });
});

describe("renderMachine with a codec", () => {
  const settings = (videoEncoder: "cpu" | "nvidia") =>
    ({
      videoEncoder,
      clipEncodeSpeed: "thorough",
      renderPriority: "normal",
      videoRenderConcurrency: 1,
    }) as const;
  const card = async () => ({ available: true as const, bin: "/usr/bin/ffmpeg" });
  const noCard = async () => ({ available: false as const, reason: noNvenc });
  const svt = async () => ({ available: true as const, bin: "/usr/local/bin/ffmpeg" });
  const noSvt = async () => ({ available: false as const, reason: noSvtAv1 });

  it("keeps H.264 exactly as before, and never asks for SVT-AV1", async () => {
    let asked = false;
    const result = await renderMachine({
      settings: settings("cpu"),
      nvenc: noCard,
      svtav1: async () => {
        asked = true;
        return noSvt();
      },
      codec: "h264",
      log: log(),
    });
    expect(result).toEqual({
      machine: { encode: { kind: "x264", clipSpeed: "thorough" }, priority: "normal" },
    });
    expect(asked).toBe(false);
  });

  it("encodes HEVC with x265 on the processor and with the card's HEVC encoder on NVIDIA", async () => {
    const cpu = await renderMachine({
      settings: settings("cpu"),
      nvenc: noCard,
      codec: "hevc",
      log: log(),
    });
    expect(cpu.machine.encode).toEqual({ kind: "x265", clipSpeed: "thorough" });
    const nvidia = await renderMachine({
      settings: settings("nvidia"),
      nvenc: card,
      codec: "hevc",
      log: log(),
    });
    expect(nvidia).toEqual({
      machine: {
        encode: { kind: "nvenc", bin: "/usr/bin/ffmpeg", clipSpeed: "thorough", codec: "hevc" },
        priority: "normal",
      },
    });
  });

  it("encodes AV1 with SVT-AV1 through the ffmpeg that has it", async () => {
    const result = await renderMachine({
      settings: settings("cpu"),
      nvenc: noCard,
      svtav1: svt,
      codec: "av1",
      log: log(),
    });
    expect(result).toEqual({
      machine: {
        encode: { kind: "svtav1", bin: "/usr/local/bin/ffmpeg", clipSpeed: "thorough" },
        priority: "normal",
      },
    });
  });

  it("falls back to H.264 on the processor with a plain notice when SVT-AV1 is missing", async () => {
    const logged = log();
    const result = await renderMachine({
      settings: settings("cpu"),
      nvenc: noCard,
      svtav1: noSvt,
      codec: "av1",
      log: logged,
    });
    expect(result.machine.encode).toEqual({ kind: "x264", clipSpeed: "thorough" });
    expect(result.notice).toMatch(/H\.264/);
    expect(result.notice).toMatch(/SVT-AV1/);
    expect(result.notice).toMatch(/Video codec/);
    expect(logged.lines[0]?.[0]).toBe("warn");
  });

  it("falls back to H.264 on the card when the card can't encode the codec", async () => {
    const result = await renderMachine({
      settings: settings("nvidia"),
      nvenc: async (codec) =>
        codec === "av1"
          ? { available: false as const, reason: "This NVIDIA graphics card can't encode AV1." }
          : card(),
      codec: "av1",
      log: log(),
    });
    expect(result.machine.encode).toEqual({
      kind: "nvenc",
      bin: "/usr/bin/ffmpeg",
      clipSpeed: "thorough",
    });
    expect(result.notice).toMatch(/H\.264/);
    expect(result.notice).toMatch(/can't encode AV1/);
  });

  it("encodes the codec on the processor when the card does not work at all", async () => {
    const hevc = await renderMachine({
      settings: settings("nvidia"),
      nvenc: noCard,
      codec: "hevc",
      log: log(),
    });
    expect(hevc.machine.encode).toEqual({ kind: "x265", clipSpeed: "thorough" });
    expect(hevc.notice).toMatch(/processor/);
    const av1 = await renderMachine({
      settings: settings("nvidia"),
      nvenc: noCard,
      svtav1: noSvt,
      codec: "av1",
      log: log(),
    });
    expect(av1.machine.encode).toEqual({ kind: "x264", clipSpeed: "thorough" });
    expect(av1.notice).toMatch(/processor/);
    expect(av1.notice).toMatch(/SVT-AV1/);
  });
});

describe("setRenderPriority", () => {
  it("leaves a normal-priority run alone", () => {
    const calls: number[][] = [];
    setRenderPriority(1234, "normal", log(), (pid, priority) => void calls.push([pid, priority]));
    expect(calls).toEqual([]);
  });

  it("lowers a background run to below-normal priority (nice 10)", () => {
    const calls: number[][] = [];
    setRenderPriority(
      1234,
      "background",
      log(),
      (pid, priority) => void calls.push([pid, priority]),
    );
    expect(calls).toEqual([[1234, 10]]);
  });

  it("logs and carries on when the system refuses", () => {
    const logged = log();
    expect(() =>
      setRenderPriority(1234, "background", logged, () => {
        throw new Error("EPERM");
      }),
    ).not.toThrow();
    expect(logged.lines[0]?.[0]).toBe("warn");
  });

  it.skipIf(process.platform === "win32")("really lowers a running child", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 5000)"]);
    try {
      if (child.pid === undefined) throw new Error("no pid");
      setRenderPriority(child.pid, "background", log());
      expect(getPriority(child.pid)).toBe(10);
    } finally {
      child.kill("SIGKILL");
    }
  });
});
