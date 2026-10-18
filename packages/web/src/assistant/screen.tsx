import {
  type AssistantScreen,
  assistantScreenSchema,
  assistantSelectionMax,
} from "@app/slices/assistant/model.js";
import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// What the assistant is told the person has open: the page, the project, schedule, channel or
// template on it, the section, and the rows they selected. Pages that select rows say so with
// useAssistantSelection; an editor with sections of its own (Template Studio) adds its
// template and section with useAssistantContext. Sent with each message; a hint, never a
// command.

export interface SelectedRow {
  readonly id: string;
  readonly label: string;
}

interface Extras {
  readonly templateId?: string | undefined;
  readonly section?: string | undefined;
}

interface ScreenState {
  readonly selection: { readonly kind: string; readonly rows: readonly SelectedRow[] } | undefined;
  readonly extras: Extras;
  readonly setSelection: (
    selection: { readonly kind: string; readonly rows: readonly SelectedRow[] } | undefined,
  ) => void;
  readonly setExtras: (extras: Extras) => void;
}

const ScreenContext = createContext<ScreenState | null>(null);

export function AssistantScreenProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const [selection, setSelection] = useState<ScreenState["selection"]>(undefined);
  const [extras, setExtras] = useState<Extras>({});
  const value = useMemo(
    () => ({ selection, extras, setSelection, setExtras }),
    [selection, extras],
  );
  return <ScreenContext.Provider value={value}>{children}</ScreenContext.Provider>;
}

const id = /^[0-9A-Za-z_-]{1,64}$/;
const routeIds: readonly (readonly [RegExp, "projectId" | "scheduleId" | "channelId"])[] = [
  [/^\/projects\/([^/]+)/, "projectId"],
  [/^\/schedules\/([^/]+)/, "scheduleId"],
  [/^\/channels\/([^/]+)/, "channelId"],
];

function word(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value.slice(0, 80) : undefined;
}

// The screen from the address and what the page added; anything that wouldn't pass the
// server's schema is left out rather than sent.
export function screenOf(
  pathname: string,
  search: Readonly<Record<string, unknown>>,
  extras: Extras = {},
  selection?: { readonly kind: string; readonly rows: readonly SelectedRow[] },
): AssistantScreen {
  const ids: Record<string, string> = {};
  for (const [pattern, key] of routeIds) {
    const found = pattern.exec(pathname)?.[1];
    if (found !== undefined && id.test(decodeURIComponent(found)))
      ids[key] = decodeURIComponent(found);
  }
  if (
    pathname.startsWith("/calendar") &&
    typeof search.schedule === "string" &&
    id.test(search.schedule)
  )
    ids.scheduleId = search.schedule;
  if (pathname.startsWith("/templates") && typeof search.item === "string" && id.test(search.item))
    ids.templateId = search.item;
  if (extras.templateId !== undefined && id.test(extras.templateId))
    ids.templateId = extras.templateId;
  const section = word(extras.section) ?? word(search.section) ?? word(search.tab);
  const rows = (selection?.rows ?? [])
    .filter((row) => id.test(row.id))
    .slice(0, assistantSelectionMax)
    .map((row) => ({
      kind: selection?.kind.slice(0, 40) ?? "row",
      id: row.id,
      label: row.label.slice(0, 200),
    }));
  const screen = {
    path: pathname.slice(0, 300) || "/",
    ...ids,
    ...(section === undefined ? {} : { section }),
    ...(rows.length === 0 ? {} : { selection: rows }),
  };
  const checked = assistantScreenSchema.safeParse(screen);
  return checked.success ? checked.data : { path: "/" };
}

export function useAssistantScreen(): AssistantScreen {
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useLocation({ select: (location) => location.search }) as Record<string, unknown>;
  const state = useContext(ScreenContext);
  return screenOf(pathname, search, state?.extras, state?.selection);
}

// The rows a list has selected, while it shows them.
export function useAssistantSelection(kind: string, rows: readonly SelectedRow[]): void {
  const set = useContext(ScreenContext)?.setSelection;
  const key = rows.map((row) => `${row.id}\u0000${row.label}`).join("\u0001");
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the rows' contents, not their array.
  useEffect(() => {
    if (set === undefined) return;
    set(rows.length === 0 ? undefined : { kind, rows });
    return () => set(undefined);
  }, [set, kind, key]);
}

// An editor's own template and section (Template Studio), while it is open.
export function useAssistantContext(extras: Extras): void {
  const set = useContext(ScreenContext)?.setExtras;
  const { templateId, section } = extras;
  useEffect(() => {
    if (set === undefined) return;
    set({ templateId, section });
    return () => set({});
  }, [set, templateId, section]);
}
