import { documentThemeNameMax, type SavedDocumentTheme } from "@app/slices/document/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { removeDocumentTheme, saveDocumentTheme } from "@/api";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { ConfirmDialog } from "@/components/kit/dialog";
import { ListDetail } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { counted, RowCheck, useSelection } from "@/components/selection";
import { LibraryBulkBar, SelectionArea } from "@/library/bulk-bar";
import { Swatches, ThemeDetail, themeMeta } from "@/library/document-theme-parts";
import { ListSkeleton, LoadError, libraryListDetail, libraryRow } from "@/library/list-states";
import { useLibraryItem } from "@/library/list-url";
import { LibraryRowActions } from "@/library/row-actions";
import { sortLibrary, useLibrarySort } from "@/library/sort";
import { SortMenu } from "@/library/sort-menu";
import { Stamp } from "@/library/time";
import { TransferMenu } from "@/library/transfer-menu";
import { refusalOf, useLibraryBulk } from "@/library/use-library-bulk";
import { useLibraryTransfer } from "@/library/use-library-transfer";
import { documentThemesQuery, keys } from "@/queries";
import { LibraryToolbar } from "@/routes/library";

// Library → Documents: the looks a project's PDF can take, beside the selected one's colours,
// fonts and page. The built-ins can't be changed, only copied; a saved theme is edited here
// and chosen on the Document row of Play or in Edit project, which each keep their own copy.
export function DocumentThemesRoute() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const listing = useQuery(documentThemesQuery(api));
  // The row in the detail column, `?item=` in the URL: one of yours by id, a built-in by name.
  const [picked, setPicked] = useLibraryItem();
  const [sort, setSort] = useLibrarySort("document-theme");
  const [deleting, setDeleting] = useState<SavedDocumentTheme | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeDocumentTheme(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.documentThemes });
    },
  });

  const data = listing.data;
  const yours = data === undefined ? [] : sortLibrary(data.themes, sort);
  const pickedSaved = yours.find((theme) => theme.id === picked);
  const pickedBuiltIn =
    pickedSaved === undefined ? data?.builtIns.find((theme) => theme.name === picked) : undefined;
  // Nothing picked (or the picked one is gone): the first of yours, else the first built-in.
  const fallbackSaved =
    pickedSaved === undefined && pickedBuiltIn === undefined ? yours[0] : undefined;
  const shownSaved = pickedSaved ?? fallbackSaved;
  const shownBuiltIn = shownSaved === undefined ? (pickedBuiltIn ?? data?.builtIns[0]) : undefined;
  // Only your own themes are ticked: a built-in can't be deleted or exported.
  const selection = useSelection(yours.map((theme) => theme.id));
  const chosen = yours.filter((theme) => selection.has(theme.id));
  const [confirming, setConfirming] = useState(false);
  const bulk = useLibraryBulk({
    noun: themeNoun,
    listKey: keys.documentThemes,
    all: yours,
    nameMax: documentThemeNameMax,
    duplicate: async (theme, name) =>
      refusalOf(await saveDocumentTheme(api, { name, values: theme.values }, undefined)),
    remove: (theme) => removeDocumentTheme(api, theme.id),
    trash: undefined,
    selection,
  });
  const transfer = useLibraryTransfer({
    section: "documentThemes",
    pack: (items) => ({ documentThemes: items }),
    stem: "pdf-themes",
    noun: themeNoun,
    listKey: keys.documentThemes,
    existing: yours,
    groupOf: () => "",
    nameMax: documentThemeNameMax,
    save: (theme) => saveDocumentTheme(api, theme, undefined),
  });

  return (
    <div>
      <LibraryToolbar
        action={
          <>
            <TransferMenu
              what="PDF themes"
              disabled={data === undefined || transfer.importing}
              exports={[
                {
                  label: `Export all ${counted(yours.length, "theme", "themes")} of yours`,
                  run: () => transfer.exportItems(yours),
                  disabled: yours.length === 0,
                },
              ]}
              accept=".json,application/json"
              onFile={transfer.importFile}
            />
            <ButtonLink to="/document-themes/new" search={{ from: "plain" }} variant="primary">
              New theme
            </ButtonLink>
          </>
        }
      >
        <p className="m-0 text-small text-ink-2">
          How a project's PDF looks. Pick one on the Document row in Play or in Edit project.
        </p>
      </LibraryToolbar>

      {listing.error === null ? null : (
        <LoadError
          what="PDF themes"
          message={listing.error.message}
          onRetry={() => void listing.refetch()}
        />
      )}

      {data === undefined ? (
        listing.error === null ? (
          <ListSkeleton label="PDF themes" />
        ) : null
      ) : (
        <ListDetail
          className={libraryListDetail}
          list={
            <div className="flex flex-col gap-8">
              <section className="flex flex-col gap-2">
                <SectionHead
                  title="Your themes"
                  as="h3"
                  className="pb-0"
                  info="library.themes.yours"
                >
                  {yours.length > 1 ? (
                    <SortMenu what="your themes" sort={sort} onSort={setSort} />
                  ) : null}
                </SectionHead>
                {data.themes.length === 0 ? (
                  <p className="m-0 text-small text-ink-2">
                    No themes of your own yet. Copy a built-in below to start one.
                  </p>
                ) : (
                  <SelectionArea selection={selection}>
                    <LibraryBulkBar
                      selection={selection}
                      total={yours.length}
                      noun={themeNoun}
                      busy={bulk.busy}
                      onDuplicate={() => bulk.duplicate(chosen)}
                      onExport={() => transfer.exportItems(chosen)}
                      onDelete={() => setConfirming(true)}
                    />
                    <List label="Your themes">
                      {yours.map((theme) => (
                        <ListRow
                          key={theme.id}
                          className={libraryRow}
                          lead={
                            <>
                              <RowCheck selection={selection} value={theme.id} label={theme.name} />
                              <Swatches colors={theme.values.colors} />
                            </>
                          }
                          title={theme.name}
                          meta={
                            <>
                              {`${themeMeta(theme.values)} · updated `}
                              <Stamp iso={theme.updatedAt} />
                            </>
                          }
                          selected={theme.id === shownSaved?.id}
                          onSelect={() => setPicked(theme.id)}
                          actions={
                            <LibraryRowActions
                              name={theme.name}
                              edit={
                                <ButtonLink
                                  to="/document-themes/$themeId"
                                  params={{ themeId: theme.id }}
                                  aria-label={`Edit ${theme.name}`}
                                  variant="quiet"
                                  size="small"
                                >
                                  Edit
                                </ButtonLink>
                              }
                              duplicate={
                                <ButtonLink
                                  to="/document-themes/new"
                                  search={{ from: theme.id }}
                                  aria-label={`Duplicate ${theme.name}`}
                                  variant="quiet"
                                  size="small"
                                >
                                  Duplicate
                                </ButtonLink>
                              }
                              onDelete={() => setDeleting(theme)}
                            />
                          }
                        />
                      ))}
                    </List>
                  </SelectionArea>
                )}
              </section>

              <section className="flex flex-col gap-2">
                <SectionHead
                  title="Built in"
                  as="h3"
                  className="pb-0"
                  info="library.themes.built-in"
                />
                <List label="Built-in themes">
                  {data.builtIns.map((theme) => (
                    <ListRow
                      key={theme.name}
                      className={libraryRow}
                      lead={<Swatches colors={theme.values.colors} />}
                      title={theme.label}
                      meta={themeMeta(theme.values)}
                      selected={theme.name === shownBuiltIn?.name}
                      onSelect={() => setPicked(theme.name)}
                      actions={
                        <ButtonLink
                          to="/document-themes/new"
                          search={{ from: theme.name }}
                          aria-label={`Copy ${theme.label}`}
                          variant="quiet"
                          size="small"
                        >
                          Copy
                        </ButtonLink>
                      }
                    />
                  ))}
                </List>
              </section>
            </div>
          }
          detail={
            shownSaved !== undefined ? (
              <ThemeDetail
                name={shownSaved.name}
                kicker="Your theme"
                meta={
                  <>
                    Updated <Stamp iso={shownSaved.updatedAt} />
                  </>
                }
                values={shownSaved.values}
                action={
                  <ButtonLink
                    to="/document-themes/$themeId"
                    params={{ themeId: shownSaved.id }}
                    size="small"
                  >
                    Edit theme
                  </ButtonLink>
                }
              />
            ) : shownBuiltIn !== undefined ? (
              <ThemeDetail
                name={shownBuiltIn.label}
                kicker="Built in"
                meta="Built-in themes can't be changed. Copy one to make it yours."
                values={shownBuiltIn.values}
                action={
                  <ButtonLink
                    to="/document-themes/new"
                    search={{ from: shownBuiltIn.name }}
                    size="small"
                  >
                    Copy theme
                  </ButtonLink>
                }
              />
            ) : null
          }
        />
      )}

      {remove.error === null ? null : (
        <Callout tone="danger" title="The theme wasn't deleted." className="mt-4">
          {remove.error.message}
        </Callout>
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title={`Delete the PDF theme “${deleting?.name ?? ""}”?`}
        // Document themes have no Trash (slices/trash supports projects, prompts, intros and
        // outros, templates and schedules), so this delete is final.
        consequence={deleteConsequence}
        confirmLabel="Delete theme permanently"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(undefined)}
      />

      <ConfirmDialog
        open={confirming}
        title={`Delete ${counted(chosen.length, "PDF theme", "PDF themes")} permanently?`}
        consequence={`${chosen.length === 1 ? `“${chosen[0]?.name ?? ""}” is` : `These ${String(chosen.length)} themes are`} deleted permanently: PDF themes do not go to Settings → Trash, so they cannot be restored. Projects that used them keep their own copy of the settings.`}
        confirmLabel={`Delete ${counted(chosen.length, "theme", "themes")} permanently`}
        cancelLabel="Keep them"
        pending={bulk.busy}
        onConfirm={() => {
          bulk.remove(chosen);
          setConfirming(false);
        }}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

const themeNoun = ["PDF theme", "PDF themes"] as const;

export const deleteConsequence =
  "It is deleted permanently: PDF themes do not go to Settings → Trash, so it cannot be restored. Projects that used it keep their own copy of its settings.";
