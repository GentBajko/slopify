import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Fold } from "@/components/kit/fold";
import { checkFirstRun, onboardingKey, readFirstRun } from "@/onboarding/api";
import { keys } from "@/queries";
import { speechFix } from "./problems";

// Under the Narration row's service when the computer's own voice is picked and no speech
// program answers: how to get one, apart from the row's sentence, and Check again once done.
// The commands are the first-run checklist's own (`slices/onboarding/quick-short.ts`), which
// lists them while nothing else can narrate. Elsewhere (macOS, Windows, or another voice
// service already answering) the rest of the server's sentence says what to do. Nothing when
// neither has anything to add.
export function SpeechInstall({
  issue,
}: {
  // The server's sentence on the computer's voice; its first sentence is the row's.
  readonly issue: string | undefined;
}): ReactElement | null {
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
  if (view.isPending) return null;
  const install = view.data?.needs.gaps.find((gap) => gap.need === "voice")?.install;
  const rest = speechFix(issue);
  if (install === undefined && rest === undefined) return null;
  return (
    <Fold summary="Install a speech program" className="sl-fields__wide">
      <div className="flex min-w-0 flex-col gap-2 pt-1 pb-2">
        {install === undefined ? (
          <p className="m-0 text-small text-ink-2">{rest}</p>
        ) : (
          <>
            <p className="m-0 text-small text-ink-2">{install.text}</p>
            <pre className="m-0 overflow-x-auto rounded-sm bg-sunken px-3 py-2 font-mono text-small text-ink">
              {install.commands.join("\n")}
            </pre>
          </>
        )}
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
