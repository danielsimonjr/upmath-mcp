import { build } from "esbuild";
import { readFileSync } from "node:fs";

// Version injected at build time. serverInfo used to carry a hardcoded literal, so the
// running server reported a stale number regardless of the manifests - and serverInfo is
// the only version a client can observe.
const __pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// ESM banner shim: bundled CJS deps (MCP SDK internals) need require/__filename/__dirname.
const banner =
  "import { createRequire as __createRequire } from 'node:module';" +
  "import { fileURLToPath as __fileURLToPath } from 'node:url';" +
  "import { dirname as __dirnameOf } from 'node:path';" +
  "const require = __createRequire(import.meta.url);" +
  "const __filename = __fileURLToPath(import.meta.url);" +
  "const __dirname = __dirnameOf(__filename);";

// Self-contained single-file server for the Claude Code plugin (bundle/index.mjs).
// Bundles src/index.ts + all deps (@modelcontextprotocol/sdk, zod) into one ESM file.
// esbuild compiles the TypeScript itself, so this does not depend on `bun run build`
// having run first -- one less ordering rule to remember.
// so the plugin runs with no node_modules present at the plugin root.
await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: banner },
  outfile: "bundle/index.mjs",
  // Compile-time version: serverInfo was a hardcoded literal, so it reported a stale
  // number no matter what the manifests said - the one version a client can see, lying.
  define: { __PKG_VERSION__: JSON.stringify(__pkg.version) },
  logLevel: "warning",
});
console.log("bundled -> bundle/index.mjs");
