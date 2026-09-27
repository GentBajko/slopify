import type { CatalogueChanges } from "@app/catalog/merge.js";
import type { RetiredUsage } from "@app/slices/model-upkeep/model.js";
import { slotLabels } from "@app/slices/model-upkeep/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
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
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
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

export function CatalogueSettings() {
  const { api } = useApp();
  const cache = useQueryClient();
  const notify = useToast();
  const status = useQuery({
    queryKey: upkeepKeys.catalogue,
    queryFn: () => readCatalogue(api),
    refetchInterval: 30000,
  });
  const retired = useQuery({ queryKey: upkeepKeys.retired, queryFn: () => readRetired(api) });
  const refreshed = async (): Promise<void> => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["provider-models"] }),
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
      notify("Catalogue replaced with the published file.", "success");
      cache.setQueryData(upkeepKeys.catalogue, data);
      await refreshed();
    },
  });
  // A switch changes a template, schedule, draft or project, so those lists reload too.
  const switched = async (): Promise<void> => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: upkeepKeys.retired }),
      cache.invalidateQueries({ queryKey: templatesKey }),
      cache.invalidateQueries({ queryKey: schedulesKey }),
      cache.invalidateQueries({ queryKey: ["play-drafts"] }),
      cache.invalidateQueries({ queryKey: ["projects"] }),
      cache.invalidateQueries({ queryKey: ["project"] }),
    ]);
  };
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
  const sync = status.data?.sync;
  const usages = retired.data ?? [];
  const switchable = usages.filter((usage) => usage.blocked === null && usage.replacement !== null);
  const problem =
    check.error?.message ??
    replace.error?.message ??
    status.error?.message ??
    status.data?.warning ??
    sync?.warning ??
    null;
  return (
    <div>
      <SectionHead
        title="Models"
        info="Slopify checks the published model catalogue and OpenRouter's live model list when it starts and once a day. New models appear, prices follow the providers, and retired models are hidden from the pickers and listed below; nothing you made is changed until you choose Switch. Your own edits to the local file are kept. Replace with published file overwrites the local file instead and saves the previous one alongside it."
      >
        <Button disabled={check.isPending || !status.data?.path} onClick={() => check.mutate()}>
          {check.isPending ? "Checking…" : "Check now"}
        </Button>
        <Button
          variant="ghost"
          disabled={replace.isPending || !status.data?.path}
          onClick={() => replace.mutate()}
        >
          {replace.isPending ? "Replacing…" : "Replace with published file"}
        </Button>
      </SectionHead>
      <RailGroup>
        <Rail className="flex-wrap justify-between gap-y-1">
          <span className="font-semibold">Catalogue file</span>
          <span className="min-w-0 break-all font-mono text-small text-ink2">
            {status.data?.path ?? "Not available"}
          </span>
        </Rail>
        <Rail className="flex-wrap justify-between gap-y-1">
          <span className="font-semibold">Verified</span>
          <span className="text-small text-ink2">
            {status.data?.updatedAt ?? "date unavailable"}
          </span>
        </Rail>
        <Rail className="flex-wrap justify-between gap-y-1">
          <span className="font-semibold">Last checked</span>
          <span className="text-small text-ink2">
            {sync?.checkedAt
              ? `${new Date(sync.checkedAt).toLocaleString()} · ${changeSummary(sync.changes)}`
              : "Not checked yet"}
          </span>
        </Rail>
        {sync !== undefined && sync.changes.retired.length + sync.changes.added.length > 0 ? (
          <Rail className="flex-col items-stretch gap-1 text-small text-ink2">
            {sync.changes.added.length > 0 ? (
              <span>New: {sync.changes.added.map((row) => row.name).join(", ")}</span>
            ) : null}
            {sync.changes.retired.length > 0 ? (
              <span>Retired: {sync.changes.retired.map((row) => row.name).join(", ")}</span>
            ) : null}
          </Rail>
        ) : null}
      </RailGroup>
      {problem === null ? null : (
        <p role="alert" className="mt-2 text-body text-red">
          {problem}
        </p>
      )}
      <section aria-label="Retired models in use" className="mt-8">
        <SectionHead
          title="Retired models in use"
          info="Templates, schedules, drafts and projects with steps still to run that pick a model the provider no longer offers. A run that reaches one stops and says so. Switch replaces only that one model choice with the suggestion shown."
        >
          <Button disabled={all.isPending || switchable.length === 0} onClick={() => all.mutate()}>
            {all.isPending ? "Switching…" : "Switch all"}
          </Button>
        </SectionHead>
        {retired.error ? (
          <p role="alert" className="text-body text-red">
            {retired.error.message}
          </p>
        ) : null}
        {one.error ? (
          <p role="alert" className="mb-2 text-body text-red">
            {one.error.message}
          </p>
        ) : null}
        {usages.length === 0 ? (
          <p className="text-small text-ink2">
            {retired.isPending ? "Looking…" : "Nothing uses a retired model."}
          </p>
        ) : (
          <RailGroup>
            {usages.map((usage) => (
              <Rail key={usage.key} className="flex-wrap gap-y-1">
                <div className="min-w-0 flex-1">
                  <p>
                    <span className="engraved text-ink3">{kindLabels[usage.kind]}</span>{" "}
                    <span className="font-semibold">{usage.name}</span>
                  </p>
                  <p className="text-small text-ink2">
                    {slotLabels[usage.slot]}: {usage.model} (
                    {usage.why === "retired" ? "retired" : "no longer listed"})
                  </p>
                  {usage.blocked === null ? null : (
                    <p className="text-small text-amber">{usage.blocked}</p>
                  )}
                </div>
                <Button
                  disabled={usage.blocked !== null || usage.replacement === null || one.isPending}
                  onClick={() => one.mutate(usage)}
                >
                  {usage.replacement === null
                    ? "No replacement"
                    : `Switch to ${usage.replacement.name}`}
                </Button>
              </Rail>
            ))}
          </RailGroup>
        )}
      </section>
    </div>
  );
}

const noChange: CatalogueChanges = { added: [], retired: [], priced: [] };
