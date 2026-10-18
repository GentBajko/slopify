import { join } from "node:path";
import type { Alias } from "vite";

// The build and the test run resolve the same two names, so a module that a component test
// imports is the module the bundle ships.
//
// `@app/*` is the server package. tsconfig.json maps it to `../app/dist/*` for the declarations
// tsc reads; a bundler cannot use those, so the same specifier is rewritten here to the
// TypeScript source behind them. Many app modules are imported for their values (admission's
// rules, the slot grammar, the save lint, the keywords Slopify fills and their rules, scenes
// and more); each must stay pure, with no Node import beneath it, so the editor and the server
// run one implementation of one rule.
export function aliases(packageDir: string): readonly Alias[] {
  return [
    { find: /^@app\/(.*)\.js$/, replacement: `${join(packageDir, "../app/src")}/$1.ts` },
    { find: "@", replacement: join(packageDir, "src") },
  ];
}
