import { statfs } from "node:fs/promises";
import { z } from "zod";

// The autopilot's hourly look at what may stop the schedules: the OpenRouter key's spending
// limit (`GET /api/v1/key`, the same read Settings → Providers' Test makes) and the free disk.
// Read-only: neither starts paid work.

const keyAnswer = z.object({
  data: z.object({ limit: z.number().nullable(), limit_remaining: z.number().nullable() }).loose(),
});

// The key's limit and what is left of it; null for a key with no limit. Throws, with the
// status only, when OpenRouter refuses or answers something else: the caller skips the check.
export async function openRouterKeyLimit(
  fetchImpl: typeof fetch,
  key: string,
  signal: AbortSignal,
): Promise<{ readonly limit: number; readonly remaining: number } | null> {
  const response = await fetchImpl("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
    signal,
  });
  if (!response.ok) throw new Error(`OpenRouter answered ${String(response.status)}`);
  const parsed = keyAnswer.safeParse(await response.json());
  if (!parsed.success) throw new Error("OpenRouter's answer wasn't the key's limits");
  const { limit, limit_remaining: remaining } = parsed.data.data;
  return limit === null || remaining === null ? null : { limit, remaining };
}

export async function diskSpaceAt(
  path: string,
): Promise<{ readonly freeBytes: number; readonly totalBytes: number }> {
  const stats = await statfs(path);
  return {
    freeBytes: Number(stats.bavail) * Number(stats.bsize),
    totalBytes: Number(stats.blocks) * Number(stats.bsize),
  };
}
