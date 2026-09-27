import type { CatalogueChanges } from "@app/catalog/merge.js";
import type { RetiredUsage } from "@app/slices/model-upkeep/model.js";
import { slotLabels } from "@app/slices/model-upkeep/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { InfoTip } from "@/components/kit/info-tip";
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
  useCommand({
    id: "settings.check-models",
    title: "Check for new models",
    group: "Settings",
    context: "Models",
    keywords: ["catalogue", "prices", "retired"],
    run: () => {
      if (!check.isPending && status.data?.path) check.mutate();
    },
  });
  return (
    <>
      <div>
        <SectionHead title="Model catalogue" info="settings.models.catalogue">
          <Button disabled={check.isPending || !status.data?.path} onClick={() => check.mutate()}>
            {check.isPending ? "Checking…" : "Check now"}
          </Button>
          <span className="inline-flex items-center gap-1">
            <Button
              variant="quiet"
              disabled={replace.isPending || !status.data?.path}
              onClick={() => replace.mutate()}
            >
              {replace.isPending ? "Replacing…" : "Replace with published file"}
            </Button>
            <InfoTip id="settings.models.replace" />
          </span>
        </SectionHead>
        <dl className="m-0 grid gap-x-6 border-t border-line text-small sm:grid-cols-[160px_minmax(0,1fr)]">
          <dt className="pt-3 font-semibold text-ink sm:border-b sm:border-line sm:pb-3">
            Catalogue file
          </dt>
          <dd className="m-0 min-w-0 border-b border-line pb-3 break-all font-mono text-ink-2 sm:pt-3">
            {status.data?.path ?? "Not available"}
          </dd>
          <dt className="pt-3 font-semibold text-ink sm:border-b sm:border-line sm:pb-3">
            Verified
          </dt>
          <dd className="m-0 border-b border-line pb-3 text-ink-2 sm:pt-3">
            {status.data?.updatedAt ?? "date unavailable"}
          </dd>
          <dt className="pt-3 font-semibold text-ink sm:border-b sm:border-line sm:pb-3">
            Last checked
          </dt>
          <dd className="m-0 border-b border-line pb-3 text-ink-2 sm:pt-3">
            {sync?.checkedAt
              ? `${new Date(sync.checkedAt).toLocaleString()} · ${changeSummary(sync.changes)}`
              : "Not checked yet"}
          </dd>
        </dl>
        {sync !== undefined && sync.changes.retired.length + sync.changes.added.length > 0 ? (
          <div className="mt-3 flex flex-col gap-1 text-small text-ink-2">
            {sync.changes.added.length > 0 ? (
              <span>New: {sync.changes.added.map((row) => row.name).join(", ")}</span>
            ) : null}
            {sync.changes.retired.length > 0 ? (
              <span>Retired: {sync.changes.retired.map((row) => row.name).join(", ")}</span>
            ) : null}
          </div>
        ) : null}
        {problem === null ? null : (
          <p role="alert" className="m-0 mt-3 text-body text-danger">
            {problem}
          </p>
        )}
      </div>
      <section aria-label="Retired models in use">
        <SectionHead title="Retired models in use" info="settings.models.retired">
          <Button
            variant="primary"
            disabled={all.isPending || switchable.length === 0}
            onClick={() => all.mutate()}
          >
            {all.isPending ? "Switching…" : "Switch all"}
          </Button>
        </SectionHead>
        {retired.error ? (
          <p role="alert" className="m-0 mb-2 text-body text-danger">
            {retired.error.message}
          </p>
        ) : null}
        {one.error ? (
          <p role="alert" className="m-0 mb-2 text-body text-danger">
            {one.error.message}
          </p>
        ) : null}
        {usages.length === 0 ? (
          <p className="m-0 text-small text-ink-2">
            {retired.isPending ? "Looking…" : "Nothing uses a retired model."}
          </p>
        ) : (
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
                </div>
                <div className="sl-btn-row">
                  <Button
                    size="small"
                    disabled={usage.blocked !== null || usage.replacement === null || one.isPending}
                    onClick={() => one.mutate(usage)}
                  >
                    {usage.replacement === null
                      ? "No replacement"
                      : `Switch to ${usage.replacement.name}`}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

const noChange: CatalogueChanges = { added: [], retired: [], priced: [] };
