import type { DesignView } from "@app/slices/designs/model.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { useDocumentTitle } from "@/components/document-title";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Field, Textarea } from "@/components/kit/field";
import { PageHeader } from "@/components/kit/layout";
import { TextLink } from "@/components/kit/link";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { Tabs } from "@/components/kit/tabs";
import { keys } from "@/queries";
import {
  continueFrom,
  type DesignReply,
  designQuery,
  editPicture,
  makeArtwork,
  priceWords,
  quoteArtwork,
  quoteEdit,
  retryStep,
  updateDesign,
} from "./api";
import { FormatsPanel, TextPanel } from "./design-panels";
import { DesignPicture, DesignVersions, headStep } from "./design-picture";
import { blankDocument } from "./document";
import { MadeWith } from "./made-with";

// One design: its picture with every version, and the tabs that change it. Edit sends the
// picture to an image model with what to change (paid, quoted on the button); Text and Formats
// change Slopify's own layer and save as they are typed (free). The sticky bar carries what the
// open tab does: Edit's paid action (disabled while a picture is being made, never taken away
// while Edit is open), and for Text and Formats only the saving status, as they save by
// themselves.

type Tab = "edit" | "text" | "formats";

interface Status {
  readonly tone: StatusTone;
  readonly text: string;
  readonly retry?: string | undefined;
}

