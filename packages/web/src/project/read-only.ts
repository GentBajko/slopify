import { useQuery } from "@tanstack/react-query";
import { createContext } from "react";
import { useApp } from "@/app-context";
import { isSample, readSample, sampleKey } from "@/onboarding/api";

// The bundled samples are read-only: the server refuses every change to them, so the page
// draws what would spend or save as disabled and says why where the press would be.
export const sampleReason = "Read-only sample. Press Make my own copy first.";

// Whether this project is one of the bundled samples (the Library of Alexandria, the
// audiobook, the podcast). The answer is the onboarding query the page already reads, so
// every section asks without a prop threaded through the page.
export function useReadOnlySample(projectId: string): boolean {
  const { api } = useApp();
  const sample = useQuery({ queryKey: sampleKey, queryFn: () => readSample(api) });
  return isSample(sample.data, projectId);
}

// True when the page has no next action of its own (no lime button in the title row), so a
// section's main download may wear the lime: one primary per page.
export const LeadDownloadContext = createContext(false);

// The file the title row's next action downloads, by its asset name ("video", "audio-m4b"),
// so the section that holds it does not offer the same file a second time.
export const TitleDownloadContext = createContext<string | undefined>(undefined);
