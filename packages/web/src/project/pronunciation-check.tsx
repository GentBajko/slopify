import type { HeardName, UnguidedName } from "@app/slices/narration/pronunciation-check.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { Fold } from "@/components/kit/fold";
import { TextLink } from "@/components/kit/link";
import { DataTable } from "@/components/kit/stats";
import { pronunciationGapsQuery, pronunciationsHeardQuery } from "@/queries";

// Does this video say the names right? One calm line at each of the two moments where a wrong
// answer costs money, and the detail a press away. Neither line blocks anything: what it says
// is a thing to decide about, not a thing to fix before going on.
//
// Before the narration is paid for it sits on the Narration section, where the person decides to
// go on; after the render it sits on the YouTube section, where they decide to upload.

const mentions = (row: UnguidedName): number => row.plain + row.possessive;

// "41 plain · 1 as a possessive", or just the one it is.
function forms(row: UnguidedName): string {
  const parts: string[] = [];
  if (row.plain > 0) parts.push(`${String(row.plain)} as written`);
  if (row.possessive > 0) parts.push(`${String(row.possessive)} as a possessive`);
  return parts.join(" · ");
}

function UnguidedTable({
  names,
  caption,
}: {
  readonly names: readonly UnguidedName[];
  readonly caption: string;
}): ReactElement {
  return (
    <DataTable
      caption={caption}
      rows={names}
      rowKey={(row) => row.name}
      columns={[
        { id: "name", header: "Name", cell: (row) => row.name },
        { id: "said", header: "Said", cell: (row) => mentions(row), numeric: true },
        { id: "forms", header: "How", cell: (row) => forms(row) },
        {
          id: "kind",
          header: "Kind",
          cell: (row) => (row.proper ? "Proper name" : "Common word"),
        },
      ]}
    />
  );
}

// What came out, for one name: the spelling most of its mentions were heard as, and how many.
function cameOut(row: HeardName): string {
  const worst = row.saidAs[0];
  if (worst === undefined) return "As written";
  return `“${worst.letters.toLowerCase()}” · ${String(worst.mentions)} of ${String(row.mentions)}`;
}

function HeardTable({
  names,
  caption,
}: {
  readonly names: readonly HeardName[];
  readonly caption: string;
}): ReactElement {
  const percent = (value: number): string => `${String(Math.round(value * 100))}%`;
  return (
    <DataTable
      caption={caption}
      rows={names}
      rowKey={(row) => row.name}
      columns={[
        { id: "name", header: "Name", cell: (row) => row.name },
        { id: "mentions", header: "Said", cell: (row) => row.mentions, numeric: true },
        { id: "came", header: "Came out as", cell: (row) => cameOut(row) },
        {
          id: "ipa",
          header: "You asked for",
          cell: (row) => (row.ipa.length === 0 ? "Nothing" : row.ipa.join(" · ")),
        },
        { id: "mean", header: "Heard", cell: (row) => percent(row.mean), numeric: true },
        {
          id: "spread",
          header: "Spread",
          cell: (row) => `${percent(row.low)} to ${percent(row.high)}`,
        },
      ]}
    />
  );
}

// The line before the narration is paid for. Shown only while the narration is still unmade:
// once it exists, the YouTube section's line is the one that counts.
export function NamesAheadNotice({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement | null {
  const { api } = useApp();
  const { data } = useQuery(pronunciationGapsQuery(api, projectId));
  if (data?.notice === undefined || data.notice === null || data.narrated) return null;
  const proper = (data.ahead?.names ?? []).filter((row) => row.proper);
  return (
    <Callout title={data.notice}>
      <Fold
        summary="Every mention"
        state={`${String(proper.length)} ${proper.length === 1 ? "name" : "names"}`}
        remember="project.names-ahead"
      >
        <UnguidedTable names={proper} caption="Names this article says that nothing pronounces" />
        <p className="m-0 mt-2">
          Names you add to <TextLink to="/name-pronunciations">Name pronunciations</TextLink> are
          said the same way in every video. A project already started keeps its copy until Edit
          settings → Narration copies the list again.
        </p>
      </Fold>
    </Callout>
  );
}

// The line on the upload section, after the render: what the voice was sent as written, and what
// it was heard saying more than one way.
export function NamesNarratedNotice({
  projectId,
}: {
  readonly projectId: string;
}): ReactElement | null {
  const { api } = useApp();
  const { data } = useQuery(pronunciationsHeardQuery(api, projectId));
  if (data?.notice === undefined || data.notice === null) return null;
  const guessed = (data.narrated?.names ?? []).filter((row) => row.proper);
  const different = data.heard?.different ?? [];
  const uneven = (data.heard?.uneven ?? []).filter((row) => !row.different);
  return (
    <Callout title={data.notice}>
      {different.length === 0 ? null : (
        <Fold
          summary="Names that came out as another sound"
          state={`${String(different.length)} ${different.length === 1 ? "name" : "names"}`}
          remember="project.names-different"
        >
          <HeardTable
            names={different}
            caption="Names the voice said its own way, mention by mention"
          />
          <p className="m-0 mt-2">
            The letters are what the timing model heard over each mention, which is the one part of
            the check that says how a name was said rather than how clearly. Spelling that is only
            spelling is folded away first, so a name heard as another spelling of itself — “creeg”
            for Kreeg, “bell” for Bel — is not here. Read the letters against what you asked for:
            they come from a second model listening, not from a verdict. If what came out is wrong,
            change that name's IPA in{" "}
            <TextLink to="/name-pronunciations">Name pronunciations</TextLink> and narrate again.
          </p>
        </Fold>
      )}
      {guessed.length === 0 ? null : (
        <Fold
          summary="Names the voice guessed"
          state={`${String(guessed.length)} ${guessed.length === 1 ? "name" : "names"}`}
          remember="project.names-guessed"
        >
          <UnguidedTable
            names={guessed}
            caption="Names the voice script sent as written rather than as IPA"
          />
          <p className="m-0 mt-2">
            These reached the voice with no pronunciation, so it invented one. Adding them to{" "}
            <TextLink to="/name-pronunciations">Name pronunciations</TextLink> settles them for the
            next video; this one would have to be narrated again.
          </p>
        </Fold>
      )}
      {uneven.length === 0 ? null : (
        <Fold
          summary="Names heard more than one way"
          state={`${String(uneven.length)} ${uneven.length === 1 ? "name" : "names"}`}
          remember="project.names-uneven"
        >
          <HeardTable
            names={uneven}
            caption="How the finished narration was heard saying each name"
          />
          <p className="m-0 mt-2">
            Read from the word timing the captions were made with — nothing is listened to again.
            The spread is what matters: a rare name is heard poorly even when it is said perfectly,
            so these are the names whose own mentions disagree with each other.
          </p>
        </Fold>
      )}
      {data.listened || data.heard === null ? null : (
        <p className="m-0">
          This video's captions were timed before Slopify kept what the voice was heard saying, so
          the names above are read from their scores alone. A name said wrong the same way every
          time scores well, and would not show here. Make the captions again to have it listened to:
          it costs nothing but time.
        </p>
      )}
    </Callout>
  );
}
