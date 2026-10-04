import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from "lucide-react";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

// The 3.0 toast (kit.css `.sl-toast`): raised, shadow-pop, bottom right (above the bottom bar
// on a phone), with an icon for its tone. Acknowledgements ("Template saved.", "Resumed.") are
// toasts, not paragraphs inserted into the page: they appear over the corner and leave on
// their own, and nothing on the page moves. Errors that the reader must act on stay where the
// action was taken; an error toast stays until it is dismissed, so it cannot vanish before it
// is read.

type Tone = "info" | "success" | "error";

// One button on the toast, such as Undo for a change saved the moment it was made.
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: Tone;
  readonly action?: ToastAction | undefined;
}

export const toastMs = 5000;
// A toast with an action stays long enough to reach its button, and longer still while the
// pointer or the keyboard is on the toasts.
export const actionToastMs = 15_000;

// How long a toast stays; undefined until dismissed.
export function lifetimeOf(tone: Tone, action: ToastAction | undefined): number | undefined {
  if (tone === "error") return undefined;
  return action === undefined ? toastMs : actionToastMs;
}

type Notify = (message: string, tone?: Tone, action?: ToastAction) => void;

const ToastContext = createContext<Notify | undefined>(undefined);

interface Timer {
  remaining: number;
  startedAt: number;
  handle: ReturnType<typeof setTimeout> | undefined;
}

export function ToastProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, Timer>());
  // While the pointer is over the toasts or focus is inside them, nothing leaves.
  const held = useRef({ hover: false, focus: false });

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer?.handle !== undefined) clearTimeout(timer.handle);
    timers.current.delete(id);
  }, []);

  const start = useCallback(
    (id: number, timer: Timer) => {
      timer.startedAt = Date.now();
      timer.handle = setTimeout(() => dismiss(id), timer.remaining);
    },
    [dismiss],
  );

  const hold = useCallback(
    (what: "hover" | "focus", on: boolean) => {
      const before = held.current.hover || held.current.focus;
      held.current = { ...held.current, [what]: on };
      const after = held.current.hover || held.current.focus;
      if (before === after) return;
      for (const [id, timer] of timers.current) {
        if (after) {
          if (timer.handle !== undefined) clearTimeout(timer.handle);
          timer.handle = undefined;
          timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
        } else {
          // Back from a pause: a moment more to read it again.
          timer.remaining = Math.max(timer.remaining, 2000);
          start(id, timer);
        }
      }
    },
    [start],
  );

  const notify = useCallback<Notify>(
    (message, tone = "info", action) => {
      next.current += 1;
      const id = next.current;
      // The same words twice in a row are one toast, restarted; at most three show.
      setToasts((current) => {
        const kept = current.filter((toast) => toast.message !== message);
        for (const gone of kept.slice(0, Math.max(0, kept.length - 2))) {
          const timer = timers.current.get(gone.id);
          if (timer?.handle !== undefined) clearTimeout(timer.handle);
          timers.current.delete(gone.id);
        }
        return [...kept.slice(-2), { id, message, tone, action }];
      });
      const lifetime = lifetimeOf(tone, action);
      if (lifetime === undefined) return;
      const timer: Timer = { remaining: lifetime, startedAt: Date.now(), handle: undefined };
      timers.current.set(id, timer);
      if (!(held.current.hover || held.current.focus)) start(id, timer);
    },
    [start],
  );

  // A toast that leaves from under the pointer fires no pointer-leave: with none left, nothing
  // is being held.
  useEffect(() => {
    if (toasts.length === 0) held.current = { hover: false, focus: false };
  }, [toasts.length]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values())
        if (timer.handle !== undefined) clearTimeout(timer.handle);
    };
  }, []);

  const value = useMemo(() => notify, [notify]);
  const polite = toasts.filter((toast) => toast.tone !== "error");
  const urgent = toasts.filter((toast) => toast.tone === "error");
  const item = (toast: Toast) => (
    <ToastItem key={toast.id} toast={toast} dismiss={() => dismiss(toast.id)} />
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* The live regions are on the page from the start, empty, so a screen reader
          announces what is put into them; a region added together with its words is often
          not read at all. */}
      <section
        aria-label="Notifications"
        className="sl-toasts"
        onPointerEnter={() => hold("hover", true)}
        onPointerLeave={() => hold("hover", false)}
        onFocus={() => hold("focus", true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            hold("focus", false);
        }}
      >
        <div aria-live="assertive" aria-relevant="additions text" className="sl-toasts__list">
          {urgent.map(item)}
        </div>
        <div aria-live="polite" aria-relevant="additions text" className="sl-toasts__list">
          {polite.map(item)}
        </div>
      </section>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  dismiss,
}: {
  readonly toast: Toast;
  readonly dismiss: () => void;
}): ReactElement {
  return (
    <div
      data-tone={toast.tone}
      className={cn(
        "sl-toast sl-enter",
        toast.tone === "error" && "sl-toast--failed",
        toast.tone === "success" && "sl-toast--done",
      )}
    >
      {toast.tone === "error" ? (
        <AlertTriangleIcon aria-hidden="true" strokeWidth={1.75} />
      ) : toast.tone === "success" ? (
        <CheckIcon aria-hidden="true" strokeWidth={1.75} />
      ) : (
        <InfoIcon aria-hidden="true" strokeWidth={1.75} className="text-ink-2" />
      )}
      <p className="sl-toast__text m-0 min-w-0 break-words">{toast.message}</p>
      {toast.action === undefined ? null : (
        <Button
          variant="quiet"
          size="small"
          onClick={() => {
            dismiss();
            toast.action?.run();
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={dismiss}
        className="sl-btn sl-btn--icon sl-btn--small -mr-1 w-[30px]"
      >
        <XIcon aria-hidden="true" strokeWidth={1.75} />
      </button>
    </div>
  );
}

// Outside a provider (a unit test rendering one component) a toast has nowhere to go and is
// dropped rather than throwing.
export function useToast(): Notify {
  return useContext(ToastContext) ?? noop;
}

function noop(): void {}
