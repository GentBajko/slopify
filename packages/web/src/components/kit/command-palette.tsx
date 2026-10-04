import { SearchIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  createContext,
  Fragment,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Dialog } from "./dialog.js";

// Every frequent action is reachable from the command palette (Ctrl+K) by typing. Screens
// register what they offer with `useCommand` while they are mounted, so the palette always
// lists what can be done from where the person is, and nothing that cannot. A command with a
// `shortcut` is bound to it too: the provider runs it when the keys are pressed, so the label
// shown and the key that works come from the same place.

export interface Command {
  // Stable and unique: "project.approve", "nav.settings".
  readonly id: string;
  // Named for its result: "Approve and render", "Open settings".
  readonly title: string;
  // The heading it is listed under: "This project", "Go to", "Create".
  readonly group: string;
  // `count` is the number typed with a `numbered` command ("regenerate image 3" → 3).
  readonly run: (count?: number) => void | Promise<void>;
  // Other words a person might type for it.
  readonly keywords?: readonly string[];
  // Where the command acts, shown beside it ("History: Cleopatra"). Commands with a context
  // are about the screen in front of the person and are listed first; typing it finds them.
  readonly context?: string;
  readonly icon?: ReactNode;
  // Its keys, shown beside it and bound while it is registered. Modifiers first, then one
  // key: ["Ctrl", "Enter"] (Ctrl or Cmd), ["Ctrl", "S"], ["C"], ["/"]. Two keys and no
  // modifier are a sequence, pressed one after the other: ["G", "H"].
  readonly shortcut?: readonly string[];
  // Takes a number typed with it: digits in the query are handed to `run` rather than
  // matched, and this names the result ("Regenerate image 3 in Cleopatra").
  readonly numbered?: (count: number) => string;
  // Listed only once something is typed: an index of every project would bury the screen's
  // own commands in an empty palette.
  readonly searchOnly?: boolean;
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
  const { id, title, group, context: where, searchOnly } = command;
  // Arrays and elements are new on every render; their contents decide re-registering.
  const keywords = command.keywords?.join("\u0000");
  const shortcut = command.shortcut?.join("\u0000");
  const numbered = command.numbered !== undefined;
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
      ...(numbered
        ? { numbered: (count: number) => latest.current.numbered?.(count) ?? title }
        : {}),
      ...(searchOnly === true ? { searchOnly: true } : {}),
      run: (count?: number) => latest.current.run(count),
    });
  }, [registry, id, title, group, where, keywords, shortcut, numbered, searchOnly]);
}

// `/` puts the cursor in a list's search box.
export function useSearchShortcut(
  input: RefObject<HTMLInputElement | null>,
  what: string,
): readonly string[] {
  const shortcut = ["/"];
  useCommand({
    id: "list.search",
    title: `Search ${what}`,
    group: "This page",
    keywords: ["find", "filter"],
    shortcut,
    run: () => {
      input.current?.focus();
      input.current?.select();
    },
  });
  return shortcut;
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

interface Field {
  readonly text: string;
  // A title match outranks the same match on the context, which outranks a keyword or the
  // group name.
  readonly bonus: number;
}

function fieldsOf(command: Command): readonly Field[] {
  return [
    { text: command.title, bonus: 2 },
    ...(command.context === undefined ? [] : [{ text: command.context, bonus: 1 }]),
    ...(command.keywords ?? []).map((text) => ({ text, bonus: 0 })),
    { text: command.group, bonus: 0 },
  ];
}

function best(query: string, fields: readonly Field[], whole: boolean): number | null {
  let top: number | null = null;
  for (const field of fields) {
    const score = fuzzyScore(query, field.text);
    if (score === null) continue;
    // A word typed in full ("3" in "image 3", not in "image 13") is the one meant.
    const exact =
      whole &&
      field.text
        .toLowerCase()
        .split(/[\s\-_:/.,&]+/)
        .includes(query)
        ? 4
        : 0;
    const weighted = score + field.bonus + exact;
    if (top === null || weighted > top) top = weighted;
  }
  return top;
}

// The query as a phrase against one field (the title, a keyword), or else word by word, each
// word in any field and in any order: "cleopatra regenerate image 3" finds "Regenerate image 3"
// in the project "Cleopatra".
function scoreWords(words: readonly string[], fields: readonly Field[]): number | null {
  if (words.length === 0) return 0;
  const phrase = best(words.join(" "), fields, false);
  if (words.length === 1) return phrase;
  let total = 0;
  for (const word of words) {
    const score = best(word, fields, true);
    if (score === null) return phrase;
    total += score;
  }
  return phrase === null ? total : Math.max(phrase, total);
}

export function matchCommands(commands: readonly Command[], query: string): readonly Command[] {
  const blank = query.trim() === "";
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const number = words.find((word) => /^\d+$/.test(word));
  const scored: { command: Command; score: number; order: number }[] = [];
  commands.forEach((command, order) => {
    if (blank && command.searchOnly === true) return;
    const numbered = command.numbered;
    if (numbered !== undefined && number !== undefined) {
      const count = Number(number);
      const at = words.indexOf(number);
      const rest = [...words.slice(0, at), ...words.slice(at + 1)];
      const score = scoreWords(rest, fieldsOf(command));
      if (score !== null)
        scored.push({
          command: { ...command, title: numbered(count), run: () => command.run(count) },
          score,
          order,
        });
      return;
    }
    const score = scoreWords(words, fieldsOf(command));
    if (score !== null) scored.push({ command, score, order });
  });
  scored.sort((a, b) => {
    const ctx = Number(b.command.context !== undefined) - Number(a.command.context !== undefined);
    if (blank) return ctx !== 0 ? ctx : a.order - b.order;
    return b.score - a.score || ctx || a.order - b.order;
  });
  return scored.map((entry) => entry.command);
}

// Recent ------------------------------------------------------------------------------------

// The last few commands run from the palette, shown first while nothing is typed ("Open
// Cleopatra" again is two keys). Kept per browser; storage can be missing or throw.
const recentKey = "slopify.palette.recent";
const recentLimit = 5;

export function readRecent(): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(recentKey) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string").slice(0, recentLimit)
      : [];
  } catch {
    return [];
  }
}

