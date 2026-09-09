import type { Api } from "@/api";
import { read } from "@/http";

export interface FontSummary {
  readonly id: string;
  readonly name: string;
  readonly family: string;
  readonly source: "bundled" | "system" | "uploaded";
}

export const fontsKey = ["fonts"] as const;

export async function listFonts(api: Api): Promise<{ readonly fonts: readonly FontSummary[] }> {
  return read(await api.fetch(`${api.origin}/api/fonts`));
}

export async function uploadFont(api: Api, file: File): Promise<{ readonly font: FontSummary }> {
  const body = new FormData();
  body.set("file", file);
  return read(await api.fetch(`${api.origin}/api/fonts`, { method: "POST", body }));
}

export function fontUrl(api: Api, id: string): string {
  return `${api.origin}/api/fonts/${encodeURIComponent(id)}/file`;
}
