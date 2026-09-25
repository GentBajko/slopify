import { XIcon } from "lucide-react";
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

// Acknowledgements ("Template saved.", "Resumed.") are toasts, not paragraphs inserted into the
// page: they appear over the corner and leave on their own, and nothing on the page moves.
// Errors that the reader must act on stay where the action was taken.

type Tone = "info" | "success" | "error";

interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: Tone;
}

export const toastMs = 4000;

type Notify = (message: string, tone?: Tone) => void;

const ToastContext = createContext<Notify | undefined>(undefined);

export function ToastProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const next = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const notify = useCallback<Notify>(
    (message, tone = "info") => {
      next.current += 1;
      const id = next.current;
      // The same words twice in a row are one toast, restarted.
      setToasts((current) => [
        ...current.filter((toast) => toast.message !== message).slice(-2),
        { id, message, tone },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), toastMs),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  const value = useMemo(() => notify, [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed top-14 right-4 z-[60] flex w-[min(360px,calc(100vw-32px))] flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === "error" ? "alert" : "status"}
            className={cn(
              "pointer-events-auto flex animate-tick-in items-start gap-3 rounded-panel border bg-panel px-3 py-2 text-small shadow-[0_8px_24px_var(--color-shadow)] motion-reduce:animate-none",
              toast.tone === "error"
                ? "border-red text-ink"
                : toast.tone === "success"
                  ? "border-done text-ink"
                  : "border-line2 text-ink",
            )}
          >
            <p className="min-w-0 flex-1 break-words">{toast.message}</p>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-control text-ink3 hover:bg-panel2 hover:text-ink"
            >
              <XIcon aria-hidden="true" className="size-[14px]" />
            </button>
          </div>
        ))}
      </section>
    </ToastContext.Provider>
  );
}

// Outside a provider (a unit test rendering one component) a toast has nowhere to go and is
// dropped rather than throwing.
export function useToast(): Notify {
  return useContext(ToastContext) ?? noop;
}

function noop(): void {}
