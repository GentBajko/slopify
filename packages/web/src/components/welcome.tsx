import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { dismissWelcome, readFirstRun, upkeepKeys } from "@/components/provider-upkeep-api";
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
    <Callout
      title={data.message}
      actions={
        <Button
          variant="quiet"
          size="small"
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate()}
        >
          Got it
        </Button>
      }
    >
      {data.detail === null ? null : <p className="m-0">{data.detail}</p>}
      {found.length === 0 ? null : (
        <p className="m-0">
          Found:{" "}
          {found
            .map((cli) => `${cli.displayName}${cli.version === undefined ? "" : ` ${cli.version}`}`)
            .join(", ")}
        </p>
      )}
      {dismiss.error ? (
        <p role="alert" className="m-0 text-danger">
          {dismiss.error.message}
        </p>
      ) : null}
    </Callout>
  );
}
