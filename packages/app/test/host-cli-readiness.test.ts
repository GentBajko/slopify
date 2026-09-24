import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { boot } from "../src/main.js";

afterEach(() => vi.unstubAllEnvs());
it("keeps an unconnected container API-only even with CLIs on its PATH", async () => {
  vi.stubEnv("SLOPIFY_CONTAINER", "1");
  vi.stubEnv("SLOPIFY_HOST_CLI_DIR", undefined);
  const root = await mkdtemp(join(tmpdir(), "sb-ready-"));
  const app = await boot({ port: 0, host: "127.0.0.1", dataDir: root, open: false });
  try {
    const response = await fetch(`${app.url}/api/providers`);
    expect(response.status).toBe(200);
    const result = z
      .object({
        providers: z.array(
          z.object({
            id: z.string(),
            readiness: z.object({
              kind: z.string(),
              issueKind: z.string().optional(),
              installed: z.boolean().optional(),
            }),
            cliPath: z.object({ managedOnHost: z.boolean().optional() }).optional(),
          }),
        ),
      })
      .parse(await response.json());
    const cli = result.providers.filter((p) =>
      ["claude-code", "codex", "gemini", "codex-image"].includes(p.id),
    );
    expect(cli).toHaveLength(4);
    for (const provider of cli) {
      expect(provider.readiness).toMatchObject({ installed: false, issueKind: "bridge" });
      expect(provider.cliPath?.managedOnHost).toBe(true);
    }
  } finally {
    await app.stop();
    await rm(root, { recursive: true, force: true });
  }
});
