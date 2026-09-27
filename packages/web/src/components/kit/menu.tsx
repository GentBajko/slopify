import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

// The overflow menu: rare actions behind a quiet button, raised and floating. Frequent actions
// are buttons on the page, never only here. The content renders in a portal, so it escapes
// the rail or row it was opened from.
export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;

export function MenuContent({
  className,
  sideOffset = 4,
  align = "end",
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>): ReactElement {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content
        data-slot="menu-content"
        sideOffset={sideOffset}
        align={align}
        className={cn(
          "z-50 min-w-[180px] overflow-hidden rounded-control border border-line bg-raised p-1",
          "shadow-[var(--shadow-pop)]",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  ...props
}: ComponentProps<typeof MenuPrimitive.Item>): ReactElement {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "flex cursor-default items-center gap-2 rounded-control px-[10px] py-[6px] text-small text-ink",
        "outline-hidden select-none focus:bg-sunken data-highlighted:bg-sunken",
        "data-disabled:text-ink-3",
        className,
      )}
      {...props}
    />
  );
}

export function MenuSeparator({ className }: { readonly className?: string }): ReactElement {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-line", className)} />;
}
