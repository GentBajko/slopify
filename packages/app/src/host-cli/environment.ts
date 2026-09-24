import { z } from "zod";

const path = z
  .string()
  .max(16384)
  .refine((value) => !/[\p{Cc}]/u.test(value));
export const hostEnvironmentSchema = z
  .object({
    HOME: path,
    PATH: path,
    CODEX_HOME: path.optional(),
    CLAUDE_CONFIG_DIR: path.optional(),
    XDG_CONFIG_HOME: path.optional(),
    XDG_DATA_HOME: path.optional(),
    XDG_CACHE_HOME: path.optional(),
    SSL_CERT_FILE: path.optional(),
    NODE_EXTRA_CA_CERTS: path.optional(),
  })
  .strict();
export function hostEnvironment(env: Readonly<NodeJS.ProcessEnv>): Readonly<NodeJS.ProcessEnv> {
  const selected: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(hostEnvironmentSchema.shape))
    if (env[key] !== undefined) selected[key] = env[key];
  return hostEnvironmentSchema.parse(selected);
}
