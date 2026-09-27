import { type ChannelLink, channelLinksProblem } from "@app/slices/youtube/placeholders.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { readChannelLinks, saveChannelLinks } from "@/api";
import { useApp } from "@/app-context";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { keys } from "@/queries";

// Settings → Channel links: the named links a YouTube description's `{{Name}}` placeholders
// fill from when it is shown or copied, such as {{Patreon}} or {{Discord}}. A project can set
// its own Previous video on its page, which wins over the one here.
export function ChannelLinksSettings(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: keys.channelLinks, queryFn: () => readChannelLinks(api) });
  const [draft, setDraft] = useState<readonly ChannelLink[] | undefined>();
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const rows = draft ?? saved.data ?? [];
  const save = useMutation({
    mutationFn: (links: readonly ChannelLink[]) => saveChannelLinks(api, links),
    onSuccess: (links) => {
      queryClient.setQueryData(keys.channelLinks, links);
      setDraft(undefined);
      setStatus({ text: "Saved the channel links.", tone: "success" });
    },
    onError: (error) => setStatus({ text: error.message, tone: "error" }),
  });
  const change = (index: number, next: Partial<ChannelLink>) =>
    setDraft(rows.map((row, at) => (at === index ? { ...row, ...next } : row)));

  return (
    <div {...helpScope}>
      <SectionHead title="Named links" info="planning.links.named">
        <Button
          variant="primary"
          disabled={draft === undefined || save.isPending}
          onClick={() => {
            const problem = channelLinksProblem(rows);
            if (problem !== undefined) {
              setStatus({ text: `The channel links weren't saved: ${problem}`, tone: "error" });
              return;
            }
            save.mutate(rows);
          }}
        >
          Save
        </Button>
      </SectionHead>
      {saved.error === null ? null : (
        <p role="alert" className="m-0 mb-3 text-body text-danger">
          The channel links couldn't be read: {saved.error.message}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="m-0 border-y border-line py-4 text-ink-2">
          No channel links yet. Add one, then write its name in braces in a description.
        </p>
      ) : (
        <ul aria-label="Channel links" className="sl-list m-0 list-none p-0">
          {rows.map((row, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place and never reorder
              key={index}
              className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 border-b border-line py-3 md:grid-cols-[220px_minmax(0,1fr)_auto]"
            >
              <Input
                aria-label={`Name of link ${String(index + 1)}`}
                placeholder="Patreon"
                value={row.name}
                onChange={(event) => change(index, { name: event.currentTarget.value })}
              />
              <Input
                aria-label={`Address of link ${String(index + 1)}`}
                type="url"
                placeholder="https://"
                value={row.url}
                onChange={(event) => change(index, { url: event.currentTarget.value })}
              />
              <Button
                variant="quiet"
                size="small"
                className="justify-self-start"
                aria-label={`Remove link ${String(index + 1)}`}
                onClick={() => setDraft(rows.filter((_row, at) => at !== index))}
              >
                <Trash2Icon aria-hidden="true" className="size-[14px]" />
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => setDraft([...rows, { name: "", url: "" }])}>
          <PlusIcon aria-hidden="true" className="size-[14px]" />
          Add link
        </Button>
        <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
      </div>
    </div>
  );
}
