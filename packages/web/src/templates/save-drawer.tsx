import { templateNameMax } from "@app/slices/project-templates/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelOfTemplate } from "@/channels/members-tabs";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Drawer } from "@/components/kit/drawer";
import { Field, Input, Select } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";
import { listPlayDrafts, readPlayDraft } from "@/play/draft-api";
import { saveProjectTemplate, type TemplateSummary, templatesKey } from "./api";

// Save a setup: a saved Play draft kept as a template under a name, in a channel. The save
// runs through the screen's `execute`, so it shares Templates' one-press-at-a-time guard
// and its error line.
export function SaveTemplateDrawer({
  open,
  onClose,
  templates,
  channels,
  pending,
  error,
  execute,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly templates: readonly TemplateSummary[] | undefined;
  readonly channels: readonly { readonly id: string; readonly name: string }[];
  readonly pending: boolean;
  readonly error: string | null;
  readonly execute: (action: () => Promise<void>) => Promise<void>;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const drafts = useQuery({
    queryKey: ["play-drafts"],
    queryFn: async () => {
      const reply = await listPlayDrafts(api);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value.drafts;
    },
  });
  const [draftId, setDraftId] = useState("");
  const [name, setName] = useState("");
  // "" keeps the draft's own channel.
  const [saveChannel, setSaveChannel] = useState("");
  const saveIdentity = useRef<{ readonly key: string; readonly id: string } | null>(null);

  async function save(): Promise<void> {
    const draft = await readPlayDraft(api, draftId);
    if (!draft.ok) throw new Error(draft.message);
    const key = JSON.stringify([draftId, draft.value.draft.version, name.trim(), saveChannel]);
    if (saveIdentity.current?.key !== key) saveIdentity.current = { key, id: crypto.randomUUID() };
    const document = draft.value.draft.document;
    // A draft that never picked a channel runs in its template's, which the server reads too.
    const source = templates?.find((template) => template.id === document.templateSource?.id);
    const channelId =
      saveChannel || document.channelId || (source ? channelOfTemplate(source) : undefined);
    const reply = await saveProjectTemplate(api, {
      id: saveIdentity.current.id,
      name: name.trim(),
      document: channelId === undefined ? document : { ...document, channelId },
    });
    if (!reply.ok) {
      saveIdentity.current = null;
      throw new Error(reply.message);
    }
    saveIdentity.current = null;
    setName("");
    onClose();
    notify("Template saved.", "success");
    await client.invalidateQueries({ queryKey: templatesKey });
  }

  return (
    <Drawer
      open={open}
      title="Save a setup"
      width="narrow"
      onClose={onClose}
      footer={
        <>
          <StatusSlot tone={error ? "error" : "info"}>
            {error ?? (pending ? "Saving…" : undefined)}
          </StatusSlot>
          <Button
            type="submit"
            form="save-template-form"
            variant="primary"
            disabled={pending || !draftId || !name.trim()}
          >
            Save template
          </Button>
        </>
      }
    >
      <p className="m-0 mb-4 text-small text-ink-2">
        Choose a saved Play draft, or{" "}
        <Link to="/play" className="text-accent-ink underline">
          open Play
        </Link>{" "}
        to prepare one.
      </p>
      <p className="mb-4 text-small text-ink-2">
        A template keeps the settings, not one video&apos;s topic.
      </p>
      <form
        id="save-template-form"
        aria-label="Save a setup"
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (draftId && name.trim()) void execute(save);
        }}
      >
        <Field
          label="Saved Play draft"
          tip="templates.save.draft"
          help={
            drafts.isPending
              ? "Loading saved drafts…"
              : drafts.data?.length === 0
                ? "No saved drafts yet."
                : undefined
          }
        >
          <Select
            value={draftId}
            required
            disabled={pending}
            onChange={(event) => setDraftId(event.target.value)}
          >
            <option value="">Choose a draft</option>
            {drafts.data
              ?.filter((draft) => draft.readable)
              .map((draft) => (
                <option key={draft.id} value={draft.id}>
                  {draft.title || "Untitled draft"}
                </option>
              ))}
          </Select>
        </Field>
        {drafts.error ? (
          <Callout
            tone="danger"
            title="The saved drafts couldn't be loaded."
            actions={
              <Button size="small" onClick={() => void drafts.refetch()}>
                Reload drafts
              </Button>
            }
          >
            {drafts.error.message}
          </Callout>
        ) : null}
        <Field label="Template name" id="template-name" tip="templates.save.name">
          <Input
            value={name}
            required
            maxLength={templateNameMax}
            disabled={pending}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Channel" id="template-channel" tip="templates.save.channel">
          <Select
            value={saveChannel}
            disabled={pending}
            onChange={(event) => setSaveChannel(event.target.value)}
          >
            <option value="">The draft's channel</option>
            {channels.map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Drawer>
  );
}
