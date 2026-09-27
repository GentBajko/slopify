import { SearchIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  createContext,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

// Every frequent action is reachable from the command palette (Ctrl+K) by typing. Screens
// register what they offer with `useCommand` while they are mounted, so the palette always
// lists what can be done from where the person is, and nothing that cannot.

export interface Command {
  // Stable and unique: "project.approve", "nav.settings".
  readonly id: string;
  // Named for its result: "Approve and render", "Open settings".
  readonly title: string;
  // The heading it is listed under: "This project", "Go to", "Create".
  readonly group: string;
  readonly run: () => void | Promise<void>;
  // Other words a person might type for it.
  readonly keywords?: readonly string[];
  // Where the command acts, shown beside it ("D&D Lore: Tiamat"). Commands with a context
  // are about the screen in front of the person and are listed first.
  readonly context?: string;
  readonly icon?: ReactNode;
  // A shortcut to show beside it, as keys: ["Ctrl", "Enter"].
  readonly shortcut?: readonly string[];
}

// The registry is a tiny external store: a map and a version the palette subscribes to.
export class CommandRegistry {
  private readonly commands = new Map<string, Command>();
  private readonly listeners = new Set<() => void>();
  private version = 0;
  private snapshot: readonly Command[] = [];

  register(command: Command): () => void {
    this.commands.set(command.id, command);
    this.changed();
    return () => {
      if (this.commands.get(command.id) === command) {
        this.commands.delete(command.id);
        this.changed();
      }
    };
  }

  list(): readonly Command[] {
    return this.snapshot;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): number => this.version;

  private changed(): void {
    this.version += 1;
    this.snapshot = [...this.commands.values()];
    for (const listener of this.listeners) listener();
  }
}

interface PaletteContextValue {
  readonly registry: CommandRegistry;
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

const PaletteContext = createContext<PaletteContextValue | undefined>(undefined);

// Registers a command for as long as the calling component is mounted. The latest `run` is
// always the one called, so a caller need not memoise it. Outside a provider it does nothing.
export function useCommand(command: Command): void {
  const context = useContext(PaletteContext);
  const latest = useRef(command);
  latest.current = command;
  const { id, title, group, context: where } = command;
  // Arrays and elements are new on every render; their contents decide re-registering.
  const keywords = command.keywords?.join("\u0000");
  const shortcut = command.shortcut?.join("\u0000");
  const registry = context?.registry;
  useEffect(() => {
    if (registry === undefined) return;
    const { icon } = latest.current;
    return registry.register({
      id,
      title,
      group,
      ...(where === undefined ? {} : { context: where }),
      ...(keywords === undefined ? {} : { keywords: keywords.split("\u0000") }),
      ...(icon === undefined ? {} : { icon }),
      ...(shortcut === undefined ? {} : { shortcut: shortcut.split("\u0000") }),
      run: () => latest.current.run(),
    });
  }, [registry, id, title, group, where, keywords, shortcut]);
}

export function useCommandPalette(): {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
} {
  const context = useContext(PaletteContext);
  return context ?? { open: false, setOpen: noop };
}

function noop(): void {}

// Scores `text` against `query` as a subsequence: every query character must appear in
// order. Consecutive runs and word starts score higher; null means no match.
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (q === "") return 0;
  const t = text.toLowerCase();
  let score = 0;
  let at = 0;
  let previous = -2;
  for (const char of q) {
    if (char === " ") continue;
    const found = t.indexOf(char, at);
    if (found === -1) return null;
    score += 1;
    if (found === previous + 1) score += 3;
    if (found === 0 || /[\s\-_:/.]/.test(t[found - 1] ?? "")) score += 4;
    score -= Math.min(found - at, 5) * 0.1;
    previous = found;
    at = found + 1;
  }
  // A word that starts with the query ("set" in "Open settings") counts as much as a prefix.
  if (t.startsWith(q) || t.includes(` ${q}`)) score += 6;
  else if (t.includes(q)) score += 3;
  return score;
}

export function matchCommands(commands: readonly Command[], query: string): readonly Command[] {
  const scored: { command: Command; score: number; order: number }[] = [];
  commands.forEach((command, order) => {
    const haystacks = [command.title, ...(command.keywords ?? []), command.group];
    let best: number | null = null;
    haystacks.forEach((text, i) => {
      const s = fuzzyScore(query, text);
      // A title match outranks the same match on a keyword or the group name.
      const weighted = s === null ? null : i === 0 ? s + 2 : s;
      if (weighted !== null && (best === null || weighted > best)) best = weighted;
    });
    if (best !== null) scored.push({ command, score: best, order });
  });
  const blank = query.trim() === "";
  scored.sort((a, b) => {
    const ctx = Number(b.command.context !== undefined) - Number(a.command.context !== undefined);
    if (blank) return ctx !== 0 ? ctx : a.order - b.order;
    return b.score - a.score || ctx || a.order - b.order;
  });
  return scored.map((entry) => entry.command);
}

export function CommandPaletteProvider({
  children,
  registry: given,
}: {
  readonly children: ReactNode;
  readonly registry?: CommandRegistry;
}): ReactElement {
  const [registry] = useState(() => given ?? new CommandRegistry());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ registry, open, setOpen }), [registry, open]);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
    </PaletteContext.Provider>
  );
}

