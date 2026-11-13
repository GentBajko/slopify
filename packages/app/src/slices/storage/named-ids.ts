// Which of `ids` occur anywhere in `texts`, exactly as SQL's instr() would find them, without
// reading every text once per id: asked that way, a finished project's 600 file ids against 4 MB
// of saved revisions took over a second, on the one thread that answers every page.
//
// Ids of one length that begin with the same character are looked for together: every place
// their shared beginning occurs is read once and looked up. A project's ids are made close
// together and share most of their beginning, so those places are the ids themselves.
export function idsNamedIn(ids: readonly string[], texts: readonly string[]): ReadonlySet<string> {
  const found = new Set<string>();
  const groups = new Map<string, string[]>();
  for (const id of new Set(ids)) {
    if (id === "") {
      if (texts.length > 0) found.add(id);
      continue;
    }
    const key = `${String(id.length)}:${id.charAt(0)}`;
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [id]);
    else group.push(id);
  }
  for (const group of groups.values()) {
    const start = sharedStart(group);
    const length = group[0]?.length ?? 0;
    const wanted = new Set(group);
    for (const text of texts)
      for (let at = text.indexOf(start); at !== -1; at = text.indexOf(start, at + 1)) {
        const candidate = text.slice(at, at + length);
        if (wanted.has(candidate)) found.add(candidate);
      }
  }
  return found;
}

function sharedStart(ids: readonly string[]): string {
  let shared = ids[0] ?? "";
  for (const id of ids) {
    let same = 0;
    while (same < shared.length && shared.charAt(same) === id.charAt(same)) same += 1;
    shared = shared.slice(0, same);
  }
  return shared;
}
