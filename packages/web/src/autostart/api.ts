import type { AutostartView } from "@app/edge/autostart/model.js";
import type { Api } from "@/api";
import { read } from "@/http";

// "Start Slopify when I log in" (`edge/http/autostart.ts`). A refusal is the server's own
// sentence, which says what failed and where to fix it.

export type { AutostartView };

export const autostartKey = ["settings", "autostart"] as const;

const url = (api: Api, path = "") => `${api.origin}/api/settings/autostart${path}`;

export async function readAutostart(api: Api): Promise<AutostartView> {
  return read<AutostartView>(await api.fetch(url(api)));
}

export async function setAutostart(api: Api, enabled: boolean): Promise<AutostartView> {
  return read<AutostartView>(
    await api.fetch(url(api), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    }),
  );
}

// The first-run screen's No thanks: never offered there again, nothing changes.
export async function answerAutostart(api: Api): Promise<AutostartView> {
  return read<AutostartView>(await api.fetch(url(api, "/answer"), { method: "POST" }));
}
