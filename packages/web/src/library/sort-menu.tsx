import { ArrowDownUpIcon, CheckIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { type LibrarySort, librarySorts } from "./sort";

// The order of a Library list, one small button in its toolbar: the current order on its face,
// the choices behind it.
export function SortMenu({
  what,
  sort,
  onSort,
}: {
  readonly what: string;
  readonly sort: LibrarySort;
  readonly onSort: (next: LibrarySort) => void;
}): ReactElement {
  const current = librarySorts.find((one) => one.value === sort)?.label ?? "Name";
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="quiet" size="small" aria-label={`Sort ${what}: ${current}`}>
          <ArrowDownUpIcon aria-hidden="true" />
          {current}
        </Button>
      </MenuTrigger>
      <MenuContent align="start">
        {librarySorts.map((one) => (
          <MenuItem
            key={one.value}
            aria-label={`Sort by ${one.label.toLowerCase()}${one.value === sort ? " (current)" : ""}`}
            onSelect={() => onSort(one.value)}
          >
            <CheckIcon
              aria-hidden="true"
              className={one.value === sort ? "size-4" : "size-4 opacity-0"}
            />
            {one.value === "changed" ? "Last changed first" : "Name, A to Z"}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
