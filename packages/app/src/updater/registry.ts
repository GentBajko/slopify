import { z } from "zod";
import { isStableVersion, npmRegistry, updatePackage } from "./model.js";

const release = z.object({
  name: z.literal(updatePackage),
  version: z.string().refine(isStableVersion),
});

export async function publishedVersion(fetcher: typeof globalThis.fetch): Promise<string> {
  const response = await fetcher(`${npmRegistry}@gentbajko%2Fslopify/latest`, {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("The npm release could not be checked.");
  const parsed = release.safeParse(await response.json());
  if (!parsed.success) throw new Error("The npm release metadata is invalid.");
  return parsed.data.version;
}
