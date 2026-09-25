import { InfoIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Help hides until asked. A press (not a hover) opens it, so touch and keyboard reach the same
// text a pointer does, and nothing below the control moves when it opens.
export function InfoTip({
  label,
  children,
  className,
}: {
  // Names the subject: the button reads "About {label}".
  readonly label: string;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={`About ${label}`}
        className={cn(
          "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink3 hover:bg-panel2 hover:text-ink",
          className,
        )}
      >
        <InfoIcon aria-hidden="true" className="size-[15px]" />
      </PopoverTrigger>
      <PopoverContent className="space-y-2 leading-[1.45]">{children}</PopoverContent>
    </Popover>
  );
}
