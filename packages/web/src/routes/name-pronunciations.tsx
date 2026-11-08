import { parsePronunciationGlossary } from "@app/slices/narration/pronunciation.js";
import type { LibraryPronunciations } from "@app/slices/narration/pronunciations-library.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useEffect, useId, useState } from "react";
import { saveLibraryPronunciations } from "@/api";
import { useApp } from "@/app-context";
import { ActionBar, StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { HelpLine, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { TextLink } from "@/components/kit/link";
import { useToast } from "@/components/kit/toast";
import { startedAt } from "@/lib/utils";
import { EditorCrumb } from "@/library/editor-frame";
import { keys, libraryPronunciationsQuery } from "@/queries";
import { UnsavedLeaveGuard } from "./unsaved-leave-guard.js";

// Name pronunciations (Settings → Voices links here): one list of names with the sounds this
// channel always says them with, in the same Term: /IPA/ lines an article's Pronunciation
// Glossary uses. A name on this list is said this way in every video, whatever that video's
// article spelled out, so Gygax never drifts to Gigax between episodes. A project takes a copy
// when it starts; Inworld TTS-2 voices read it, and aliases on the Pronunciation page are the
// way to fix a word with any other voice.
export function NamePronunciationsRoute(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const listing = useQuery(libraryPronunciationsQuery(api));
  const [text, setText] = useState<string | undefined>(undefined);
  // What Save last kept (or the load), to tell whether the list on screen has unsaved changes.
  const [saved, setSaved] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  // The version this editor is working from: what the load (or the last save) gave. It rides
  // with every save, so one made from an older list is refused instead of replacing it.
  const [version, setVersion] = useState<string | undefined>(undefined);
  // The list as it stands elsewhere, after a save was refused: shown beside what is on screen
  // until one of them wins.
  const [theirs, setTheirs] = useState<LibraryPronunciations | undefined>(undefined);
  const id = useId();

  // The saved list fills the editor once; after that the editor is the source until Save.
  useEffect(() => {
    if (text === undefined && listing.data !== undefined) {
      setText(listing.data.text);
      setSaved(listing.data.text);
      setVersion(listing.data.version);
    }
  });
  const shown = text ?? "";
  const dirty = text !== undefined && saved !== shown;
  const report = listing.data;

  const save = useMutation({
    mutationFn: (next: { text: string; version: string }) =>
      saveLibraryPronunciations(api, next.text, next.version),
    onSuccess: async (result) => {
      if (!result.ok) {
        // Somebody else saved while this page was open. Neither list is thrown away: the one on
        // screen stays in the box, theirs is named above it, and the buttons pick.
        setTheirs(result.current);
        setVersion(result.current.version);
        // The whole sentence is in the notice above the box, where the two buttons are; the bar
        // says only that nothing was saved, so it stays one line.
        setStatus({
          text: "Not saved: the list changed somewhere else. Choose which to keep, above.",
          tone: "error",
        });
        return;
      }
      setText(result.list.text);
      setSaved(result.list.text);
      setVersion(result.list.version);
      setTheirs(undefined);
      setStatus(undefined);
      notify(
        `Saved ${String(result.list.terms)} ${result.list.terms === 1 ? "name" : "names"}. New projects say them this way; a project already started keeps its copy until you copy the list again in its settings.`,
        "success",
      );
      await queryClient.invalidateQueries({
        queryKey: keys.libraryPronunciations,
      });
    },
    onError: (error) =>
      setStatus({
        text: `Not saved: ${error.message} Your changes are still on screen; press Save pronunciations to try again.`,
        tone: "error",
      }),
  });
  const keep = (): void => {
    if (version !== undefined) save.mutate({ text: shown, version });
  };

  const barShown = dirty || save.isPending || status !== undefined;
  const skipped = report?.skipped ?? [];

  return (
    <div>
      <PageHeader
        crumb={
          <EditorCrumb>
            <Link to="/settings" search={{ section: "voices" }}>
              Settings
            </Link>
          </EditorCrumb>
        }
        title="Name pronunciations"
      />
      <p className="m-0 mb-4 max-w-[var(--measure)] text-small text-ink-2" {...helpScope}>
        The names this channel always says the same way, one <code>Term: /IPA/</code> per line. They
        come before the glossary each article writes, so a name never drifts between videos. Inworld
        TTS-2 voices read them; for any other voice, say a word differently with{" "}
        <TextLink to="/narration-aliases">Pronunciation ↗</TextLink>.{" "}
        <InfoTip id="library.name-pronunciations" className="-my-1 align-middle" />
      </p>

      {listing.error === null ? null : (
        <Callout tone="danger" title="Couldn't load the list" className="mb-4">
          {listing.error.message} Reload the page to try again.
        </Callout>
      )}

      {theirs === undefined ? null : (
        <Callout
          tone="waiting"
          className="mb-4 max-w-[960px]"
          title="The list changed somewhere else"
        >
          <p>{differenceLine(theirs, shown)}</p>
          <p>
            Nothing is lost: what you see below is still yours. Keep it, or take theirs and start
            again from it.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" disabled={save.isPending} onClick={keep}>
              {save.isPending ? "Saving…" : "Save mine anyway"}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setText(theirs.text);
                setTheirs(undefined);
                setStatus(undefined);
              }}
            >
              Load theirs instead
            </Button>
          </div>
        </Callout>
      )}

      <div className="flex max-w-[960px] flex-col gap-2" {...helpScope}>
        <Textarea
          id={id}
          rows={18}
          aria-label="Name pronunciations"
          className="font-mono"
          spellCheck={false}
          placeholder={"Gygax: /ˈɡaɪɡæks/\nFaerûn: /feɪˈruːn/"}
          value={shown}
          disabled={text === undefined}
          onChange={(event) => {
            setText(event.target.value);
            setStatus(undefined);
          }}
        />
        <HelpLine>
          Standard-English IPA between slashes, one IPA word per written word. A dash or n/a leaves
          a name read as written. Possessives follow the name: Gygax's is said from Gygax.
        </HelpLine>
        {report === undefined || dirty ? null : (
          <p className="m-0 text-small text-ink-2">
            {`${String(report.terms)} ${report.terms === 1 ? "name is" : "names are"} pronounced from this list${
              report.unpronounced === undefined
                ? ""
                : `, and ${String(report.unpronounced)} ${report.unpronounced === 1 ? "name is" : "names are"} read as written`
            }.`}
          </p>
        )}
      </div>

      {skipped.length === 0 || dirty ? null : (
        <Callout
          tone="waiting"
          className="mt-4 max-w-[960px]"
          title={`${String(skipped.length)} ${skipped.length === 1 ? "line is" : "lines are"} skipped`}
        >
          <ul>
            {skipped.map((row) => (
              <li key={row.row}>
                Entry {row.row}: {row.reason}.
              </li>
            ))}
          </ul>
          <p>
            Those names are read as ordinary text; the rest of the list is used. Fix the line above,
            then Save pronunciations.
          </p>
        </Callout>
      )}

      <UnsavedLeaveGuard
        dirty={dirty}
        what="your pronunciation changes"
        saveLabel="Save pronunciations"
      />

      {barShown ? (
        <ActionBar
          status={
            <StatusSlot tone={status?.tone ?? (dirty ? "warning" : "info")}>
              {status?.text ??
                (dirty ? "Unsaved changes. Press Save pronunciations to keep them." : "")}
            </StatusSlot>
          }
        >
          <Button
            type="button"
            variant="primary"
            disabled={text === undefined || version === undefined || save.isPending}
            onClick={keep}
          >
            {save.isPending ? "Saving…" : "Save pronunciations"}
          </Button>
        </ActionBar>
      ) : null}
    </div>
  );
}

