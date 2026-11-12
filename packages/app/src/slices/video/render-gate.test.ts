import { expect, it } from "vitest";
import { createRenderGate } from "./render-gate.js";

// A promise whose resolve is in reach, so a render can be held open while others queue behind.
function deferred(): { readonly promise: Promise<void>; readonly release: () => void } {
  let release = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it("renders one video at a time, and the ones waiting still finish", async () => {
  const gate = createRenderGate(() => 1);
  const started: number[] = [];
  const held = [deferred(), deferred(), deferred()];
  const runs = held.map((one, index) =>
    gate.hold(async () => {
      started.push(index);
      await one.promise;
      return index;
    }),
  );
  await Promise.resolve();
  expect(started).toEqual([0]);
  held[0]?.release();
  expect(await runs[0]).toBe(0);
  expect(started).toEqual([0, 1]);
  held[1]?.release();
  held[2]?.release();
  expect(await Promise.all(runs)).toEqual([0, 1, 2]);
});

it("gives the place back when a render fails, so the next one still starts", async () => {
  const gate = createRenderGate(() => 1);
  const second = deferred();
  const failing = gate.hold(() => Promise.reject(new Error("disk full")));
  const next = gate.hold(async () => {
    await second.promise;
    return "done";
  });
  await expect(failing).rejects.toThrow("disk full");
  second.release();
  expect(await next).toBe("done");
});

it("lets a waiting render start as soon as the setting is raised", async () => {
  let limit = 1;
  const gate = createRenderGate(() => limit);
  const started: number[] = [];
  const held = [deferred(), deferred()];
  const runs = held.map((one, index) =>
    gate.hold(async () => {
      started.push(index);
      await one.promise;
    }),
  );
  await Promise.resolve();
  expect(started).toEqual([0]);
  // Raising it alone does not start the waiting render; the next place given back does.
  limit = 2;
  held[0]?.release();
  await runs[0];
  expect(started).toEqual([0, 1]);
  held[1]?.release();
  await Promise.all(runs);
});

it("keeps a hand-edited setting inside the bounds the page allows", async () => {
  const started: number[] = [];
  const gate = createRenderGate(() => 0);
  const held = [deferred(), deferred()];
  const runs = held.map((one, index) =>
    gate.hold(async () => {
      started.push(index);
      await one.promise;
    }),
  );
  await Promise.resolve();
  // Zero would let nothing render at all: it reads as one.
  expect(started).toEqual([0]);
  held[0]?.release();
  held[1]?.release();
  await Promise.all(runs);
  expect(started).toEqual([0, 1]);
});