export function DesignRoute({ designId }: { readonly designId: string }): ReactElement {
  const { api } = useApp();
  const query = useQuery(designQuery(api, designId));
  if (query.error !== null)
    return (
      <LoadFailed
        what="The design"
        error={query.error}
        fix="Open Designs and choose it again."
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  if (query.data === undefined)
    return <LoadingBlock label="Loading the design" rows={3} rowClassName="h-40" />;
  return <DesignEditor key={query.data.id} design={query.data} />;
}

function DesignEditor({ design }: { readonly design: DesignView }): ReactElement {
  const { api } = useApp();
  useDocumentTitle(`${design.name} · Design`);
  const client = useQueryClient();
  const [tab, setTab] = useState<Tab>("edit");
  const [instruction, setInstruction] = useState("");
  const [model, setModel] = useState(() => ({
    provider: (design.document as DesignDocument | null)?.picture.provider ?? "fal",
    model: (design.document as DesignDocument | null)?.picture.model ?? "fal-ai/flux-2",
  }));
  const [draft, setDraft] = useState<{
    readonly doc: DesignDocument | undefined;
    readonly values: Readonly<Record<string, string>>;
  } | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [newQuote, setNewQuote] = useState<CostEstimate | undefined>(undefined);
  const base = useRef(design.updatedAt);
  base.current = draft === null ? design.updatedAt : base.current;

  const doc = draft?.doc ?? (design.document as DesignDocument | null) ?? undefined;
  const values = draft?.values ?? design.values;
  const head = headStep(design);
  const making = design.steps.find((step) => step.state === "making");
  const failed = [...design.steps].reverse().find((step) => step.state === "failed");
  const needsArtwork =
    design.kind === "design" && doc?.picture.source === "generate" && head === undefined;

  const store = (view: DesignView) => {
    client.setQueryData(designQuery(api, design.id).queryKey, view);
    void client.invalidateQueries({ queryKey: keys.designs, exact: true });
  };
  const answer = (result: DesignReply<DesignView>, done: string) => {
    if (result.ok) {
      store(result.value);
      setStatus({ tone: "success", text: done });
      setNewQuote(undefined);
      return true;
    }
    if (result.reason === "cost-changed") setNewQuote(result.quote);
    setStatus({ tone: "error", text: result.message });
    return false;
  };

  // Free changes save a moment after the last keystroke.
  // One save at a time, each made on the version the one before it left.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const save = useMutation({
    mutationFn: (next: NonNullable<typeof draft>) => {
      const run = chain.current.then(async () => {
        const result = await updateDesign(api, design.id, {
          baseUpdatedAt: base.current,
          ...(next.doc === undefined ? {} : { document: next.doc }),
          values: next.values,
        });
        if (result.ok) base.current = result.value.updatedAt;
        return result;
      });
      chain.current = run.catch(() => undefined);
      return run;
    },
    onSuccess: (result) => {
      if (result.ok) {
        store(result.value);
        setDraft((current) => (current === pendingSave.current ? null : current));
        setStatus({ tone: "success", text: "Saved." });
      } else setStatus({ tone: "error", text: result.message });
    },
  });
  const pendingSave = useRef<typeof draft>(null);
  const saveDraft = save.mutate;
  useEffect(() => {
    if (draft === null) return;
    const timer = setTimeout(() => {
      pendingSave.current = draft;
      saveDraft(draft);
    }, 600);
    return () => clearTimeout(timer);
  }, [draft, saveDraft]);
  const change = (next: {
    doc?: DesignDocument | undefined;
    values?: Readonly<Record<string, string>>;
  }) => setDraft({ doc: next.doc ?? doc, values: next.values ?? values });

  const editQuote = useQuery({
    queryKey: [...keys.designs, design.id, "quote", model.provider, model.model],
    queryFn: async () => {
      const result = await quoteEdit(api, design.id, model);
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
    enabled: model.model !== "" && !needsArtwork,
  });
  const artQuote = useQuery({
    queryKey: [
      ...keys.designs,
      design.id,
      "artwork-quote",
      doc?.picture.model,
      doc?.picture.prompt,
    ],
    queryFn: async () => {
      const result = await quoteArtwork(api, design.id);
      if (!result.ok) throw new Error(result.message);
      return result.value;
    },
    enabled: needsArtwork && draft === null,
  });
  const quote = newQuote ?? (needsArtwork ? artQuote.data : editQuote.data);

  const paid = useMutation({
    mutationFn: async () => {
      const acknowledgedHigh = quote?.high ?? 0;
      // The button says when the price is unknown: pressing it accepts that.
      const acknowledgedUnknown = (quote?.unknown ?? 0) > 0;
      return needsArtwork
        ? makeArtwork(api, design.id, {
            mutationId: crypto.randomUUID(),
            acknowledgedHigh,
            acknowledgedUnknown,
          })
        : editPicture(api, design.id, {
            mutationId: crypto.randomUUID(),
            fromStepId: head?.id ?? "",
            instruction: instruction.trim(),
            provider: model.provider,
            model: model.model,
            acknowledgedHigh,
            acknowledgedUnknown,
          });
    },
    onSuccess: (result) => {
      if (answer(result, needsArtwork ? "Making the artwork…" : "Making the new version…"))
        setInstruction("");
    },
    onError: (error) => setStatus({ tone: "error", text: error.message }),
  });
  // Try again is paid again: the first press shows its price, the second pays it.
  const [retryPrice, setRetryPrice] = useState<{
    readonly stepId: string;
    readonly quote: CostEstimate;
  } | null>(null);
  const step = useMutation({
    mutationFn: async (input: {
      readonly kind: "retry" | "continue";
      readonly stepId: string;
    }): Promise<DesignReply<DesignView> | "priced"> => {
      if (input.kind === "continue") return continueFrom(api, design.id, input.stepId);
      if (retryPrice?.stepId === input.stepId)
        return retryStep(api, design.id, input.stepId, {
          acknowledgedHigh: retryPrice.quote.high,
          acknowledgedUnknown: retryPrice.quote.unknown > 0,
        });
      const target = design.steps.find((one) => one.id === input.stepId);
      const priced =
        target?.kind === "edit"
          ? await quoteEdit(api, design.id, {
              provider: target.provider ?? "",
              model: target.model ?? "",
            })
          : await quoteArtwork(api, design.id);
      if (!priced.ok) return priced;
      setRetryPrice({ stepId: input.stepId, quote: priced.value });
      return "priced";
    },
    onSuccess: (result, input) => {
      if (result === "priced") return;
      if (input.kind === "retry") setRetryPrice(null);
      if (!result.ok && result.reason === "cost-changed" && result.quote !== undefined)
        setRetryPrice({ stepId: input.stepId, quote: result.quote });
      answer(
        result,
        input.kind === "retry" ? "Trying again…" : "The next edit starts from that version.",
      );
    },
  });
  const project = useMutation({
    mutationFn: (projectId: string | null) =>
      updateDesign(api, design.id, { baseUpdatedAt: base.current, projectId }),
    onSuccess: (result) => {
      if (result.ok) base.current = result.value.updatedAt;
      answer(result, "Saved.");
    },
  });

  const turnIntoDesign = () => change({ doc: blankDocument("picture") });

  const busy = making !== undefined || paid.isPending;
  const blocked = busy
    ? "Wait for the picture being made."
    : needsArtwork
      ? doc?.picture.prompt.trim() === ""
        ? "Describe the artwork under Edit first."
        : draft !== null
          ? "Wait for your change to be saved."
          : undefined
      : head?.state !== "ready"
        ? "There is no picture to edit yet."
        : instruction.trim() === ""
          ? "Write what to change first."
          : undefined;
  const retrying =
    retryPrice === null ? undefined : design.steps.find((one) => one.id === retryPrice.stepId);
  const shown: Status | null =
    making !== undefined
      ? {
          tone: "info",
          text: `Making version ${String(making.n)} with ${making.model ?? "the image model"}…`,
        }
      : retryPrice !== null && retrying?.state === "failed"
        ? {
            tone: "warning",
            text: `Trying version ${String(retrying.n)} again asks the provider again, and is paid again: ${priceWords(retryPrice.quote)}. Press Try again to make it.`,
            retry: retryPrice.stepId,
          }
        : status?.tone === "error"
          ? status
          : failed !== undefined && failed.n > (head?.n ?? 0)
            ? { tone: "error", text: failed.error ?? "The last version failed.", retry: failed.id }
            : save.isPending
              ? { tone: "info", text: "Saving…" }
              : status;

  return (
    <>
      <PageHeader
        crumb={<TextLink to="/designs">Designs</TextLink>}
        title={design.name}
        meta={`${design.kind === "edit" ? "Picture edit" : "Designed piece"} · ${String(design.steps.length)} ${design.steps.length === 1 ? "version" : "versions"}`}
      />
      {/* Picture, then the tabs that change it, then the versions: on a phone the tabs come
          straight under the picture; on a wide window the versions sit under the picture. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <DesignPicture design={design} doc={doc} />
        </div>
        <section
          aria-label="Change the design"
          className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1"
        >
          <Tabs<Tab>
            label="Change the design"
            idPrefix="design"
            value={tab}
            onChange={setTab}
            items={[
              { id: "edit", label: "Edit" },
              { id: "text", label: "Text" },
              { id: "formats", label: "Formats" },
            ]}
          />
          <div role="tabpanel" id={`design-panel-${tab}`} aria-labelledby={`design-tab-${tab}`}>
            {tab === "edit" ? (
              <div className="flex min-w-0 flex-col gap-3">
                {needsArtwork && doc !== undefined ? (
                  <Field
                    label="Describe the artwork"
                    help="No words: Slopify adds the text."
                    tip="library.design.artwork"
                  >
                    <Textarea
                      rows={4}
                      value={doc.picture.prompt}
                      onChange={(event) =>
                        change({
                          doc: { ...doc, picture: { ...doc.picture, prompt: event.target.value } },
                        })
                      }
                    />
                  </Field>
                ) : (
                  <Field
                    label="What to change"
                    help="Everything you don't mention stays as it is."
                    tip="library.design.change"
                  >
                    <Textarea
                      rows={4}
                      maxLength={4000}
                      value={instruction}
                      placeholder="Make the sky a warm sunset, keep the faces as they are"
                      onChange={(event) => setInstruction(event.target.value)}
                    />
                  </Field>
                )}
                {needsArtwork && doc !== undefined ? (
                  <MadeWith
                    provider={doc.picture.provider}
                    model={doc.picture.model}
                    onChange={(next) =>
                      change({ doc: { ...doc, picture: { ...doc.picture, ...next } } })
                    }
                  />
                ) : (
                  <MadeWith provider={model.provider} model={model.model} onChange={setModel} />
                )}
              </div>
            ) : tab === "text" ? (
              <TextPanel
                design={design}
                doc={doc}
                values={values}
                onDoc={(next) => change({ doc: next })}
                onValues={(next) => change({ values: next })}
                onTurnIntoDesign={turnIntoDesign}
              />
            ) : (
              <FormatsPanel
                design={design}
                doc={doc}
                dirty={draft !== null || save.isPending}
                onDoc={(next) => change({ doc: next })}
                onProject={(projectId) => project.mutate(projectId)}
                onTurnIntoDesign={turnIntoDesign}
              />
            )}
          </div>
        </section>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <DesignVersions
            design={design}
            pending={step.isPending || busy}
            onContinue={(stepId) => step.mutate({ kind: "continue", stepId })}
            onRetry={(stepId) => step.mutate({ kind: "retry", stepId })}
          />
        </div>
      </div>
      <ActionBar
        status={
          <StatusSlot tone={shown?.tone ?? "info"}>
            {shown === null ? null : shown.retry === undefined ? (
              shown.text
            ) : (
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 truncate" title={shown.text}>
                  {shown.text}
                </span>
                <Button
                  size="small"
                  onClick={() => step.mutate({ kind: "retry", stepId: shown.retry ?? "" })}
                >
                  Try again
                </Button>
              </span>
            )}
          </StatusSlot>
        }
      >
        {tab === "edit" ? (
          <Button
            variant="primary"
            disabled={blocked !== undefined}
            disabledReason={blocked}
            focusableWhenDisabled
            onClick={() => {
              setStatus(null);
              paid.mutate();
            }}
          >
            {`${needsArtwork ? "Make artwork" : "Edit"} · ${priceWords(quote)}`}
          </Button>
        ) : null}
      </ActionBar>
    </>
  );
}
