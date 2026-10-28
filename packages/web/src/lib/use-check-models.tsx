import { costPhrase } from "@app/slices/model-checks/rules.js";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/kit/dialog";
import {
  type CheckEstimate,
  costsMoney,
  estimateChecks,
  modelChecksKey,
  startChecks,
} from "@/lib/model-checks";
import { modelsKey } from "@/lib/models";

// ceiling: the checks run in the background; the lists are read again this long after they
// start, and the pickers' own 30-second refresh picks up the rest.
const rereadMs = 5000;

export interface CheckModels {
  readonly check: (models?: readonly string[]) => void;
  readonly pending: boolean;
  // What happened, in a sentence: started, or why not.
  readonly message: string | undefined;
  readonly dialog: ReactElement;
}

// Check models with the price first: a check that costs money opens a confirm dialog with
// the estimate; a free one (a CLI's plan, the system voice) goes straight out.
export function useCheckModels(provider: string, providerName: string): CheckModels {
  const { api } = useApp();
  const client = useQueryClient();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | undefined>();
  const [asking, setAsking] = useState<
    { readonly estimate: CheckEstimate; readonly models: readonly string[] | undefined } | undefined
  >();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const start = async (
    models: readonly string[] | undefined,
    confirmed: number | undefined,
  ): Promise<void> => {
    const started = await startChecks(api, provider, models, confirmed);
    setMessage(
      started.count === 0
        ? "Nothing to check here."
        : `Checking ${String(started.count)} model${started.count === 1 ? "" : "s"} in the background.`,
    );
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void client.invalidateQueries({ queryKey: modelsKey(provider) });
      void client.invalidateQueries({ queryKey: modelChecksKey });
    }, rereadMs);
  };
  const run = (work: () => Promise<void>): void => {
    setPending(true);
    setMessage(undefined);
    work()
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : String(error)))
      .finally(() => setPending(false));
  };

  const check = (models?: readonly string[]): void =>
    run(async () => {
      const estimate = await estimateChecks(api, provider, models);
      if (costsMoney(estimate)) setAsking({ estimate, models });
      else await start(models, undefined);
    });

  const count = asking?.estimate.count ?? 0;
  const dialog = (
    <ConfirmDialog
      open={asking !== undefined}
      tone="primary"
      title={`Check ${String(count)} ${providerName === "" ? "" : `${providerName} `}model${count === 1 ? "" : "s"}?`}
      consequence={`Each model gets one small request, so this costs ${costPhrase(asking?.estimate.totalDollars ?? 0, asking?.estimate.unpriced ?? 0)}.`}
      confirmLabel="Check models"
      cancelLabel="Cancel"
      pending={pending}
      onCancel={() => setAsking(undefined)}
      onConfirm={() => {
        const ask = asking;
        setAsking(undefined);
        if (ask !== undefined) run(() => start(ask.models, ask.estimate.totalDollars));
      }}
    />
  );
  return { check, pending, message, dialog };
}
