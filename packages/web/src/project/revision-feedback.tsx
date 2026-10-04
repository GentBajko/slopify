import { AlertTriangleIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { LinkedText } from "@/components/linked-text";
import type { RevisionRefusal } from "./revision-api.js";

const labels: Readonly<Record<string, string>> = {
  llm: "Text generation",
  image: "Images",
  images: "Images",
  tts: "Audio",
  audio: "Audio",
};

export function RevisionFeedback({
  error,
  refusal,
}: {
  readonly error: string | undefined;
  readonly refusal: RevisionRefusal | undefined;
}): import("react").ReactElement | null {
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error !== undefined || refusal !== undefined) alert.current?.focus();
  }, [error, refusal]);
  if (error === undefined && refusal === undefined) return null;
  return (
    <div
      ref={alert}
      role="alert"
      tabIndex={-1}
      data-tone="danger"
      className="sl-callout sl-callout--danger outline-none"
    >
      <AlertTriangleIcon aria-hidden="true" strokeWidth={1.75} />
      <p className="sl-callout__title m-0">
        <LinkedText
          text={
            error ??
            (refusal?.reason === "readiness"
              ? refusal.fields.length > 0
                ? "This can't start yet. Fix the items below, then try again."
                : "Slopify couldn't check your providers. Open Settings → Providers, make sure each one you use is set up, then try again."
              : (refusal?.message ?? ""))
          }
        />
      </p>
      {refusal?.fields.length ? (
        <ul className="sl-callout__body m-0 list-disc pl-5">
          {refusal.fields.map(({ field, message }) => (
            <li key={`${field}:${message}`}>
              {labels[field.split(".")[0] ?? ""] ?? "Project"}: <LinkedText text={message} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
