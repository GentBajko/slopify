import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface SplitItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  // One line under the label: what the choice does, instead of a paragraph beside the button.
  readonly hint?: string;
}

// The primary action on the left and its close relatives behind the chevron. The set of
// controls is fixed: an item that does not apply right now is disabled, never removed.
export function SplitButton({
  children,
  onClick,
  disabled,
  items,
  menuLabel,
  variant = "outline",
  className,
  title,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly items: readonly SplitItem[];
  readonly menuLabel: string;
  readonly variant?: ComponentProps<typeof Button>["variant"];
  readonly className?: string;
  readonly title?: string;
}): ReactElement {
  return (
    <span className={cn("inline-flex items-stretch", className)}>
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        onClick={onClick}
        title={title}
        className="rounded-r-none"
      >
        {children}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            aria-label={menuLabel}
            className="rounded-l-none border-l-0 px-2"
          >
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-w-[320px]">
          {items.map((item) => (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled ?? false}
              onSelect={item.onSelect}
              className="flex-col items-start gap-0.5 py-2 data-disabled:opacity-45"
            >
              <span className="font-semibold">{item.label}</span>
              {item.hint ? <span className="text-label text-ink3">{item.hint}</span> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
