import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";

import { read } from "@/http";

interface Status {
  readonly updatedAt?: string;
  readonly path?: string;
  readonly warning: string | null;
}
export function CatalogueSettings() {
  const { api } = useApp();
  const cache = useQueryClient();
  const notify = useToast();
  const status = useQuery({
    queryKey: ["catalogue"],
    queryFn: async () => read<Status>(await api.fetch(`${api.origin}/api/providers/catalogue`)),
    refetchInterval: 30000,
  });
  const refresh = useMutation({
    mutationFn: async () =>
      read<Status>(
        await api.fetch(`${api.origin}/api/providers/catalogue/refresh`, { method: "POST" }),
      ),
    onSuccess: (data) => {
      notify("Catalogue updated.", "success");
      cache.setQueryData(["catalogue"], data);
      void cache.invalidateQueries({ queryKey: ["provider-models"] });
    },
  });
  return (
    <div>
      <SectionHead
        title="Models"
        info="The catalogue lists supported text, image and speech models, their prices and request limits. Local YAML edits load automatically; model pickers refresh every 30 seconds. Refresh replaces your local file with the published catalogue and saves the previous file alongside it."
      >
        <Button disabled={refresh.isPending || !status.data?.path} onClick={() => refresh.mutate()}>
          {refresh.isPending ? "Refreshing…" : "Refresh published catalogue"}
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
      </RailGroup>
      {status.data?.warning || status.error || refresh.error ? (
        <p role="alert" className="mt-2 text-body text-red">
          {refresh.error?.message ?? status.error?.message ?? status.data?.warning}
        </p>
      ) : null}
    </div>
  );
}
