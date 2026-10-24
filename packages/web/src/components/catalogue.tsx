import type { CatalogueChanges } from "@app/catalog/merge.js";
import type { RetiredUsage } from "@app/slices/model-upkeep/model.js";
import { slotLabels } from "@app/slices/model-upkeep/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { Fold } from "@/components/kit/fold";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import {
  checkCatalogue,
  readCatalogue,
  readRetired,
  refreshCatalogue,
  switchAllRetired,
  switchRetired,
  upkeepKeys,
} from "@/components/provider-upkeep-api";
import { startedAt } from "@/lib/utils";
import { keys } from "@/queries";
import { schedulesKey } from "@/schedules/api";
import { templatesKey } from "@/templates/api";

const kindLabels: Readonly<Record<RetiredUsage["kind"], string>> = {
  template: "Template",
  schedule: "Schedule",
  draft: "Draft",
  project: "Project",
};

function changeSummary(changes: CatalogueChanges): string {
  const parts = [
    changes.added.length > 0 ? `${changes.added.length} new` : null,
    changes.priced.length > 0 ? `${changes.priced.length} repriced` : null,
    changes.retired.length > 0 ? `${changes.retired.length} retired` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? "No changes" : parts.join(", ");
}

// Models: what a model choice still needs, and the list of models itself. Two parts, drawn in
// that order on the page: retired models still in use first (only while there are some), the
// catalogue last, its file and dates folded away.
function useSwitched(): () => Promise<void> {
  const cache = useQueryClient();
  // A switch changes a template, schedule, draft or project, so those lists reload too.
  return async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: upkeepKeys.retired }),
      cache.invalidateQueries({ queryKey: templatesKey }),
      cache.invalidateQueries({ queryKey: schedulesKey }),
      cache.invalidateQueries({ queryKey: keys.playDrafts }),
      cache.invalidateQueries({ queryKey: ["projects"] }),
      cache.invalidateQueries({ queryKey: ["project"] }),
    ]);
  };
}

