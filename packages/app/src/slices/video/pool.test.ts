import { describe, expect, it } from "vitest";
import { inPool, renderJobs } from "./pool.js";

const gib = 1024 ** 3;

describe("renderJobs", () => {
  it("gives a run four cores and 3 GB of half the memory, at most eight and at least one", () => {
    expect(renderJobs(32, 91 * gib)).toBe(8);
    expect(renderJobs(64, 256 * gib)).toBe(8);
    expect(renderJobs(8, 64 * gib)).toBe(2);
    expect(renderJobs(32, 12 * gib)).toBe(2);
    expect(renderJobs(2, 4 * gib)).toBe(1);
  });
});

describe("inPool", () => {
  it("runs every item, never more than the limit at once", async () => {
    let now = 0;
    let most = 0;
    const done: number[] = [];
    await inPool([1, 2, 3, 4, 5, 6, 7], 3, new AbortController().signal, async (item) => {
      now += 1;
      most = Math.max(most, now);
      await new Promise((resolve) => setTimeout(resolve, 5));
      now -= 1;
      done.push(item);
    });
    expect(most).toBe(3);
    expect(done.toSorted()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("stops the others at the first failure and throws that failure", async () => {
    const started: number[] = [];
    const aborted: number[] = [];
    await expect(
      inPool([1, 2, 3, 4, 5], 2, new AbortController().signal, async (item, signal) => {
        started.push(item);
        if (item === 1) throw new Error("clip 1 failed");
        await new Promise<void>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            aborted.push(item);
            reject(new Error("the render was canceled"));
          });
        });
      }),
    ).rejects.toThrow("clip 1 failed");
    expect(started).toEqual([1, 2]);
    expect(aborted).toEqual([2]);
  });

  it("starts nothing when already canceled, and says canceled when canceled midway", async () => {
    const early = new AbortController();
    early.abort();
    let ran = 0;
    await expect(
      inPool([1], 1, early.signal, async () => {
        ran += 1;
      }),
    ).rejects.toThrow("the render was canceled before it started");
    expect(ran).toBe(0);
    const late = new AbortController();
    await expect(
      inPool([1, 2, 3], 1, late.signal, async (item) => {
        if (item === 1) late.abort();
      }),
    ).rejects.toThrow("the render was canceled");
  });
});
