import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { desiredPlaces } from "./arrange.js";
import { assetOf } from "./asset-name.js";
import type { DownloadDeps } from "./downloads.js";
import { outputPath } from "./layout.js";
import { outputsOf, projectTitle } from "./repo.js";

// A project's files as its folder is arranged (`arrange.ts`): Upload (what is published),
// Working (what it was made from) and History (older versions). The place is where the file
// belongs even before the folder is arranged; `path` is where it is now and can move, so the
// `/files` URL is the handle to keep.
export const fileGroups = ["Upload", "Working", "History"] as const;
export type FileGroup = (typeof fileGroups)[number];

export interface ProjectFile {
  readonly group: FileGroup;
  readonly place: string;
  readonly role: string;
  readonly path: string;
  readonly url: string;
}

export function groupOf(place: string): FileGroup {
  const first = place.split("/", 1)[0];
  return first === "Upload" || first === "History" ? first : "Working";
}

const recordRow = z.object({
  path: z.string(),
  revision_id: z.string(),
  id: z.string(),
  role: z.string().nullable(),
});

// The newest version record of each stored path, for its `/files/:id/revisions/...` URL.
function revisionRecords(
  db: DatabaseSync,
  projectId: string,
): ReadonlyMap<string, z.infer<typeof recordRow>> {
  const records = new Map<string, z.infer<typeof recordRow>>();
  for (const row of db
    .prepare(
      `SELECT a.path, o.revision_id, o.id, json_extract(o.descriptor,'$.role') AS role, o.created_at
       FROM revision_outputs o JOIN project_assets a ON a.id=o.asset_id AND a.project_id=o.project_id
       WHERE o.project_id=?
       UNION ALL
       SELECT a.path, p.revision_id, p.id, 'piece:'||COALESCE(json_extract(p.descriptor,'$.kind'),'other'), p.created_at
       FROM revision_pieces p JOIN project_assets a ON a.id=p.asset_id AND a.project_id=p.project_id
       WHERE p.project_id=?
       ORDER BY 5`,
    )
    .all(projectId, projectId)) {
    const record = recordRow.parse(row);
    records.set(record.path, record);
  }
  return records;
}

export function projectFiles(
  deps: DownloadDeps,
  projectId: string,
): readonly ProjectFile[] | undefined {
  if (projectTitle(deps.db, projectId) === undefined) return undefined;
  const current = new Map(outputsOf(deps.db, projectId).map((output) => [output.path, output]));
  const records = revisionRecords(deps.db, projectId);
  return [...desiredPlaces(deps.db, projectId)]
    .flatMap(([stored, place]): ProjectFile[] => {
      const output = place.startsWith("History/") ? undefined : current.get(stored);
      const record = records.get(stored);
      const url =
        output !== undefined
          ? `/files/${projectId}/${assetOf(output)}`
          : record === undefined
            ? undefined
            : `/files/${projectId}/revisions/${record.revision_id}/${record.id}`;
      if (url === undefined) return [];
      return [
        {
          group: groupOf(place),
          place,
          role: output?.role ?? record?.role ?? "other",
          path: outputPath(deps.paths, projectId, stored),
          url,
        },
      ];
    })
    .toSorted(
      (a, b) =>
        fileGroups.indexOf(a.group) - fileGroups.indexOf(b.group) || a.place.localeCompare(b.place),
    );
}
