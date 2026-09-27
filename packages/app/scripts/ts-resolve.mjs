import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "esbuild";

// Runs the TypeScript sources in place, so every `import.meta.url` (migrations, assets)
// resolves where it does in the app: `./x.js` imports map to `./x.ts` the way tsc resolves
// them, and each .ts file is compiled by esbuild as it loads.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith(".js") && (specifier.startsWith(".") || specifier.startsWith("/"))) {
      const candidate = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
      if (
        !existsSync(fileURLToPath(new URL(specifier, context.parentURL))) &&
        existsSync(fileURLToPath(candidate))
      )
        return next(candidate.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (!url.endsWith(".ts")) return next(url, context);
    const { code } = transformSync(readFileSync(fileURLToPath(url), "utf8"), {
      loader: "ts",
      format: "esm",
      target: "node24",
      sourcefile: fileURLToPath(url),
    });
    return { format: "module", source: code, shortCircuit: true };
  },
});
