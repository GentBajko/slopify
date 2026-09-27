import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useApp } from "@/app-context";
import { dismissWelcome, readFirstRun, upkeepKeys } from "@/components/provider-upkeep-api";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { type FreshProviderDefaults, setFreshProviderDefaults } from "@/play/draft-state";

// The first launch's welcome: which AI command-line tools were found and that a video can be
// made without any API key. It also hands Play the providers the server picked from them. A
// placeholder until the guided onboarding replaces it; the data comes from
// GET /api/providers/first-run, which that onboarding can use as it is.
export function Welcome({
  onDefaults,
}: {
  readonly onDefaults?: ((defaults: FreshProviderDefaults) => void) | undefined;
}) {
  const { api } = useApp();
  const cache = useQueryClient();
  const status = useQuery({
    queryKey: upkeepKeys.firstRun,
    queryFn: () => readFirstRun(api),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const defaults = status.data?.defaults;
  useEffect(() => {
    if (defaults === undefined) return;
    setFreshProviderDefaults(defaults);
    onDefaults?.(defaults);
  }, [defaults, onDefaults]);
  const dismiss = useMutation({
    mutationFn: () => dismissWelcome(api),
    onSuccess: () => cache.invalidateQueries({ queryKey: upkeepKeys.firstRun }),
  });
  const data = status.data;
  if (data === undefined || !data.firstRun || data.message === null) return null;
  const found = data.detected.filter((cli) => cli.usable);
  return (
    <RailGroup className="mb-4">
      <Rail className="flex-wrap items-start gap-y-2">
        <div role="status" className="min-w-0 flex-1">
          <p className="font-semibold">{data.message}</p>
          {data.detail === null ? null : <p className="text-small text-ink2">{data.detail}</p>}
          {found.length === 0 ? null : (
            <p className="text-small text-ink2">
              Found:{" "}
              {found
                .map(
                  (cli) =>
                    `${cli.displayName}${cli.version === undefined ? "" : ` ${cli.version}`}`,
                )
                .join(", ")}
            </p>
          )}
          {dismiss.error ? <p className="text-small text-red">{dismiss.error.message}</p> : null}
        </div>
        <Button variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate()}>
          Got it
        </Button>
      </Rail>
    </RailGroup>
  );
}
