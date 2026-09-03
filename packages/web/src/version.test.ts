import { describe, expect, it, vi } from "vitest";
import { createVersionWatch, watchingFetch } from "./version.js";

function response(version: string | undefined): Response {
  return new Response(null, {
    status: 200,
    headers: version === undefined ? {} : { "X-Slopify-Version": version },
  });
}

describe("the version watch", () => {
  it("treats the first version it sees as the one this tab loaded from", () => {
    const watch = createVersionWatch();
    watch.observe("1.2.0");
    expect(watch.staleAt()).toBeUndefined();
  });

  it("stays quiet while the served version keeps matching", () => {
    const watch = createVersionWatch();
    const listener = vi.fn();
    watch.subscribe(listener);
    watch.observe("1.2.0");
    watch.observe("1.2.0");
    expect(watch.staleAt()).toBeUndefined();
    expect(listener).not.toHaveBeenCalled();
  });

  it("reports the new version once and notifies subscribers", () => {
    const watch = createVersionWatch();
    const listener = vi.fn();
    watch.subscribe(listener);
    watch.observe("1.2.0");
    watch.observe("1.3.0");
    watch.observe("1.3.0");
    expect(watch.staleAt()).toBe("1.3.0");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying an unsubscribed listener", () => {
    const watch = createVersionWatch();
    const listener = vi.fn();
    const unsubscribe = watch.subscribe(listener);
    watch.observe("1.2.0");
    unsubscribe();
    watch.observe("1.3.0");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("the watching fetch", () => {
  it("reads the header off every response", async () => {
    const watch = createVersionWatch();
    const fetched = watchingFetch(
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response("1.2.0"))
        .mockResolvedValue(response("1.3.0")),
      watch,
    );
    await fetched("/api/health");
    await fetched("/api/projects");
    expect(watch.staleAt()).toBe("1.3.0");
  });

  it("passes a response with no version header through untouched", async () => {
    const watch = createVersionWatch();
    const inner = vi.fn<typeof fetch>().mockResolvedValue(response(undefined));
    const fetched = watchingFetch(inner, watch);
    expect((await fetched("/files/p/video")).status).toBe(200);
    expect(watch.staleAt()).toBeUndefined();
  });
});
