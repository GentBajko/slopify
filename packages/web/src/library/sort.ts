import { useState } from "react";

// How a Library list is ordered: by name, or the most recently changed first.
export type LibrarySort = "name" | "changed";

export const librarySorts: readonly { readonly value: LibrarySort; readonly label: string }[] = [
  { value: "name", label: "Name" },
  { value: "changed", label: "Last changed" },
];

export function sortLibrary<T extends { readonly name: string; readonly updatedAt: string }>(
  items: readonly T[],
  sort: LibrarySort,
): T[] {
  return [...items].sort((a, b) =>
    sort === "changed"
      ? b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

const storageKey = (list: string): string => `slopify.library.sort.${list}`;

function storedSort(list: string): LibrarySort {
  try {
    return globalThis.localStorage?.getItem(storageKey(list)) === "changed" ? "changed" : "name";
  } catch {
    return "name";
  }
}

// The order this browser last picked for one list; name until something else is picked.
export function useLibrarySort(list: string): readonly [LibrarySort, (next: LibrarySort) => void] {
  const [sort, setSort] = useState<LibrarySort>(() => storedSort(list));
  const pick = (next: LibrarySort): void => {
    setSort(next);
    try {
      globalThis.localStorage?.setItem(storageKey(list), next);
    } catch {
      // A browser that keeps nothing still sorts; it just forgets on reload.
    }
  };
  return [sort, pick] as const;
}