function rememberRecent(id: string): void {
  try {
    const next = [id, ...readRecent().filter((one) => one !== id)].slice(0, recentLimit);
    window.localStorage.setItem(recentKey, JSON.stringify(next));
  } catch {
    // Without storage the palette simply has no Recent group.
  }
}

const recentPrefix = "recent:";

// With nothing typed, the recent commands that still exist here come first under Recent, and
// are not listed a second time below.
export function withRecent(
  matches: readonly Command[],
  commands: readonly Command[],
  recent: readonly string[],
  query: string,
): readonly Command[] {
  if (query.trim() !== "" || recent.length === 0) return matches;
  const byId = new Map(commands.map((command) => [command.id, command]));
  const first = recent
    .map((id) => byId.get(id))
    .filter(
      (command): command is Command => command !== undefined && command.numbered === undefined,
    )
    .map((command) => ({ ...command, id: `${recentPrefix}${command.id}`, group: "Recent" }));
  const shown = new Set(recent);
  return [...first, ...matches.filter((command) => !shown.has(command.id))];
}

// Shortcuts ---------------------------------------------------------------------------------

const modifiers = new Set(["Ctrl", "Alt", "Shift"]);

interface Keys {
  // Ctrl on Windows and Linux, Cmd on a Mac: the one that saves.
  readonly mod: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
  // One key for a chord; two for a sequence ("g" then "h").
  readonly keys: readonly string[];
}

function parseShortcut(shortcut: readonly string[]): Keys {
  return {
    mod: shortcut.includes("Ctrl"),
    alt: shortcut.includes("Alt"),
    shift: shortcut.includes("Shift"),
    keys: shortcut.filter((key) => !modifiers.has(key)).map((key) => key.toLowerCase()),
  };
}

const isSequence = (keys: Keys): boolean =>
  !keys.mod && !keys.alt && !keys.shift && keys.keys.length > 1;

// For `aria-keyshortcuts`: "Control+Enter Meta+Enter", "Shift+D", "/". A sequence has no
// ARIA spelling, so it gets none.
export function ariaKeyShortcuts(shortcut: readonly string[] | undefined): string | undefined {
  if (shortcut === undefined) return undefined;
  const keys = parseShortcut(shortcut);
  if (isSequence(keys) || keys.keys.length !== 1) return undefined;
  const key = shortcut.at(-1) ?? "";
  const rest = [...(keys.alt ? ["Alt"] : []), ...(keys.shift ? ["Shift"] : []), key].join("+");
  return keys.mod ? `Control+${rest} Meta+${rest}` : rest;
}

function matchesEvent(keys: Keys, key: string, event: globalThis.KeyboardEvent): boolean {
  if (keys.mod !== (event.ctrlKey || event.metaKey) || keys.alt !== event.altKey) return false;
  // Shift counts for a letter ("Shift+D"); for "?" it is how the key is typed at all.
  if (/^[a-z0-9]$/.test(key) && keys.shift !== event.shiftKey) return false;
  return event.key.toLowerCase() === key;
}

function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement)
    return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(
      target.type,
    );
  return false;
}

// A modal dialog (a confirm, the shortcuts sheet) owns the keyboard while it is open.
const dialogOpen = (): boolean =>
  document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]') !== null;

// Commands about the screen in front of the person win a shared key, then the latest.
function byPriority(commands: readonly Command[]): readonly Command[] {
  return commands
    .map((command, order) => ({ command, order }))
    .filter((entry) => entry.command.shortcut !== undefined)
    .sort(
      (a, b) =>
        Number(b.command.context !== undefined) - Number(a.command.context !== undefined) ||
        b.order - a.order,
    )
    .map((entry) => entry.command);
}

