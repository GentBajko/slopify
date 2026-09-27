import type { SavedDocumentTheme } from "@app/slices/document/model.js";
import type { DocumentTheme } from "@app/slices/document/theme.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useState } from "react";
import { removeDocumentTheme } from "@/api";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { ConfirmDialog } from "@/components/kit/dialog";
import { ListDetail } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { faceFamilies } from "@/lib/document-theme-fields";
import { updatedOn } from "@/library/item-detail";
import { ListSkeleton, LoadError, libraryListDetail, libraryRow } from "@/library/list-states";
import { LibraryRowActions } from "@/library/row-actions";
import { documentThemesQuery, keys } from "@/queries";
import { LibraryToolbar } from "@/routes/library";

// A row picked for the detail column: one of your themes by id, or a built-in by name.
type Picked = { readonly saved: string } | { readonly builtIn: string };

// Library → Documents: the looks a project's PDF can take, beside the selected one's colours,
// fonts and page. The built-ins can't be changed, only copied; a saved theme is edited here
// and chosen on the Document row of Play or in Edit project, which each keep their own copy.
export function DocumentThemesRoute() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const listing = useQuery(documentThemesQuery(api));
  const [picked, setPicked] = useState<Picked | undefined>(undefined);
  const [deleting, setDeleting] = useState<SavedDocumentTheme | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeDocumentTheme(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.documentThemes });
    },
  });

  const data = listing.data;
  const pickedSaved =
    picked !== undefined && "saved" in picked
      ? data?.themes.find((theme) => theme.id === picked.saved)
      : undefined;
  const pickedBuiltIn =
    picked !== undefined && "builtIn" in picked
      ? data?.builtIns.find((theme) => theme.name === picked.builtIn)
      : undefined;
  // Nothing picked (or the picked one is gone): the first of yours, else the first built-in.
  const fallbackSaved =
    pickedSaved === undefined && pickedBuiltIn === undefined ? data?.themes[0] : undefined;
  const shownSaved = pickedSaved ?? fallbackSaved;
  const shownBuiltIn = shownSaved === undefined ? (pickedBuiltIn ?? data?.builtIns[0]) : undefined;

  return (
    <div>
      <LibraryToolbar
        action={
          <ButtonLink to="/document-themes/new" search={{ from: "plain" }} variant="primary">
            New theme
          </ButtonLink>
        }
      >
        <p className="m-0 text-small text-ink-2">
          How a project's PDF looks. Pick one on the Document row in Play or in Edit project.
        </p>
      </LibraryToolbar>

      {listing.error === null ? null : (
        <LoadError
          what="document themes"
          message={listing.error.message}
          onRetry={() => void listing.refetch()}
        />
      )}

      {data === undefined ? (
        listing.error === null ? (
          <ListSkeleton label="Document themes" />
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
                />
                {data.themes.length === 0 ? (
                  <p className="m-0 text-small text-ink-2">
                    No themes of your own yet. Copy a built-in below to start one.
                  </p>
                ) : (
                  <List label="Your themes">
                    {data.themes.map((theme) => (
                      <ListRow
                        key={theme.id}
                        className={libraryRow}
                        lead={<Swatches colors={theme.values.colors} />}
                        title={theme.name}
                        meta={`${themeMeta(theme.values)} · updated ${updatedOn(theme.updatedAt)}`}
                        selected={theme.id === shownSaved?.id}
                        onSelect={() => setPicked({ saved: theme.id })}
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
                      onSelect={() => setPicked({ builtIn: theme.name })}
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
                meta={`Updated ${updatedOn(shownSaved.updatedAt)}`}
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
        title={`Delete "${deleting?.name ?? ""}"?`}
        consequence="Projects that used it keep their own copy of its settings."
        confirmLabel="Delete theme"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(undefined)}
      />
    </div>
  );
}

function themeMeta(values: DocumentTheme): string {
  return `${values.page.format === "a4" ? "A4" : "Letter"} · ${familyLabel(values.fonts.body.family)} body`;
}

function familyLabel(family: string): string {
  return faceFamilies.find((one) => one.value === family)?.label ?? family;
}

function hex(color: string): string {
  return color.startsWith("#") ? color : `#${color}`;
}

// The selected theme at a glance: its colours, its fonts and its page.
function ThemeDetail({
  name,
  kicker,
  meta,
  values,
  action,
}: {
  readonly name: string;
  readonly kicker: string;
  readonly meta: string;
  readonly values: DocumentTheme;
  readonly action: ReactNode;
}): ReactElement {
  const colors: readonly (readonly [string, string])[] = [
    ["Headings", values.colors.heading],
    ["Text", values.colors.text],
    ["Muted", values.colors.muted],
    ["Header and page numbers", values.colors.faint],
  ];
  const fonts: readonly (readonly [string, DocumentTheme["fonts"]["body"]])[] = [
    ["Body", values.fonts.body],
    ["Headings", values.fonts.heading],
    ["Drop cap", values.fonts.dropCap],
  ];
  return (
    <section aria-label={`${name} details`} className="flex min-w-0 flex-col gap-6">
      <SectionHead title={name} kicker={kicker} meta={meta} className="pb-0">
        {action}
      </SectionHead>
      <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[max-content_minmax(0,1fr)]">
        {colors.map(([label, color]) => (
          <Pair key={label} label={label}>
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-4 rounded-full border border-line"
                style={{ backgroundColor: hex(color) }}
              />
              <span className="font-mono text-small">{hex(color)}</span>
            </span>
          </Pair>
        ))}
        {fonts.map(([label, face]) => (
          <Pair key={`font-${label}`} label={`${label} font`}>
            {`${familyLabel(face.family)}, ${face.style}`}
          </Pair>
        ))}
        <Pair label="Page">
          {`${values.page.format === "a4" ? "A4" : "Letter"}, ${
            values.background.image === "parchment"
              ? "parchment"
              : `flat ${hex(values.background.color)}`
          } background`}
        </Pair>
      </dl>
    </section>
  );
}

function Pair({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-small text-ink-2">{label}</dt>
      <dd className="m-0 min-w-0 text-body text-ink">{children}</dd>
    </>
  );
}

function Swatches({
  colors,
}: {
  readonly colors: { readonly heading: string; readonly text: string; readonly muted: string };
}) {
  return (
    <span aria-hidden="true" className="flex shrink-0 gap-1">
      {[colors.heading, colors.text, colors.muted].map((color, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: three fixed swatches
          key={index}
          className="size-3 rounded-full border border-line"
          style={{ backgroundColor: hex(color) }}
        />
      ))}
    </span>
  );
}