function CommandPalette(): ReactElement | null {
  const context = useContext(PaletteContext);
  if (context === undefined) return null;
  return (
    <DialogPrimitive.Root open={context.open} onOpenChange={context.setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sl-overlay" />
        <DialogPrimitive.Content
          className="sl-overlay-content sl-palette sl-enter"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <PaletteBody registry={context.registry} close={() => context.setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody({
  registry,
  close,
}: {
  readonly registry: CommandRegistry;
  readonly close: () => void;
}): ReactElement {
  useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const commands = registry.list();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const matches = useMemo(() => matchCommands(commands, query), [commands, query]);
  const current = Math.min(active, Math.max(0, matches.length - 1));
  const list = useRef<HTMLDivElement>(null);

  // Grouped in match order: a group appears where its best command ranks.
  const groups = useMemo(() => {
    const byGroup = new Map<string, { command: Command; index: number }[]>();
    matches.forEach((command, index) => {
      const entries = byGroup.get(command.group) ?? [];
      entries.push({ command, index });
      byGroup.set(command.group, entries);
    });
    return [...byGroup.entries()];
  }, [matches]);

  const optionId = (index: number) => `${listId}-option-${String(index)}`;

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${String(current)}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [current]);

  const run = useCallback(
    (command: Command | undefined) => {
      if (command === undefined) return;
      close();
      void command.run();
    },
    [close],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(matches.length === 0 ? 0 : (current + 1) % matches.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(matches.length === 0 ? 0 : (current - 1 + matches.length) % matches.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, matches.length - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(matches[current]);
    }
  };

  return (
    <>
      <div className="sl-palette__input">
        <SearchIcon aria-hidden="true" strokeWidth={1.75} />
        <input
          // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into.
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={matches.length === 0 ? undefined : optionId(current)}
          aria-label="Search or run a command"
          placeholder="Search or run a command"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <span className="sl-kbd" aria-hidden="true">
          <kbd>Esc</kbd>
        </span>
      </div>
      <div ref={list} id={listId} role="listbox" aria-label="Commands" className="sl-palette__list">
        {matches.length === 0 ? (
          <p className="sl-palette__empty">
            {commands.length === 0
              ? "No commands here yet."
              : `Nothing matches "${query.trim()}". Try fewer letters or another word.`}
          </p>
        ) : (
          groups.map(([group, entries]) => (
            // biome-ignore lint/a11y/useSemanticElements: a listbox groups its options with role=group; a fieldset is for form controls.
            <div key={group} role="group" aria-label={group} className="sl-palette__group">
              <div className="sl-kicker px-[10px] pb-1" aria-hidden="true">
                {group}
              </div>
              {entries.map(({ command, index }) => (
                // biome-ignore lint/a11y/useKeyWithClickEvents: the combobox input owns the keyboard (arrows, Enter).
                <div
                  key={command.id}
                  id={optionId(index)}
                  data-index={index}
                  role="option"
                  tabIndex={-1}
                  aria-selected={index === current}
                  className="sl-palette__item"
                  onMouseMove={() => {
                    if (index !== current) setActive(index);
                  }}
                  onClick={() => run(command)}
                >
                  {command.icon}
                  <span className="min-w-0 truncate">{command.title}</span>
                  {command.context === undefined ? null : (
                    <span className="sl-palette__meta">{command.context}</span>
                  )}
                  {command.shortcut === undefined ? null : (
                    <span className="sl-kbd">
                      {command.shortcut.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}