// Templates, schedules, drafts and projects still picking a model the provider retired, each
// with its switch, and Switch all when more than one can switch. Nothing shows while nothing
// uses a retired model.
export function RetiredModelsInUse(): ReactElement | null {
  const { api } = useApp();
  const notify = useToast();
  const switched = useSwitched();
  const retired = useQuery({ queryKey: upkeepKeys.retired, queryFn: () => readRetired(api) });
  const one = useMutation({
    mutationFn: (usage: RetiredUsage) => switchRetired(api, usage),
    onSuccess: switched,
  });
  const all = useMutation({
    mutationFn: () => switchAllRetired(api),
    onSuccess: async (result) => {
      notify(
        result.failed.length === 0
          ? `Switched ${result.switched} ${result.switched === 1 ? "use" : "uses"}.`
          : `Switched ${result.switched}; ${result.failed.length} could not be switched: ${result.failed[0]?.message ?? ""}`,
        result.failed.length === 0 ? "success" : "error",
      );
      await switched();
    },
  });
  const usages = retired.data ?? [];
  const switchable = usages.filter((usage) => usage.blocked === null && usage.replacement !== null);
  if (retired.error !== null)
    return (
      <p role="alert" className="m-0 text-body text-danger">
        {retired.error.message}
      </p>
    );
  if (usages.length === 0) return null;
  return (
    <section aria-label="Retired models in use">
      <SectionHead
        title="Retired models in use"
        meta="A run that reaches one of these stops. Switch picks the suggested model instead."
      >
        {switchable.length > 1 ? (
          <Button variant="primary" disabled={all.isPending} onClick={() => all.mutate()}>
            {all.isPending ? "Switching…" : `Switch all ${String(switchable.length)}`}
          </Button>
        ) : null}
      </SectionHead>
      {one.error ? (
        <p role="alert" className="m-0 mb-2 text-body text-danger">
          {one.error.message}
        </p>
      ) : null}
      <ul aria-label="Retired models in use" className="sl-list m-0 list-none p-0">
        {usages.map((usage) => (
          <li key={usage.key} className="sl-row max-sm:grid-cols-1">
            <div className="min-w-0">
              <p className="m-0">
                <span className="sl-kicker">{kindLabels[usage.kind]}</span>{" "}
                <span className="font-semibold">{usage.name}</span>
              </p>
              <p className="m-0 text-small text-ink-2">
                {slotLabels[usage.slot]}: {usage.model} (
                {usage.why === "retired" ? "retired" : "no longer listed"})
              </p>
              {usage.blocked === null ? null : (
                <p className="m-0 text-small text-waiting">{usage.blocked}</p>
              )}
              {usage.replacement === null ? (
                <p className="m-0 text-small text-ink-2">
                  No replacement is suggested: pick another model in its {usage.kind}.
                </p>
              ) : null}
            </div>
            {usage.replacement === null || usage.blocked !== null ? null : (
              <ButtonRow>
                <Button size="small" disabled={one.isPending} onClick={() => one.mutate(usage)}>
                  {`Switch to ${usage.replacement.name}`}
                </Button>
              </ButtonRow>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CatalogueSettings(): ReactElement {
  const { api } = useApp();
  const cache = useQueryClient();
  const notify = useToast();
  const status = useQuery({
    queryKey: upkeepKeys.catalogue,
    queryFn: () => readCatalogue(api),
    refetchInterval: 30000,
  });
  const refreshed = async (): Promise<void> => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: keys.providerModels }),
      cache.invalidateQueries({ queryKey: upkeepKeys.retired }),
    ]);
  };
  const check = useMutation({
    mutationFn: () => checkCatalogue(api),
    onSuccess: async (data) => {
      cache.setQueryData(upkeepKeys.catalogue, data);
      notify(
        data.sync?.warning ??
          `Model list checked: ${changeSummary(data.sync?.changes ?? noChange)}.`,
        data.sync?.warning ? "error" : "success",
      );
      await refreshed();
    },
  });
  const replace = useMutation({
    mutationFn: () => refreshCatalogue(api),
    onSuccess: async (data) => {
      notify("The model list was replaced with the published one.", "success");
      cache.setQueryData(upkeepKeys.catalogue, data);
      await refreshed();
    },
  });
  const sync = status.data?.sync;
  const problem =
    check.error?.message ??
    replace.error?.message ??
    status.error?.message ??
    status.data?.warning ??
    sync?.warning ??
    null;
  useCommand({
    id: "settings.check-models",
    title: "Check for new models",
    group: "Settings",
    context: "Models",
    keywords: ["catalog", "catalogue", "prices", "retired"],
    run: () => {
      if (!check.isPending && status.data?.path) check.mutate();
    },
  });
  return (
    <section aria-label="Model list">
      <SectionHead
        title="Model list"
        meta={
          sync?.checkedAt
            ? `New models, prices and retirements, checked once a day. Last checked ${startedAt(sync.checkedAt)}: ${changeSummary(sync.changes).toLowerCase()}.`
            : "New models, prices and retirements, checked once a day."
        }
      >
        {status.data?.path === undefined ? null : (
          <Button disabled={check.isPending} onClick={() => check.mutate()}>
            {check.isPending ? "Checking…" : "Check for new models"}
          </Button>
        )}
      </SectionHead>
      {sync !== undefined && sync.changes.retired.length + sync.changes.added.length > 0 ? (
        <div className="mb-3 flex flex-col gap-1 text-small text-ink-2">
          {sync.changes.added.length > 0 ? (
            <span>New: {sync.changes.added.map((row) => row.name).join(", ")}</span>
          ) : null}
          {sync.changes.retired.length > 0 ? (
            <span>Retired: {sync.changes.retired.map((row) => row.name).join(", ")}</span>
          ) : null}
        </div>
      ) : null}
      {problem === null ? null : (
        <p role="alert" className="m-0 mb-3 text-body text-danger">
          {problem}
        </p>
      )}
      <Fold
        summary="Catalog file"
        state={
          status.data?.updatedAt === undefined ? undefined : `Published ${status.data.updatedAt}`
        }
      >
        <div className="flex flex-col gap-3 pt-2 text-small text-ink-2">
          <p className="m-0 min-w-0 break-all font-mono">{status.data?.path ?? "Not available"}</p>
          <p className="m-0">
            The local copy of the published list the pickers and cost estimates use. Your own edits
            to it are kept when it is checked.
          </p>
          {status.data?.path === undefined ? null : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="quiet" disabled={replace.isPending} onClick={() => replace.mutate()}>
                {replace.isPending ? "Replacing…" : "Replace with the published file"}
              </Button>
              <span>Drops your edits; the old file is kept beside it.</span>
            </div>
          )}
        </div>
      </Fold>
    </section>
  );
}

const noChange: CatalogueChanges = { added: [], retired: [], priced: [] };
