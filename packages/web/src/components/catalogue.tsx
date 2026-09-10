import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApp } from "@/app-context";
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
      cache.setQueryData(["catalogue"], data);
      void cache.invalidateQueries({ queryKey: ["provider-models"] });
    },
  });
  return (
    <section className="rounded-panel border border-line bg-panel p-4">
      <h2 className="engraved text-ink3">Models and request limits</h2>
      <p className="my-2 text-body text-ink2">
        The catalogue lists supported text, image and speech models, their prices and request
        limits. Local YAML edits load automatically; model pickers refresh every 30 seconds.
      </p>
      {status.data?.path ? (
        <p className="my-2 break-all font-mono text-small">{status.data.path}</p>
      ) : null}
      <p className="mb-3 text-small text-ink2">
        Verified {status.data?.updatedAt ?? "date unavailable"}. Refresh replaces your local file
        with the published catalogue and saves the previous file alongside it.
      </p>
      <Button disabled={refresh.isPending || !status.data?.path} onClick={() => refresh.mutate()}>
        {refresh.isPending ? "Refreshing…" : "Refresh published catalogue"}
      </Button>
      {status.data?.warning || status.error || refresh.error ? (
        <p role="alert" className="mt-2 text-body text-red">
          {refresh.error?.message ?? status.error?.message ?? status.data?.warning}
        </p>
      ) : null}
      {refresh.isSuccess ? (
        <p role="status" className="mt-2 text-small text-green">
          Catalogue updated.
        </p>
      ) : null}
    </section>
  );
}
