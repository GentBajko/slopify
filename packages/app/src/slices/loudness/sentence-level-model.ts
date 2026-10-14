// Level each sentence's numbers (`sentence-level.ts`), browser-safe so recipes can carry them.
export const sentenceLevel = {
  // The sentences a sentence is held to: those whose middle is this close to its own.
  contextSeconds: 30,
  // ceiling: the most a quiet sentence is raised, and a loud one lowered.
  raiseDb: 3,
  lowerDb: 6,
  // ceiling: a raised sentence's loudest sample stays under this, in dBFS.
  peakCeilingDb: -1,
  // Speech is cut into parts at each pause at least this long, a part shorter than the
  // minimum joined to its neighbour.
  cutSeconds: 0.2,
  partSecondsMin: 1.5,
  // A second pass holds each sentence to its neighbours as the first left them.
  passes: 2,
} as const;
