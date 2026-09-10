import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TutorialEvent, TutorialSession } from "./model";
import { receiveTutorialEvent, tutorialSteps } from "./model";
import { TutorialRunner } from "./runner";

interface TutorialContextValue {
  readonly active: boolean;
  readonly projectId: string | undefined;
  readonly projectStep: "project" | "download" | undefined;
  readonly start: () => void;
  readonly report: (progress: Readonly<Record<string, boolean>>) => void;
  readonly clear: (fields: readonly string[]) => void;
  readonly event: (event: TutorialEvent) => void;
}

const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

export function TutorialProvider({ children }: { readonly children: ReactNode }) {
  // Only completion flags and resource IDs live here. Form text and API keys stay in
  // their existing editors, and the tutorial writes nothing to browser storage.
  const [session, setSession] = useState<TutorialSession>({ active: false, step: 0 });
  const [progress, setProgress] = useState<Readonly<Record<string, boolean>>>({});
  const start = useCallback(() => {
    setSession({ active: true, step: 0 });
  }, []);
  const report = useCallback((next: Readonly<Record<string, boolean>>) => {
    setProgress((previous) =>
      Object.entries(next).every(([name, value]) => previous[name] === value)
        ? previous
        : { ...previous, ...next },
    );
  }, []);
  const clear = useCallback((fields: readonly string[]) => {
    setProgress((previous) =>
      Object.fromEntries(Object.entries(previous).filter(([name]) => !fields.includes(name))),
    );
  }, []);
  const event = useCallback((next: TutorialEvent) => {
    setSession((previous) => receiveTutorialEvent(previous, next));
  }, []);
  const step = tutorialSteps[session.step]?.id;
  const projectStep =
    session.active && (step === "project" || step === "download") ? step : undefined;
  const context = useMemo(
    () => ({
      active: session.active,
      projectId: session.projectId,
      projectStep,
      start,
      report,
      clear,
      event,
    }),
    [session.active, session.projectId, projectStep, start, report, clear, event],
  );

  return (
    <TutorialContext.Provider value={context}>
      {children}
      {session.active ? (
        <TutorialRunner session={session} progress={progress} update={setSession} />
      ) : null}
    </TutorialContext.Provider>
  );
}

export function useTutorial(): Pick<TutorialContextValue, "active" | "start"> | undefined {
  return useContext(TutorialContext);
}

export function useTutorialProgress(progress: Readonly<Record<string, boolean>>): void {
  const context = useContext(TutorialContext);
  const report = context?.report;
  const clear = context?.clear;
  const last = useRef(progress);
  last.current = progress;
  useEffect(() => {
    report?.(progress);
  }, [report, progress]);
  useEffect(
    () => () => {
      clear?.(Object.keys(last.current));
    },
    [clear],
  );
}

export function useTutorialEvent(): (event: TutorialEvent) => void {
  const context = useContext(TutorialContext);
  return useCallback(
    (event: TutorialEvent) => {
      context?.event(event);
    },
    [context?.event],
  );
}

export function useTutorialProjectStep(projectId: string): "project" | "download" | undefined {
  const context = useContext(TutorialContext);
  return context?.projectId === projectId ? context.projectStep : undefined;
}
