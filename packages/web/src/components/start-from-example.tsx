import { ChevronDownIcon } from "lucide-react";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from "@/components/kit/menu";
import type { ExampleGroups, PromptExample } from "@/lib/prompt-examples";

// "Start from an example" beside a prompt's instructions, in the prompt editor and in Create's
// New prompt drawer: the built-in texts of the kind under Built in, then your prompts of it
// under Your prompts. A long list scrolls inside the menu. Nothing to offer, no button.
export function StartFromExample({
  groups,
  onPick,
}: {
  readonly groups: ExampleGroups;
  readonly onPick: (example: PromptExample) => void;
}): ReactElement | null {
  const { builtIn, yours } = groups;
  if (builtIn.length === 0 && yours.length === 0) return null;
  const items = (examples: readonly PromptExample[]) =>
    examples.map((example) => (
      <MenuItem key={example.key} onSelect={() => onPick(example)}>
        {example.name}
      </MenuItem>
    ));
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="quiet" size="small">
          Start from an example
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </MenuTrigger>
      <MenuContent align="end" className="max-h-[min(60vh,480px)] overflow-y-auto">
        {builtIn.length === 0 ? null : <MenuLabel>Built in</MenuLabel>}
        {items(builtIn)}
        {builtIn.length === 0 || yours.length === 0 ? null : <MenuSeparator />}
        {yours.length === 0 ? null : <MenuLabel>Your prompts</MenuLabel>}
        {items(yours)}
      </MenuContent>
    </Menu>
  );
}
