import { useNavigate, useSearch } from "@tanstack/react-router";

// The Library row shown in the detail column lives in the URL (`?item=`), so a reload or Back
// keeps it and the address opens that row for anyone it is sent to. Every other search value
// (the kind or category tab) is kept as it is.
export function useLibraryItem(): readonly [string | undefined, (id: string) => void] {
  const search: { readonly item?: unknown } = useSearch({ strict: false });
  const navigate = useNavigate();
  const item = typeof search.item === "string" && search.item !== "" ? search.item : undefined;
  const pick = (id: string): void => {
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, item: id }),
      replace: true,
    });
  };
  return [item, pick] as const;
}

// The search value the Library tabs' routes keep (router.tsx): a row id or a built-in's name.
export function itemOf(value: unknown): { readonly item?: string } {
  return typeof value === "string" && value !== "" ? { item: value } : {};
}
