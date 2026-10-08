// The planner rebuilds a project's whole plan several times a runner tick, on the server's one
// thread, and each rebuild ran the same pure text work again over the full narration: matching
// the pronunciation glossary, cutting chunks, parsing the glossary. On a 2-hour narration that
// held the thread for seconds at a time, so the app stopped answering while a project ran.
// A pure function's last few results, by its exact input. Not a service: nothing is injected or
// shared but answers the function would give anyway. Results are frozen data, never mutated.
export function remembered<A extends readonly unknown[], R>(
  size: number,
  keyOf: (...args: A) => string,
  work: (...args: A) => R,
): (...args: A) => R {
  const results = new Map<string, R>();
  return (...args: A): R => {
    const key = keyOf(...args);
    const known = results.get(key);
    if (known !== undefined || results.has(key)) {
      results.delete(key);
      results.set(key, known as R);
      return known as R;
    }
    const value = work(...args);
    results.set(key, value);
    if (results.size > size) results.delete(results.keys().next().value as string);
    return value;
  };
}
