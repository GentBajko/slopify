import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { type Fix, fixFor, stageProvider } from "@app/slices/fixes/rules.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createContext, useContext, useState } from "react";
import { ConfirmDialog } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { keys } from "@/queries";
import type { ProjectTab } from "./revision-workspace.js";
import type { ProjectActions } from "./use-actions.js";

// Lets a failed step's fix-it button open the project's Edit tab, where prompts and models
// are changed. Absent outside the project page.
export const OpenProjectTab = createContext<((tab: ProjectTab) => void) | undefined>(undefined);

export function fixOf(stage: Stage, project: ProjectSummary): Fix | undefined {
  if (stage.state !== "failed") return undefined;
  return fixFor({
    stage: stage.kind,
    kind: stage.failureKind,
    reason: stage.failureReason,
    provider: stageProvider(project.config, stage.kind),
  });
}

// The button that fixes a failed step, or walks through fixing it, beside its Retry
// (`slices/fixes/rules.ts` decides which).
export function FixIt({
  fix,
  stage,
  providers,
  actions,
}: {
  readonly fix: Fix;
  readonly stage: Stage;
  readonly providers: readonly ProviderStatus[];
  readonly actions: ProjectActions;
}) {
  const openTab = useContext(OpenProjectTab);
  const [softening, setSoftening] = useState(false);
  switch (fix.kind) {
    case "sign-in":
      return <SignIn fix={fix} providers={providers} />;
    case "provider-settings":
      return (
        <Button asChild variant="outline">
          <Link to="/settings" search={{ section: "providers" }}>
            {fix.label}
          </Link>
        </Button>
      );
    case "free-space":
      return (
        <Button asChild variant="outline">
          <Link to="/settings" search={{ section: "storage" }}>
            {fix.label}
          </Link>
        </Button>
      );
    case "switch-model":
      return (
        <Button
          type="button"
          variant="outline"
          disabled={openTab === undefined}
          onClick={() => openTab?.("edit")}
        >
          {fix.label}
        </Button>
      );
    case "refused":
      return (
        <span className="flex flex-wrap items-center gap-2">
          {fix.soften ? (
            <Button
              type="button"
              variant="outline"
              disabled={actions.pending}
              onClick={() => setSoftening(true)}
            >
              {actions.performing?.kind === "soften" ? "Softening…" : fix.label}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={fix.soften ? "ghost" : "outline"}
            disabled={openTab === undefined}
            onClick={() => openTab?.("edit")}
          >
            Edit prompt
          </Button>
          <ConfirmDialog
            open={softening}
            title="Soften the refused prompt and try again?"
            consequence="Your project's AI model rewrites each refused prompt without what a content filter could flag, keeping the scene and style. The new wording appears on this step as it is written, then the image is drawn again from it and keeps it as its prompt. The AI call and the new image are charged like any other."
            verb="Soften and retry"
            pending={actions.pending}
            onConfirm={() => {
              setSoftening(false);
              actions.run({ kind: "soften", stage: stage.kind });
            }}
            onCancel={() => setSoftening(false)}
          />
        </span>
      );
  }
}

// A signed-out CLI: the command to run on the computer that has it, then Re-check reads
// the CLI's status again.
function SignIn({
  fix,
  providers,
}: {
  readonly fix: Extract<Fix, { readonly kind: "sign-in" }>;
  readonly providers: readonly ProviderStatus[];
}) {
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<"idle" | "checking" | "done">("idle");
  const status = providers.find((one) => one.id === fix.cli)?.readiness;
  const signedIn = status?.kind === "cli" && status.installed && status.issue === undefined;
  return (
    <span className="flex flex-wrap items-center gap-2 text-small text-ink2">
      <span>
        {fix.label}: run{" "}
        <code className="rounded-control bg-panel2 px-1 text-ink">{fix.command}</code> in a terminal
        and sign in, then
      </span>
      <Button
        type="button"
        variant="outline"
        disabled={checked === "checking"}
        onClick={() => {
          setChecked("checking");
          void queryClient
            .refetchQueries({ queryKey: keys.providers })
            .finally(() => setChecked("done"));
        }}
      >
        {checked === "checking" ? "Checking…" : "Re-check"}
      </Button>
      {checked === "done" ? (
        <span role="status">
          {signedIn
            ? "Signed in. Use Retry stage to continue."
            : "Still signed out. Run the command on the computer running the CLI, then Re-check."}
        </span>
      ) : null}
    </span>
  );
}
