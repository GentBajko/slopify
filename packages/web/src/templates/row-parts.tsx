import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button, ButtonRow } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { Field, Input } from "@/components/kit/field";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { DiffColumns } from "@/library/diff-view";
import { when } from "@/library/history-drawer";
import {
  type ProjectTemplate,
  readProjectTemplate,
  type TemplateSummary,
  templatesKey,
  updateProjectTemplate,
} from "./api";
import { TemplateKeywords } from "./keywords";

// Saves the template again under a new name or with an older version's setup. The server
// refuses a save based on a version that is no longer current, so a change made in another
// tab is never overwritten.
async function saveAgain(
  api: Parameters<typeof readProjectTemplate>[0],
  template: Pick<TemplateSummary, "id" | "version">,
  change: { readonly name: string; readonly document: ProjectTemplate["document"] },
  mutationId: string,
): Promise<ProjectTemplate> {
  const reply = await updateProjectTemplate(api, template.id, {
    baseVersion: template.version,
    mutationId,
    ...change,
  });
  if (!reply.ok) throw new Error(reply.message);
  return reply.value;
}

// Beside the Templates list: the picked template's keywords, with what each feeds, and its
// name while Edit is open. The settings themselves are changed in Play: Use in Play, change
// the draft, then Save a setup.
export function TemplateDetail({
  template,
  editing,
  onDone,
}: {
  readonly template: TemplateSummary | undefined;
  readonly editing: boolean;
  readonly onDone: () => void;
}): ReactElement {
  if (template === undefined)
    return (
      <p className="m-0 py-3 text-small text-ink-2">
        Pick a template to see the keywords it fills. Edit renames it.
      </p>
    );
  return (
    <section aria-label={`Keywords of ${template.name}`} className="flex flex-col gap-4">
      <SectionHead title={template.name} as="h3" className="pb-0" />
      {editing ? (
        <RenameForm
          key={`${template.id}:${String(template.version)}`}
          template={template}
          onDone={onDone}
        />
      ) : null}
      <TemplateKeywords template={template} />
      <p className="m-0 text-small text-ink-2">
        To change the settings, press Use in Play, change the draft, then Save a setup.
      </p>
    </section>
  );
}

function RenameForm({
  template,
  onDone,
}: {
  readonly template: TemplateSummary;
  readonly onDone: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [name, setName] = useState(template.name);
  const mutation = useRef(crypto.randomUUID());
  const rename = useMutation({
    mutationFn: async (next: string) => {
      const current = await readProjectTemplate(api, template.id);
      if (!current.ok) throw new Error(current.message);
      return saveAgain(
        api,
        template,
        { name: next, document: current.value.document },
        mutation.current,
      );
    },
    onSuccess: async () => {
      mutation.current = crypto.randomUUID();
      await client.invalidateQueries({ queryKey: templatesKey });
      onDone();
    },
  });
  const trimmed = name.trim();
  return (
    <div className="flex flex-col gap-2">
      <form
        aria-label={`Edit ${template.name}`}
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed !== "" && trimmed !== template.name) rename.mutate(trimmed);
        }}
      >
        <Field
          label="Template name"
          tip="templates.edit"
          className="min-w-[min(100%,240px)] flex-1"
        >
          <Input
            value={name}
            maxLength={120}
            required
            autoFocus
            disabled={rename.isPending}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <ButtonRow>
          <Button
            type="submit"
            variant="primary"
            disabled={rename.isPending || trimmed === "" || trimmed === template.name}
            disabledReason={rename.isPending ? "Saving the name" : "Type a new name to save it"}
          >
            {rename.isPending ? "Saving…" : "Save name"}
          </Button>
          <Button variant="quiet" onClick={onDone}>
            Done
          </Button>
        </ButtonRow>
      </form>
      <StatusSlot tone="error">
        {rename.error === null ? undefined : `The name wasn't saved: ${rename.error.message}`}
      </StatusSlot>
    </div>
  );
}

