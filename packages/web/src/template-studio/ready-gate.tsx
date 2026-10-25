import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDownIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { requestNewSchedule } from "@/schedules/new-from";
import type { PlayHandoff } from "@/templates/play-handoff";
import { TemplateHistoryDrawer } from "@/templates/row-parts";
import { useTemplateActions } from "@/templates/use-template-actions";
import { markTemplateReady, templateChecksQuery, templateStudioKey } from "./api";
import { useExportFile } from "./pack";

// The section states approval accepts: nothing about them is left to look at.
const settled = new Set(["current", "off", "provided"]);

// What to do before this version can be approved for schedules, said to follow "first"
// ("fix 1 check"), or undefined when it can be approved now.
function readyBlocker(
  view: StudioView,
  dirty: boolean,
  failing: number | undefined,
): string | undefined {
  if (view.gate === "ready") return "it is approved already";
  if (dirty) return "save your changes";
  if (failing === undefined) return "wait for the checks";
  if (failing > 0) return `fix ${String(failing)} ${failing === 1 ? "check" : "checks"}`;
  const open = view.sections.filter((section) => !settled.has(section.state));
  if (open.length > 0)
    return `look over a current sample of ${open.map((section) => section.label).join(", ")}`;
  return undefined;
}

export function useApproval(view: StudioView, dirty: boolean): string | undefined {
  const { api } = useApp();
  const checks = useQuery(templateChecksQuery(api, view.template.id));
  const failing =
    checks.data === undefined || checks.data.version !== view.template.version
      ? undefined
      : checks.data.checks.filter((check) => !check.ok).length;
  return readyBlocker(view, dirty, failing);
}

// Which version a template's schedules run, in a word for the header and, while this version
// waits for approval, one line under it. Only shown once a schedule runs the template or a
// version was approved: nobody else needs it.
export function gateLine(view: StudioView): { readonly word: string; readonly line?: string } {
  if (!view.gated) return { word: "Schedules run each version you save" };
  if (view.gate === "ready" || view.gate === "carried") return { word: "Ready for schedules" };
  return {
    word: "Not ready for schedules",
    line:
      view.runnableVersion === null
        ? "No schedule runs it until you approve a version: More → Approve for schedules."
        : `Schedules run version ${String(view.runnableVersion)} until you approve this one: More → Approve for schedules.`,
  };
}

// Edit template's header: Make a video (the lime key), New schedule with this template, and
// More: Versions, Export as a file (.zip) and, once a schedule runs the template, Approve for
// schedules.
export function StudioActions({
  view,
  dirty,
  scheduled,
  play,
  onProblem,
}: {
  readonly view: StudioView;
  readonly dirty: boolean;
  // A schedule runs the template, or a version of it was approved once.
  readonly scheduled: boolean;
  readonly play?: PlayHandoff | undefined;
  readonly onProblem: (message: string | undefined) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const blocker = useApproval(view, dirty);
  const file = useExportFile(view, onProblem);
  const [asking, setAsking] = useState(false);
  const [sending, setSending] = useState(false);
  const [versions, setVersions] = useState(false);
  const [starting, setStarting] = useState(false);
  const busy = useRef(false);
  const actions = useTemplateActions(play ?? { onApplied: () => false });
  const version = String(view.template.version);
  const before =
    view.runnableVersion === null || view.runnableVersion === view.template.version
      ? " Until now none of their runs started."
      : ` Until now they ran version ${String(view.runnableVersion)}.`;
  const consequence = view.gated
    ? `Its schedules run this version from their next run.${before}`
    : "Its schedules keep running this version. From now on a version you save waits for your approval before they run it, so an edit never changes the next run by itself.";
  async function approve(): Promise<void> {
    setSending(true);
    try {
      const reply = await markTemplateReady(api, view.template.id, view.template.version);
      onProblem(reply.ok ? undefined : reply.message);
      await client.invalidateQueries({ queryKey: templateStudioKey(view.template.id) });
    } catch (error) {
      onProblem(
        `Version ${version} wasn't approved: ${error instanceof Error ? error.message : String(error)} Choose Approve for schedules again.`,
      );
    } finally {
      setSending(false);
      setAsking(false);
    }
  }
  async function makeVideo(): Promise<void> {
    if (busy.current) return;
    busy.current = true;
    setStarting(true);
    onProblem(undefined);
    try {
      await actions.apply(view.template);
    } catch (error) {
      onProblem(error instanceof Error ? error.message : String(error));
    } finally {
      busy.current = false;
      setStarting(false);
    }
  }
  return (
    <>
      {play === undefined ? null : (
        <Button
          variant="primary"
          disabled={dirty || starting}
          disabledReason={dirty ? "Save your changes first" : "Opening Create"}
          onClick={() => void makeVideo()}
        >
          Make a video
        </Button>
      )}
      <Button
        onClick={() => {
          // The schedule editor opens with this template picked (`schedules/view.tsx`).
          requestNewSchedule(view.template.id);
          void navigate({ to: "/calendar", search: { tab: "schedules" } });
        }}
      >
        New schedule
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button aria-label="More for this template">
            More
            <ChevronDownIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setVersions(true)}>Versions</MenuItem>
          <MenuItem disabled={file.blocker !== undefined} onSelect={() => void file.save()}>
            {file.blocker === undefined ? file.label : `${file.label} (${file.blocker})`}
          </MenuItem>
          {scheduled && view.gate !== "ready" ? (
            <MenuItem disabled={blocker !== undefined} onSelect={() => setAsking(true)}>
              {blocker === undefined
                ? "Approve for schedules"
                : `Approve for schedules (${blocker} first)`}
            </MenuItem>
          ) : null}
        </MenuContent>
      </Menu>
      <ConfirmDialog
        open={asking}
        title={`Approve version ${version} for schedules?`}
        consequence={consequence}
        confirmLabel="Approve for schedules"
        cancelLabel="Not yet"
        tone="primary"
        pending={sending}
        onConfirm={() => void approve()}
        onCancel={() => setAsking(false)}
      />
      {versions ? (
        <TemplateHistoryDrawer
          key={`${view.template.id}:${version}`}
          template={view.template}
          onClose={() => setVersions(false)}
        />
      ) : null}
    </>
  );
}
