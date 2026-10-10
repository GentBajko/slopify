import { z } from "zod";
import type { Api } from "@/api";
import { errorOf, problemOf, understood } from "@/http";

export const agentConnectionQueryKey: readonly string[] = ["agent-connection"];

const connectionSchema = z.object({
  lastConnectedAt: z.string().nullable(),
  recent: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      subject: z.string().nullable(),
      createdAt: z.string(),
    }),
  ),
});
export type AgentConnection = z.infer<typeof connectionSchema>;

export async function readAgentConnection(api: Api): Promise<AgentConnection> {
  const response = await api.fetch(`${api.origin}/api/settings/agents`);
  if (!response.ok) throw errorOf(response, await problemOf(response));
  return understood(connectionSchema, await response.json());
}
