import { z } from "zod";

export async function candidateReady(
  origin: string,
  version: string,
  token: string,
  exited: () => boolean,
  fetcher: typeof globalThis.fetch,
): Promise<boolean> {
  if (exited()) return false;
  const response = await fetcher(`${origin}/api/update/ready`, {
    headers: { "X-Slopify-Update-Token": token },
    signal: AbortSignal.timeout(1500),
    redirect: "error",
  });
  if (!response.ok) return false;
  const health = z.object({ status: z.literal("ok"), version: z.literal(version) });
  const matches = health.safeParse(await response.json()).success;
  return matches && !exited();
}
