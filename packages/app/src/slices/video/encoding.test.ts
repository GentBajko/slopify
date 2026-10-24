import { spawn } from "node:child_process";
import { getPriority } from "node:os";
import { describe, expect, it } from "vitest";
import {
  codecArgs,
  createNvencProbe,
  failedNvenc,
  type NvencExec,
  noNvenc,
  nvencQuality,
  nvencWhy,
  renderMachine,
  setRenderPriority,
} from "./encoding.js";

const log = (): { write: (...args: unknown[]) => void; lines: unknown[][] } => {
  const lines: unknown[][] = [];
  return { write: (...args: unknown[]) => void lines.push(args), lines };
};

describe("codecArgs", () => {
  it("keeps today's x264 arguments for a thorough render, so cached clips stay valid", () => {
    const x264 = { kind: "x264", clipSpeed: "thorough" } as const;
    expect(codecArgs(x264, "final", undefined)).toEqual(["-c:v", "libx264", "-pix_fmt", "yuv420p"]);
    expect(codecArgs(x264, "intermediate", undefined)).toEqual([
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-crf",
      "16",
    ]);
    const grainy = { grade: "none", atmosphere: "none", vignette: "off", grain: "subtle" } as const;
    expect(codecArgs(x264, "intermediate", grainy)).toEqual([
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
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
      "-preset",
      "veryfast",
      "-crf",
      "16",
    ]);
    // A clip joined by copying is the finished picture, so it keeps the thorough preset.
    expect(codecArgs(fast, "final", undefined)).toEqual(["-c:v", "libx264", "-pix_fmt", "yuv420p"]);
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
      // x264's grain tuning means nothing to NVENC.
      expect(args).not.toContain("grain");
    }
    expect(nvencQuality.intermediate).toBeLessThan(nvencQuality.final);
  });
});

// A fake ffmpeg per path: what `-encoders` and `-filters` list, and whether a test encode works.
function fakeExec(
  machines: Readonly<
    Record<string, { readonly encoders: string; readonly encodes: boolean } | "missing">
  >,
): NvencExec & { readonly calls: string[][] } {
  const calls: string[][] = [];
  const exec = async (bin: string, args: readonly string[]) => {
    calls.push([bin, ...args]);
    const machine = machines[bin];
    if (machine === undefined || machine === "missing") throw new Error(`spawn ${bin} ENOENT`);
    if (args.includes("-encoders")) return machine.encoders;
    if (args.includes("-filters"))
      return " .. ass               V->V       Render ASS\n .. zoompan           V->V       Zoom\n .S xfade             VV->V      Cross fade\n";
    if (!machine.encodes) throw new Error("ffmpeg exited with code 1: OpenEncodeSessionEx failed");
    return "";
  };
  return Object.assign(exec, { calls });
}

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

describe("renderMachine", () => {
  const available = async () => ({ available: true as const, bin: "/usr/bin/ffmpeg" });
  const missing = async () => ({ available: false as const, reason: noNvenc });

  it("encodes on the processor with the chosen clip speed and priority", async () => {
    const result = await renderMachine({
      settings: { videoEncoder: "cpu", clipEncodeSpeed: "fast", renderPriority: "normal" },
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
