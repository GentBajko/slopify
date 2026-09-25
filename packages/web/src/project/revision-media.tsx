import type { RevisionOutputView, RevisionView } from "@app/slices/revisions/model.js";
import { assetOf } from "@app/slices/storage/asset-name.js";
import type { Output } from "@app/slices/storage/model.js";
import { useQuery } from "@tanstack/react-query";
import { createContext, type ReactElement, type ReactNode, useContext } from "react";
import { type Api, fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { keys } from "@/queries";
import { revisionFileUrl, viewOf } from "./revision-api.js";

interface MediaView {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly view: RevisionView | undefined;
}
export interface RevisionMediaFile {
  readonly url: string;
  readonly cacheKey: readonly string[];
  readonly folder: { readonly revisionId: string; readonly recordId: string } | null;
}
const MediaContext = createContext<MediaView | null>(null);

export function RevisionMedia({
  projectId,
  revisionId,
  children,
}: {
  readonly projectId: string;
  readonly revisionId: string | null;
  readonly children: ReactNode;
}): ReactElement {
  const { api } = useApp();
  const query = useQuery({
    queryKey: keys.revision(projectId, revisionId ?? ""),
    enabled: revisionId !== null,
    queryFn: async () => {
      if (revisionId === null)
        throw new Error("This project has no saved version yet. Reload the page and try again.");
      const result = await viewOf(api, projectId, revisionId);
      if (!result.ok) throw new Error(result.message);
      const view = result.value.view;
      if (view.revision.id !== revisionId || view.revision.projectId !== projectId)
        throw new Error("The project changed while its files were loading. Reload the page.");
      return view;
    },
  });
  return (
    <MediaContext value={{ projectId, revisionId, view: query.data }}>
      {query.error === null ? null : <p role="alert">{query.error.message}</p>}
      {children}
    </MediaContext>
  );
}

export function useCurrentRevisionView(): RevisionView | undefined {
  return useContext(MediaContext)?.view;
}

export function useOutputMedia(output: Output | undefined): RevisionMediaFile | undefined {
  const state = useContext(MediaContext);
  const { api } = useApp();
  if (output === undefined || (state !== null && state.projectId !== output.projectId))
    return undefined;
  if (state === null || state.revisionId === null)
    return {
      url: fileUrl(api, output.projectId, assetOf(output)),
      cacheKey: keys.file(output.projectId, output.id),
      folder: null,
    };
  const record = state.view?.outputs.find(
    (row) => row.selected && row.available && row.output.id === output.id,
  );
  return record === undefined
    ? undefined
    : retainedFile(api, state.projectId, state.revisionId, record);
}

export function useAssetMedia(projectId: string, asset: string): RevisionMediaFile | undefined {
  const state = useContext(MediaContext);
  const { api } = useApp();
  if (state !== null && state.projectId !== projectId) return undefined;
  if (state === null || state.revisionId === null)
    return {
      url: fileUrl(api, projectId, asset),
      cacheKey: keys.file(projectId, asset),
      folder: null,
    };
  const record = state.view?.outputs.find(
    (row) =>
      row.selected &&
      row.available &&
      (asset === "images.zip"
        ? row.output.role === "image" || row.output.role === "thumbnail"
        : assetOf(row.output) === asset),
  );
  if (record === undefined) return undefined;
  const file = retainedFile(api, projectId, state.revisionId, record);
  return asset === "images.zip"
    ? {
        ...file,
        url: revisionFileUrl(api, projectId, state.revisionId, "images.zip"),
        cacheKey: keys.revisionFile(projectId, state.revisionId, "images.zip"),
      }
    : file;
}

function retainedFile(
  api: Api,
  projectId: string,
  revisionId: string,
  record: RevisionOutputView,
): RevisionMediaFile {
  return {
    url: revisionFileUrl(api, projectId, revisionId, record.recordId),
    cacheKey: keys.revisionFile(projectId, revisionId, record.recordId),
    folder: { revisionId, recordId: record.recordId },
  };
}
