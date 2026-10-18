import { claudeAddCommand, codexConfig, mcpUrl } from "@app/slices/agents/model.js";
import { useQuery } from "@tanstack/react-query";
import { CopyIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { helpScope } from "@/components/kit/info-tip";
import { LoadingBlock, QueryState } from "@/components/kit/query-state";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { copyText } from "@/fixes/fix-actions";
import { startedAt } from "@/lib/utils";
import { Stamp } from "@/library/time";
import { readRemoteAccess, remoteAccessKey } from "@/remote-access/api";
import { agentConnectionQueryKey, readAgentConnection } from "./api";

// Settings → Connections → Agents (MCP): where an agent on this computer connects, the two
// setup lines, whether one has connected, and what agents changed lately.
export function AgentSettings(): ReactElement {
  const { api } = useApp();
  const notify = useToast();
  const connection = useQuery({
    queryKey: agentConnectionQueryKey,
    queryFn: () => readAgentConnection(api),
  });
  // A page opened through Tailscale's address can't give agents its own: /mcp answers only on
  // the computer Slopify runs on, so the address there is shown.
  const remote = useQuery({
    queryKey: remoteAccessKey,
    queryFn: () => readRemoteAccess(api),
    retry: false,
  });
  const throughTailnet = remote.data?.available === true && remote.data.changeable === false;
  const url = mcpUrl(throughTailnet && remote.data !== undefined ? remote.data.local : api.origin);
  const setups = [
    { label: "Claude Code", where: "Run it once in a terminal.", text: claudeAddCommand(url) },
    { label: "Codex", where: "Add it to ~/.codex/config.toml.", text: codexConfig(url) },
  ];
  const copy = async (setup: (typeof setups)[number]): Promise<void> => {
    if (await copyText(setup.text))
      notify(`${setup.label} setup copied. ${setup.where}`, "success");
    else
      notify(
        `The ${setup.label} setup wasn't copied: this browser blocked the clipboard. Select the line and copy it yourself.`,
        "error",
      );
  };
  return (
    <div className="flex max-w-prose flex-col gap-4" {...helpScope}>
      <SectionHead title="Agents (MCP)" info="settings.agents" />
      <div className="flex flex-col gap-1">
        <span className="text-small font-semibold">MCP address</span>
        <code className="sl-code py-2 select-all">{url}</code>
        {throughTailnet ? (
          <p className="m-0 text-small text-ink-2">
            Agents connect on the computer Slopify runs on, never through the remote address: this
            is the address there.
          </p>
        ) : null}
      </div>
      {setups.map((setup) => (
        <div key={setup.label} className="flex flex-col gap-1">
          <span className="text-small font-semibold">{setup.label}</span>
          <div className="flex flex-wrap items-start gap-2">
            <code className="sl-code min-w-0 flex-1 basis-[220px] py-2 whitespace-pre-wrap select-all">
              {setup.text}
            </code>
            <Button
              variant="quiet"
              aria-label={`Copy the ${setup.label} setup`}
              onClick={() => void copy(setup)}
            >
              <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
              Copy
            </Button>
          </div>
          <p className="m-0 text-small text-ink-2">{setup.where}</p>
        </div>
      ))}
      <QueryState
        query={connection}
        what="Agent activity"
        loading={<LoadingBlock label="Loading agent activity…" rows={3} rowClassName="h-5" />}
      >
        {(data) => (
          <>
            <p className="m-0 text-small text-ink-2">
              {data.lastConnectedAt === null ? (
                "No agent has connected yet."
              ) : (
                <>
                  Last connected{" "}
                  <Stamp iso={data.lastConnectedAt}>{startedAt(data.lastConnectedAt)}</Stamp>.
                </>
              )}
            </p>
            <section aria-label="What agents did" className="flex flex-col gap-1">
              <h3 className="m-0 text-title-3">What agents did</h3>
              {data.recent.length === 0 ? (
                <p className="m-0 text-small text-ink-2">No agent has changed anything yet.</p>
              ) : (
                <ul className="m-0 list-none space-y-1 p-0 text-small text-ink-2">
                  {data.recent.map((action) => (
                    <li key={action.id}>
                      {action.title}
                      {action.subject === null ? "" : ` · ${action.subject}`}
                      {action.actor === "assistant" ? " · by assistant" : ""} ·{" "}
                      <Stamp iso={action.createdAt}>{startedAt(action.createdAt)}</Stamp>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </QueryState>
    </div>
  );
}
