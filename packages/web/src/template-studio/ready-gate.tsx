import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { markTemplateReady, templateChecksQuery, templateStudioKey } from "./api";

// The section states Mark ready accepts: nothing about them is left to look at.
const settled = new Set(["current", "off", "provided"]);

// Why Mark ready can't be pressed now, or undefined when it can.
export function readyBlocker(
  view: StudioView,
  dirty: boolean,
  failing: number | undefined,
): string | undefined {
  if (view.gate === "ready") return "This version is marked ready: schedules run it";
  if (dirty) return "Save your changes first: Mark ready marks a saved version";
  if (failing === undefined) return "Checking the template";
  if (failing > 0)
    return `${String(failing)} ${failing === 1 ? "check fails" : "checks fail"}: fix ${failing === 1 ? "it" : "them"} under Checks first`;
  const open = view.sections.filter((section) => !settled.has(section.state));
  if (open.length > 0)
    return `Look over a current sample of ${open.map((section) => section.label).join(", ")} first`;
  return undefined;
}

// Mark ready: the saved version becomes the one its schedules run, after saying so. Disabled,
// with what to fix, while a check fails or a sample isn't current.
export function MarkReady({
  view,
  dirty,
  onProblem,
}: {
  readonly view: StudioView;
  readonly dirty: boolean;
  readonly onProblem: (message: string | undefined) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const checks = useQuery(templateChecksQuery(api, view.template.id));
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const failing =
    checks.data === undefined || checks.data.version !== view.template.version
      ? undefined
      : checks.data.checks.filter((check) => !check.ok).length;
  const blocker = readyBlocker(view, dirty, failing);
  const version = String(view.template.version);
  const before =
    view.runnableVersion === null || view.runnableVersion === view.template.version
      ? " Until now none of their runs started."
      : ` Until now they ran version ${String(view.runnableVersion)}.`;
  async function mark(): Promise<void> {
    setSending(true);
    try {
      const reply = await markTemplateReady(api, view.template.id, view.template.version);
      onProblem(reply.ok ? undefined : reply.message);
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
    } catch (error) {
      onProblem(
        `Version ${version} wasn't marked ready: ${error instanceof Error ? error.message : String(error)} Press Mark ready again.`,
      );
    } finally {
      setSending(false);
      setAsking(false);
    }
  }
  return (
    <>
      <Button
        size="small"
        disabled={blocker !== undefined || sending}
        disabledReason={blocker ?? "Marking it ready"}
        focusableWhenDisabled
        onClick={() => setAsking(true)}
      >
        {view.gate === "ready" ? "Marked ready" : "Mark ready"}
      </Button>
      <ConfirmDialog
        open={asking}
        title={`Mark version ${version} ready?`}
        consequence={`Schedules start running this version from their next run.${before}`}
        confirmLabel="Mark ready"
        cancelLabel="Not yet"
        tone="primary"
        pending={sending}
        onConfirm={() => void mark()}
        onCancel={() => setAsking(false)}
      />
    </>
  );
}
