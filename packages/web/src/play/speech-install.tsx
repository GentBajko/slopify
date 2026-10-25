import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import { checkFirstRun, onboardingKey, readFirstRun } from "@/onboarding/api";
import { keys } from "@/queries";

// Under the Narration row's service when the computer's own voice is picked and no speech
// program answers: the commands that install one here, listed apart from the row's sentence
// (the first-run checklist's own words, `slices/onboarding/quick-short.ts`), and Check again
// once they ran. Nothing when this computer installs none that way (macOS, Windows) or another
// voice service can read instead.
export function SpeechInstall(): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const view = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const check = useMutation({
    mutationFn: () => checkFirstRun(api),
    onSuccess: async (next) => {
      client.setQueryData(onboardingKey, next);
      await client.invalidateQueries({ queryKey: keys.providers });
    },
  });
  const install = view.data?.needs.gaps.find((gap) => gap.need === "voice")?.install;
  if (install === undefined) return null;
  return (
    <Fold summary="Install a speech program" className="sl-fields__wide">
      <div className="flex min-w-0 flex-col gap-2 pt-1 pb-2">
        <p className="m-0 text-small text-ink-2">{install.text}</p>
        <pre className="m-0 overflow-x-auto rounded-sm bg-sunken px-3 py-2 font-mono text-small text-ink">
          {install.commands.join("\n")}
        </pre>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            size="small"
            disabled={check.isPending}
            disabledReason="Looking for a speech program"
            onClick={() => check.mutate()}
          >
            Check again
          </Button>
          {check.error === null ? null : (
            <span role="alert" className="text-small text-danger">
              {check.error.message}
            </span>
          )}
        </div>
      </div>
    </Fold>
  );
}
