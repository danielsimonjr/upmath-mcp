# upmath-mcp — Changelog

All notable changes to the UpMath MCP server. Format follows
[Keep a Changelog](https://keepachangelog.com/); reverse chronological (latest first).

---

## [Unreleased]

### Added
- **Packaged as a Claude Code plugin** (`e784c0b`, 2026-07-09): `.claude-plugin/plugin.json`, `.mcp.json` (`${CLAUDE_PLUGIN_ROOT}/bundle/index.mjs`), and a committed self-contained `bundle/index.mjs` (esbuild-bundled `server.js` + `@modelcontextprotocol/sdk` + `zod`, node20 ESM) so the plugin runs with no `node_modules` at the plugin root. Added `scripts/bundle.mjs` + `npm run bundle`, matching the sibling `*-mcp` plugins.
- **Companion `upmath` skill** (`skills/upmath/SKILL.md`): a playbook for all 16 tools and the UpMath round-trip, flagging the `render_paper` `useUpmath: true` requirement for the Beyond the Bat publish workflow (which mandates UpMath server-side SVG over KaTeX).
- Registered in the `local-marketplace` (source: this repo's GitHub URL) and enabled in user `settings.json`. Activate with `/plugin marketplace update local-marketplace` + `/reload-plugins`.

### Fixed
- **README tool table corrected from 6 tools to the actual 16.** The server had grown (`render_paper`, `scan_document_math`, `validate_equations`, `render_batch_cached`, `render_equation_sheet`, `render_parameter_grid`, `render_diff`, `list_diagram_templates`, `render_diagram_template`, `build_notation_table`) while the README still listed only the original 6.

### Changed
- `@modelcontextprotocol/sdk` 1.27.1 → 1.29.0, `zod` 4.3.6 → 4.4.3, and dev `esbuild` → 0.28.1 (Dependabot #11 / #12 / #13). `bundle/index.mjs` was rebuilt against SDK 1.29.0 and smoke-tested through the MCP initialize/tools-list handshake (all 16 tools returned).

> Not yet end-to-end verified: `render_paper`'s output has not been diffed against a real *manual* UpMath HTML — see `TODO.md` before relying on it for a publish.

---

## [2.0.0] - 2026-03-23

### Added
- Document intelligence, diagram templates, and interactive exploration tools, bringing the server to **16 tools** total (`9f3b0c4`).

## [1.0.0] - 2026-03-22

### Added
- Initial UpMath MCP server: LaTeX / TikZ / equation rendering to SVG/PNG via the [i.upmath.me](https://i.upmath.me) API, with no local TeX installation (`adef17c`). Added `render_paper` for full-document rendering (`fa39d34`).
