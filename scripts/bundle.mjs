import { build } from "esbuild";

// ESM banner shim: bundled CJS deps (MCP SDK internals) need require/__filename/__dirname.
const banner =
  "import { createRequire as __createRequire } from 'node:module';" +
  "import { fileURLToPath as __fileURLToPath } from 'node:url';" +
  "import { dirname as __dirnameOf } from 'node:path';" +
  "const require = __createRequire(import.meta.url);" +
  "const __filename = __fileURLToPath(import.meta.url);" +
  "const __dirname = __dirnameOf(__filename);";

// Self-contained single-file server for the Claude Code plugin (bundle/index.mjs).
// Bundles server.js + all deps (@modelcontextprotocol/sdk, zod) into one ESM file
// so the plugin runs with no node_modules present at the plugin root.
await build({
  entryPoints: ["server.js"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  banner: { js: banner },
  outfile: "bundle/index.mjs",
  logLevel: "warning",
});
console.log("bundled -> bundle/index.mjs");
