import { join } from "node:path";
import type { Alias } from "vite";

// The build and the test run resolve the same two names, so a module that a component
// test imports is the module the bundle ships.
//
// `@app/*` is the server package. tsconfig.json maps it to `../app/dist/*` for the
// declarations tsc reads; a bundler cannot use those, so the same specifier is rewritten
// here to the TypeScript source behind them. Only the slot grammar of
// `slices/admission/substitute.ts` and the save lint of `slices/library/lint.ts` are
// imported for their values - both are pure string code with no Node import beneath them
// (03-conventions: one rule, one implementation).
export function aliases(packageDir: string): readonly Alias[] {
  return [
    { find: /^@app\/(.*)\.js$/, replacement: `${join(packageDir, "../app/src")}/$1.ts` },
    { find: "@", replacement: join(packageDir, "src") },
  ];
}
