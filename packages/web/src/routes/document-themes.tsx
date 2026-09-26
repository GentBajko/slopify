import type { SavedDocumentTheme } from "@app/slices/document/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { removeDocumentTheme } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { documentThemesQuery, keys } from "@/queries";
import { LibraryToolbar } from "@/routes/library";

const row =
  "grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-x-[14px] border-b border-line px-4 py-[10px] last:border-b-0";

const builtInRow =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-[14px] border-b border-line px-4 py-[10px] last:border-b-0";

// Library → Documents: the looks a project's PDF can take. The built-ins can't be changed,
// only copied; a saved theme is edited here and chosen on the Document row of Play or in
// Edit project, which each keep their own copy of it.
export function DocumentThemesRoute() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const listing = useQuery(documentThemesQuery(api));
  const [deleting, setDeleting] = useState<SavedDocumentTheme | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeDocumentTheme(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.documentThemes });
    },
  });

  return (
    <div>
      <LibraryToolbar
        action={
          <Button asChild>
            <Link to="/document-themes/new" search={{ from: "plain" }}>
              <PlusIcon aria-hidden="true" className="size-[14px]" />
              New theme
            </Link>
          </Button>
        }
      >
        <p className="text-small text-ink2">
          How a project's PDF looks. Pick one on the Document row in Play or in Edit project.
        </p>
      </LibraryToolbar>

      {listing.error === null ? null : (
        <RailGroup>
          <p className="px-4 py-[14px] text-body text-red">{listing.error.message}</p>
        </RailGroup>
      )}

      {listing.data === undefined ? null : (
        <div className="flex flex-col gap-5">
          <section aria-labelledby="document-themes-yours">
            <h2 id="document-themes-yours" className="mb-2 text-small font-semibold text-ink2">
              Your themes
            </h2>
            {listing.data.themes.length === 0 ? (
              <RailGroup>
                <p className="px-4 py-[14px] text-body text-ink2">
                  No themes of your own yet. Copy a built-in below to start one.
                </p>
              </RailGroup>
            ) : (
              <RailGroup>
                {listing.data.themes.map((theme) => (
                  <div key={theme.id} className={row}>
                    <Link
                      to="/document-themes/$themeId"
                      params={{ themeId: theme.id }}
                      className="min-w-0 truncate font-semibold hover:underline"
                    >
                      {theme.name}
                    </Link>
                    <Swatches colors={theme.values.colors} />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          aria-label={`More for ${theme.name}`}
                          className="size-8 p-0"
                        >
                          <EllipsisIcon aria-hidden="true" className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to="/document-themes/$themeId" params={{ themeId: theme.id }}>
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to="/document-themes/new" search={{ from: theme.id }}>
                            Duplicate
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setDeleting(theme);
                          }}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ))}
              </RailGroup>
            )}
          </section>

          <section aria-labelledby="document-themes-built-in">
            <h2 id="document-themes-built-in" className="mb-2 text-small font-semibold text-ink2">
              Built in
            </h2>
            <RailGroup>
              {listing.data.builtIns.map((theme) => (
                <div key={theme.name} className={builtInRow}>
                  <span className="min-w-0 truncate font-semibold">{theme.label}</span>
                  <Swatches colors={theme.values.colors} />
                  <Button asChild>
                    <Link to="/document-themes/new" search={{ from: theme.name }}>
                      Copy
                    </Link>
                  </Button>
                </div>
              ))}
            </RailGroup>
          </section>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title={`Delete "${deleting?.name ?? ""}"?`}
        consequence="Projects that used it keep their own copy of its settings."
        verb="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting.id);
        }}
        onCancel={() => {
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

function Swatches({
  colors,
}: {
  readonly colors: { readonly heading: string; readonly text: string; readonly muted: string };
}) {
  return (
    <span aria-hidden="true" className="flex gap-1">
      {[colors.heading, colors.text, colors.muted].map((color, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: three fixed swatches
          key={index}
          className="size-3 rounded-full border border-line"
          style={{ backgroundColor: color.startsWith("#") ? color : `#${color}` }}
        />
      ))}
    </span>
  );
}
