// What an editor shows while the list it reads the row from is still in flight: the
// two-column outline. `sheet` below is the one panel style the forms use, so the outline
// cannot drift from the form it stands in for.
export const sheet = "rounded-media border border-line bg-surface p-4";

export function EditorSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className={`${sheet} flex flex-col gap-4`}>
        <span className="h-8 w-64 rounded-control bg-sunken" />
        <span className="h-[520px] rounded-control bg-sunken" />
      </div>
      <div className="flex flex-col gap-3 pt-1">
        <span className="h-3 w-28 rounded-control bg-sunken" />
      </div>
    </div>
  );
}
