import type { DesignDocument } from "@app/slices/designs/schema.js";
import { type DesignSectionId, designSections } from "@app/slices/designs/sections.js";
import type { SectionState } from "@app/slices/template-studio/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { EditorCrumb } from "@/library/editor-frame";
import { keys } from "@/queries";
import { StudioRail } from "@/template-studio/section-rail";
import {
  designTemplateQuery,
  markReady,
  priceWords,
  quoteTemplateSave,
  saveDesignTemplate,
  type TemplateCheck,
  type TemplateView,
} from "../api";
import { MakePieceDrawer } from "./make-piece";
import { SamplePanel } from "./sample-panel";
import { ScheduleRows } from "./schedule-rows";
import { FormatsSection, PictureSection, ScheduleSettings, TextSection } from "./sections";

// A design template's editor: a rail of four sections, the open section's settings, and the
// live sample beside them. Save is always on screen in the sticky bar with what it costs (only
// a new picture costs anything); Mark ready runs the checks and says what to fix, each with
// the section to open.

interface Draft {
  readonly name: string;
  readonly doc: DesignDocument;
}

const sectionOf = (hash: string): DesignSectionId => {
  const id = hash.replace(/^#/, "");
  return designSections.some((one) => one.id === id) ? (id as DesignSectionId) : "picture";
};

export function DesignTemplateRoute({ templateId }: { readonly templateId: string }): ReactElement {
  const { api } = useApp();
  const query = useQuery(designTemplateQuery(api, templateId));
  if (query.error !== null)
    return (
      <LoadFailed
        what="The design template"
        error={query.error}
        fix="Open Library → Designs → Templates and choose it again."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (query.data === undefined)
    return <LoadingBlock label="Loading the design template" rows={3} rowClassName="h-40" />;
  return <TemplateEditor template={query.data} />;
}

function TemplateEditor({ template }: { readonly template: TemplateView }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const [section, setSection] = useState<DesignSectionId>(() =>
    sectionOf(typeof window === "undefined" ? "" : window.location.hash),
  );
  const [draft, setDraft] = useState<Draft | null>(null);
  const [making, setMaking] = useState(false);
  const [status, setStatus] = useState<{ readonly tone: StatusTone; readonly text: string } | null>(
    null,
  );
  const [failing, setFailing] = useState<readonly TemplateCheck[]>([]);
  const name = draft?.name ?? template.name;
  const doc = draft?.doc ?? template.document;
  const dirty = draft !== null;
  const edit = (next: Partial<Draft>) => setDraft({ name, doc, ...next });
  const refresh = () =>
    client.invalidateQueries({ queryKey: [...keys.designTemplates, template.id] });

  const quote = useQuery({
    queryKey: [...keys.designTemplates, template.id, "save-quote", JSON.stringify(doc)],
    queryFn: async () => {
      const result = await quoteTemplateSave(api, template.id, doc);
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
    enabled: dirty,
  });
  const save = useMutation({
    mutationFn: (sample: "make" | "skip") =>
      saveDesignTemplate(api, template.id, {
        baseVersion: template.headVersion,
        name: name.trim(),
        document: doc,
        sample,
        acknowledgedHigh: quote.data?.high ?? 0,
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        setStatus({ tone: "error", text: result.message });
        return;
      }
      setDraft(null);
      setFailing([]);
      const sample = result.value.sample;
      setStatus({
        tone: "success",
        text:
          sample !== null && "refused" in sample
            ? `Saved as version ${String(result.value.template.headVersion)}. ${sample.refused}`
            : `Saved as version ${String(result.value.template.headVersion)}.`,
      });
      await refresh();
      await client.invalidateQueries({ queryKey: keys.designTemplates, exact: true });
    },
    onError: (error) => setStatus({ tone: "error", text: error.message }),
  });
  const ready = useMutation({
    mutationFn: () => markReady(api, template.id, template.headVersion),
    onSuccess: async (result) => {
      if (result.ok) {
        setFailing([]);
        setStatus({
          tone: "success",
          text: `Version ${String(template.headVersion)} is ready: schedules make pieces from it.`,
        });
      } else {
        setFailing(result.checks ?? []);
        setStatus({ tone: "error", text: result.message });
      }
      await refresh();
    },
  });

  // The same states the template studio shows: a check that fails in a section needs a fix;
  // the picture's sample says whether it is being made, waits, failed or is current.
  const stateOf = (id: DesignSectionId): SectionState => {
    if (failing.some((check) => check.fix?.href.endsWith(`#${id}`) === true)) return "needs-fix";
    if (id === "picture") {
      const state = template.sample?.state;
      return state === "making" || state === "queued"
        ? "making"
        : state === "held"
          ? "waiting"
          : state === "failed"
            ? "needs-fix"
            : state === "done"
              ? "current"
              : "off";
    }
    return "off";
  };
  const savePrice = !dirty
    ? undefined
    : quote.data === undefined
      ? "pricing…"
      : quote.data.makesPicture
        ? priceWords(quote.data)
        : "free";
  const isReady = template.readyVersion === template.headVersion;

  return (
    <div>
      <PageHeader
        crumb={
          <EditorCrumb>
            <Link to="/designs" search={{ tab: "templates" }}>
              Design templates
            </Link>
          </EditorCrumb>
        }
        title={name.trim() === "" ? "Untitled template" : name}
        meta={`Version ${String(template.headVersion)} · ${
          isReady
            ? "ready"
            : template.readyVersion === null
              ? "not marked ready"
              : `version ${String(template.readyVersion)} is ready`
        }`}
      />
      <Workspace
        sections={
          <StudioRail
            sections={designSections.map((one) => ({ ...one, state: stateOf(one.id) }))}
            current={section}
            onSelect={(id) => {
              setSection(id);
              window.history.replaceState(null, "", `#${id}`);
            }}
          />
        }
        aside={
          <>
            <SamplePanel template={template} />
            {failing.length === 0 ? null : (
              <Callout tone="danger" title="Not ready yet">
                <ul className="m-0 pl-5">
                  {failing.map((check) => (
                    <li key={check.id}>
                      {check.sentence}{" "}
                      {check.fix === null ? null : check.fix.href.includes("#") ? (
                        <Button
                          variant="quiet"
                          size="small"
                          onClick={() => setSection(sectionOf(check.fix?.href.split("#")[1] ?? ""))}
                        >
                          {`Open ${designSections.find((one) => one.id === sectionOf(check.fix?.href.split("#")[1] ?? ""))?.label ?? check.fix.label}`}
                        </Button>
                      ) : (
                        <a className="sl-link" href={check.fix.href}>
                          {check.fix.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </Callout>
            )}
          </>
        }
        asideLabel="Sample"
      >
        <section aria-label={designSections.find((one) => one.id === section)?.label}>
          {section === "picture" ? (
            <PictureSection
              doc={doc}
              name={name}
              onName={(next) => edit({ name: next })}
              onChange={(next) => edit({ doc: next })}
            />
          ) : section === "text" ? (
            <TextSection doc={doc} onChange={(next) => edit({ doc: next })} />
          ) : section === "formats" ? (
            <FormatsSection doc={doc} onChange={(next) => edit({ doc: next })} />
          ) : (
            <div className="flex min-w-0 flex-col gap-6">
              <ScheduleSettings doc={doc} onChange={(next) => edit({ doc: next })} />
              <ScheduleRows template={template} saved={template.document} dirty={dirty} />
            </div>
          )}
        </section>
      </Workspace>
      <ActionBar
        status={<StatusSlot tone={status?.tone ?? "info"}>{status?.text ?? null}</StatusSlot>}
      >
        <Button
          variant="quiet"
          disabled={
            !(dirty && quote.data?.makesPicture === true && quote.data.high > 0) || save.isPending
          }
          disabledReason="Only a Save that makes a new picture for the sample costs anything."
          onClick={() => save.mutate("skip")}
        >
          Save without a sample
        </Button>
        <Button
          disabled={dirty}
          disabledReason="Save first: a piece is made from the saved version."
          focusableWhenDisabled
          onClick={() => setMaking(true)}
        >
          Make a piece
        </Button>
        <Button
          disabled={dirty || isReady || ready.isPending}
          disabledReason={
            dirty
              ? "Save first: a version is marked ready as saved."
              : isReady
                ? "This version is already ready."
                : undefined
          }
          focusableWhenDisabled
          onClick={() => {
            setStatus(null);
            ready.mutate();
          }}
        >
          Mark ready
        </Button>
        <Button
          variant="primary"
          disabled={!dirty || save.isPending || quote.isFetching || name.trim() === ""}
          disabledReason={
            !dirty
              ? "Nothing to save."
              : name.trim() === ""
                ? "Give the template a name under Picture."
                : "Working out the price…"
          }
          focusableWhenDisabled
          onClick={() => {
            setStatus(null);
            save.mutate("make");
          }}
        >
          {savePrice === undefined ? "Save" : `Save · ${savePrice}`}
        </Button>
      </ActionBar>
      <MakePieceDrawer
        key={`${String(template.headVersion)}-${String(making)}`}
        template={template}
        open={making}
        onClose={() => setMaking(false)}
      />
    </div>
  );
}