const sequenceWindowMs = 1500;

export function CommandPaletteProvider({
  children,
  registry: given,
}: {
  readonly children: ReactNode;
  readonly registry?: CommandRegistry;
}): ReactElement {
  const [registry] = useState(() => given ?? new CommandRegistry());
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const opened = useRef(false);
  opened.current = open;

  useEffect(
    () =>
      registry.register({
        id: "help.shortcuts",
        title: "Show keyboard shortcuts",
        group: "Help",
        keywords: ["keys", "keyboard", "hotkeys", "help"],
        shortcut: ["?"],
        run: () => setHelp(true),
      }),
    [registry],
  );

  useEffect(() => {
    let first: { readonly key: string; readonly at: number } | undefined;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }
      if (event.defaultPrevented || event.isComposing || opened.current || dialogOpen()) return;
      const typing = typingIn(event.target);
      const commands = byPriority(registry.list());
      const key = event.key.toLowerCase();
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
      const run = (command: Command) => {
        event.preventDefault();
        first = undefined;
        void command.run();
      };
      if (
        first !== undefined &&
        plain &&
        !typing &&
        event.timeStamp - first.at < sequenceWindowMs
      ) {
        const started = first.key;
        const second = commands.find((command) => {
          const keys = parseShortcut(command.shortcut ?? []);
          return isSequence(keys) && keys.keys[0] === started && keys.keys[1] === key;
        });
        if (second !== undefined) return run(second);
      }
      first = undefined;
      const chord = commands.find((command) => {
        const keys = parseShortcut(command.shortcut ?? []);
        if (isSequence(keys) || keys.keys.length !== 1) return false;
        // Typing a "c" into a field is typing; Ctrl+S from a field still saves.
        if (typing && !keys.mod) return false;
        return matchesEvent(keys, keys.keys[0] ?? "", event);
      });
      if (chord !== undefined) return run(chord);
      if (plain && !typing && !event.shiftKey) {
        const starts = commands.some((command) => {
          const keys = parseShortcut(command.shortcut ?? []);
          return isSequence(keys) && keys.keys[0] === key;
        });
        if (starts) first = { key, at: event.timeStamp };
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [registry]);

  const value = useMemo(() => ({ registry, open, setOpen }), [registry, open]);
  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
      <ShortcutsSheet registry={registry} open={help} onOpenChange={setHelp} />
    </PaletteContext.Provider>
  );
}

// The keys shown beside a command, a sequence with "then" between its keys.
export function ShortcutKeys({ shortcut }: { readonly shortcut: readonly string[] }): ReactElement {
  const sequence = isSequence(parseShortcut(shortcut));
  return (
    <span className="sl-kbd">
      {shortcut.map((key, at) => (
        <Fragment key={key}>
          {sequence && at > 0 ? <span className="text-caption text-ink-3">then</span> : null}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </span>
  );
}

// Every key that works right now: the fixed ones, then each registered command's, so a
// screen's own shortcuts are listed while it is open.
function ShortcutsSheet({
  registry,
  open,
  onOpenChange,
}: {
  readonly registry: CommandRegistry;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  useSyncExternalStore(registry.subscribe, registry.getSnapshot, registry.getSnapshot);
  const seen = new Set<string>();
  const rows = byPriority(registry.list())
    .filter((command) => {
      const label = command.shortcut?.join("+") ?? "";
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    })
    .toSorted((a, b) => a.group.localeCompare(b.group) || a.title.localeCompare(b.title));
  const fixed: readonly { readonly keys: readonly string[]; readonly title: string }[] = [
    { keys: ["Ctrl", "K"], title: "Search or run a command" },
    { keys: ["Esc"], title: "Close a dialog, a drawer or the palette" },
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keyboard shortcuts"
      description="Ctrl works as Cmd on a Mac. Keys without Ctrl wait while you type in a field. A screen's own shortcuts are listed while it is open."
    >
      <dl className="m-0 grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-small">
        {[
          ...fixed,
          ...rows.map((command) => ({ keys: command.shortcut ?? [], title: command.title })),
        ].map((row) => (
          <Fragment key={row.keys.join("+")}>
            <dt>
              <ShortcutKeys shortcut={row.keys} />
            </dt>
            <dd className="m-0 min-w-0">{row.title}</dd>
          </Fragment>
        ))}
      </dl>
    </Dialog>
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
  const [recent] = useState(readRecent);
  const matches = useMemo(
    () => withRecent(matchCommands(commands, query), commands, recent, query),
    [commands, query, recent],
  );
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
      if (command.numbered === undefined)
        rememberRecent(
          command.id.startsWith(recentPrefix) ? command.id.slice(recentPrefix.length) : command.id,
        );
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
                    <ShortcutKeys shortcut={command.shortcut} />
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
