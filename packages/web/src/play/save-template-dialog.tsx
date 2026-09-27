import { templateDocument, topicKeywords } from "@app/slices/project-templates/one-off.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelOfTemplate } from "@/channels/members-tabs";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Dialog } from "@/components/kit/dialog";
import { Field, Input } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";
import { saveProjectTemplate, templatesKey, templatesQuery } from "@/templates/api";
import { usePlaySession } from "./draft-context";

// What a template leaves out of this setup, in words: the topic keywords the title names are
// saved empty and the extra videos are not saved at all. Settings-like keywords keep their values.
export function oneOffNotes(
  title: string,
  values: Readonly<Record<string, string>>,
  variants: number,
): readonly string[] {
  const topics = topicKeywords(title);
  return [
    ...topics.map((name) =>
      (values[name] ?? "").trim() === ""
        ? `${name} is left empty in the template.`
        : `${name} is left empty in the template (this video's ${name}, "${values[name]}", is not saved).`,
    ),
    ...(variants > 0
      ? [
          `The ${variants === 1 ? "other video" : `${String(variants)} other videos`} queued here ${variants === 1 ? "is" : "are"} not saved.`,
        ]
      : []),
  ];
}

// Save as template from Play: the settings of this draft under a name, never the topic typed
// for this one video. The server applies the same rule (`slices/project-templates/one-off.ts`).
export function SaveTemplateDialog({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const session = usePlaySession();
  const notify = useToast();
  const templates = useQuery(templatesQuery(api));
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // One id per name, so pressing Save again after a lost reply makes no second template.
  const identity = useRef<{ readonly name: string; readonly id: string } | null>(null);
  const { document } = session;
  const notes = oneOffNotes(document.form.title, document.form.values, document.variants.length);
  const close = (): void => {
    setError(null);
    onClose();
  };
  const save = async (): Promise<void> => {
    const trimmed = name.trim();
    if (trimmed === "" || pending) return;
    setPending(true);
    setError(null);
    try {
      if (!(await session.flush())) {
        setError(
          "Your draft wasn't saved, so the template wasn't either. Press Retry beside Drafts, then Save template again.",
        );
        return;
      }
      if (identity.current?.name !== trimmed)
        identity.current = { name: trimmed, id: crypto.randomUUID() };
      const source = templates.data?.find((one) => one.id === document.templateSource?.id);
      // A draft that never picked a channel runs in its template's, which the server reads too.
      const channelId = document.channelId ?? (source ? channelOfTemplate(source) : undefined);
      const setup = templateDocument(document);
      const reply = await saveProjectTemplate(api, {
        id: identity.current.id,
        name: trimmed,
        document: channelId === undefined ? setup : { ...setup, channelId },
      });
      if (!reply.ok) {
        identity.current = null;
        setError(`The template wasn't saved. ${reply.message}`);
        return;
      }
      identity.current = null;
      setName("");
      notify(`Template "${trimmed}" saved.`, "success");
      await client.invalidateQueries({ queryKey: templatesKey });
      onClose();
    } catch (failure) {
      setError(
        `The template wasn't saved. ${failure instanceof Error ? failure.message : "Press Save template again."}`,
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title="Save as template"
      description="Keeps this setup's prompts, voice, images, style, outputs and reviews to start the next video from."
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={name.trim() === "" || pending}
            disabledReason={pending ? "Saving the template" : "Name the template first"}
            onClick={() => void save()}
          >
            Save template
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <Field label="Template name" tip="play.template-name">
          <Input
            autoFocus
            value={name}
            maxLength={200}
            placeholder={document.form.title.replace(/\{\{[^}]*\}\}/g, "").trim() || "My setup"}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        {notes.length ? (
          <ul
            aria-label="Left out of the template"
            className="m-0 flex list-none flex-col gap-1 p-0 text-small text-ink-2"
          >
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-small text-ink-2">
            Every keyword keeps its value: the title names none.
          </p>
        )}
        {error ? <Callout tone="danger" title={error} /> : null}
      </form>
    </Dialog>
  );
}
