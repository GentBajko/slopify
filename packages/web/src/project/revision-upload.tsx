import { useEffect, useId, useRef, useState } from "react";
import type { StagedFile, UploadKind } from "@/api";
import { discardStaged, listStaged, uploadStaged } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function waitForCopy(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("Upload canceled."));
      return;
    }
    const cancel = (): void => {
      clearTimeout(timer);
      reject(new Error("Upload canceled."));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, 200);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

export function RevisionUpload({
  label,
  kind,
  disabled = false,
  onReady,
  onPending,
}: {
  readonly disabled?: boolean;
  readonly label: string;
  readonly kind: UploadKind;
  readonly onReady: (file: StagedFile) => void;
  readonly onPending: (pending: boolean) => void;
}): import("react").ReactElement {
  const { api } = useApp();
  const inputId = useId();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const ready = useRef(onReady);
  ready.current = onReady;
  const pending = useRef(onPending);
  pending.current = onPending;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      controller.current?.abort();
      pending.current(false);
    };
  }, []);
  async function choose(file: File): Promise<void> {
    if (disabled || controller.current !== undefined) return;
    const operation = new AbortController();
    controller.current = operation;
    setBusy(true);
    pending.current(true);
    setError(undefined);
    let stagedId: string | undefined;
    try {
      let staged = await uploadStaged(api, kind, file);
      stagedId = staged.id;
      operation.signal.throwIfAborted();
      while (staged.state !== "staged") {
        await waitForCopy(operation.signal);
        const current = (await listStaged(api)).files.find((one) => one.id === staged.id);
        operation.signal.throwIfAborted();
        if (current === undefined) throw new Error("The upload failed before staging completed.");
        staged = current;
      }
      ready.current(staged);
    } catch (failure) {
      let message = operation.signal.aborted
        ? "Upload canceled."
        : failure instanceof Error
          ? failure.message
          : String(failure);
      if (stagedId !== undefined) {
        try {
          await discardStaged(api, stagedId);
        } catch (cleanupFailure) {
          message += ` Cleanup failed: ${cleanupFailure instanceof Error ? cleanupFailure.message : String(cleanupFailure)}`;
        }
      }
      if (mounted.current) setError(message);
      else if (message.includes("Cleanup failed:")) console.error(message);
    } finally {
      if (controller.current === operation) {
        controller.current = undefined;
        if (mounted.current) {
          setBusy(false);
          pending.current(false);
        }
      }
    }
  }
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block space-y-1 text-small">
        {label}
        <Input
          id={inputId}
          type="file"
          disabled={busy || disabled}
          accept={kind === "audio" ? "audio/*" : "image/png,image/jpeg,image/webp"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file !== undefined) void choose(file);
          }}
        />
      </label>
      {busy ? (
        <div className="flex items-center gap-3">
          <p role="status" className="text-small text-ink2">
            Copying upload…
          </p>
          <Button type="button" onClick={() => controller.current?.abort()}>
            Cancel upload
          </Button>
        </div>
      ) : null}
      {error === undefined ? null : (
        <p role="alert" className="text-small text-red">
          {error}
        </p>
      )}
    </div>
  );
}