// History: every saved version of a template, newest first, any one compared with the current
// setup, and Restore to save an older one again as a new version.
export function TemplateHistoryDrawer({
  template,
  onClose,
}: {
  readonly template: TemplateSummary;
  readonly onClose: () => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const numbers = Array.from({ length: template.version }, (_, index) => template.version - index);
  const versions = useQueries({
    queries: numbers.map((version) => ({
      queryKey: [...templatesKey, template.id, "version", version],
      queryFn: async () => {
        const reply = await readProjectTemplate(api, template.id, version);
        if (!reply.ok) throw new Error(reply.message);
        return reply.value;
      },
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });
  const current = versions[0]?.data;
  const [picked, setPicked] = useState(numbers[1] ?? template.version);
  const shown = versions[numbers.indexOf(picked)]?.data;
  const mutation = useRef(crypto.randomUUID());
  const notify = useToast();
  const restore = useMutation({
    mutationFn: (older: ProjectTemplate) =>
      saveAgain(api, template, { name: older.name, document: older.document }, mutation.current),
    onSuccess: async (saved, older) => {
      mutation.current = crypto.randomUUID();
      notify(
        `Restored version ${String(older.version)} of ${template.name} as version ${String(saved.version)}.`,
        "success",
      );
      await client.invalidateQueries({ queryKey: templatesKey });
      onClose();
    },
  });
  const failed = versions.find((one) => one.error !== null)?.error;
  return (
    <Drawer
      open
      title={`History of ${template.name}`}
      onClose={onClose}
      className="sm:w-[min(1080px,100vw)]"
    >
      <div className="flex flex-col gap-8">
        {failed ? (
          <p role="alert" className="m-0 text-body text-danger">
            {`A version couldn't be read: ${failed.message} Close History and open it again.`}
          </p>
        ) : null}
        <section className="flex flex-col gap-2">
          <SectionHead title="Versions" as="h3" info="templates.history" />
          <List label={`Versions of ${template.name}`}>
            {numbers.map((version, index) => {
              const one = versions[index]?.data;
              return (
                <ListRow
                  key={version}
                  title={`Version ${String(version)}`}
                  selected={version === picked}
                  onSelect={() => setPicked(version)}
                  meta={one === undefined ? "Loading…" : `${one.name} · ${when(one.updatedAt)}`}
                  actions={
                    version === template.version ? (
                      <span className="text-small text-ink-2">Current</span>
                    ) : (
                      <Button
                        size="small"
                        aria-label={`Restore version ${String(version)}`}
                        disabled={one === undefined || restore.isPending}
                        disabledReason={one === undefined ? "Reading the version" : "Restoring"}
                        onClick={() => {
                          if (one !== undefined) restore.mutate(one);
                        }}
                      >
                        Restore
                      </Button>
                    )
                  }
                />
              );
            })}
          </List>
          <StatusSlot tone="error">
            {restore.error === null
              ? undefined
              : `The version wasn't restored: ${restore.error.message}`}
          </StatusSlot>
        </section>
        <section className="flex flex-col gap-3">
          <SectionHead title="Compare with the current version" as="h3" />
          {current === undefined || shown === undefined ? (
            <p className="m-0 text-small text-ink-2">Loading the versions…</p>
          ) : shown.version === current.version ? (
            <p className="m-0 text-small text-ink-2">
              {template.version === 1
                ? "This is the only version so far."
                : "Pick an older version in the list to compare it."}
            </p>
          ) : (
            <>
              {shown.name === current.name ? null : (
                <p className="m-0 text-small text-ink-2">{`Renamed from "${shown.name}" to "${current.name}".`}</p>
              )}
              <DiffColumns
                before={setupText(shown)}
                after={setupText(current)}
                beforeLabel={`Version ${String(shown.version)}`}
                afterLabel={`Version ${String(current.version)} (current)`}
              />
            </>
          )}
        </section>
      </div>
    </Drawer>
  );
}

// The saved setup as text to compare: one line per setting.
function setupText(template: ProjectTemplate): string {
  return JSON.stringify(template.document, null, 1)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !/^[[\]{}],?$/u.test(line))
    .join("\n");
}