// What the two lists differ by, in names rather than characters: enough to decide which to
// keep without reading 1,800 lines. Both are parsed the way narration parses them.
function differenceLine(theirs: LibraryPronunciations, mine: string): string {
  const named = (text: string) => {
    const parsed = parsePronunciationGlossary(text);
    return new Map(
      parsed.ok
        ? parsed.entries.map((entry) => [entry.term.toLowerCase(), entry.ipa.join(" ")])
        : [],
    );
  };
  const ours = named(mine);
  const them = named(theirs.text);
  let added = 0;
  let changed = 0;
  for (const [term, ipa] of them) {
    const own = ours.get(term);
    if (own === undefined) added += 1;
    else if (own !== ipa) changed += 1;
  }
  const missing = [...ours.keys()].filter((term) => !them.has(term)).length;
  const parts = [
    added === 0 ? "" : `${String(added)} ${added === 1 ? "name" : "names"} you don't have`,
    changed === 0 ? "" : `${String(changed)} ${changed === 1 ? "name" : "names"} said differently`,
    missing === 0 ? "" : `${String(missing)} of yours it doesn't have`,
  ].filter((part) => part !== "");
  const at = theirs.savedAt === undefined ? "" : ` at ${startedAt(theirs.savedAt)}`;
  const when =
    theirs.savedBy === "agent"
      ? `An agent saved it${at}`
      : theirs.savedBy === "assistant"
        ? `The assistant saved it${at}`
        : `It was saved in another window${at}`;
  return parts.length === 0
    ? `${when}, with the same names as yours.`
    : `${when}: it has ${parts.join(", ")}.`;
}
