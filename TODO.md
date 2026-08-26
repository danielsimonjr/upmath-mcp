# upmath-mcp — TODO

## Pending
- [ ] **BUG: the emphasis pass runs after SVG insertion and corrupts rendered math.**
  `server.js:450` — `.replace(/\*(.+?)\*/g, "<em>$1</em>")` is applied to content that
  already contains inserted `<svg>`. UpMath embeds an iframe-sizing script in each SVG
  containing `postMessage(..., "*")`, so that `"*"` becomes `<em>`, and the resulting
  malformed markup can swallow the following heading. Measured 2026-08-26 on a real
  publish: **48 of 632 SVGs corrupted in Beyond the Bat Part III, 14 of 49 in Part II**,
  and Part III lost its `### E.3.2 The Master Dynamics` heading entirely from the output.
  Fix: run the math substitution *after* the inline-emphasis pass, or mask `<svg>...</svg>`
  spans while applying emphasis. Consumers currently work around it by stripping
  `<script type="text/ecmascript">...</script>` post-render (also frees ~100KB on a
  math-heavy paper, since that script does nothing outside upmath.me's own iframe).
  Verification that catches it: compare every `.md` heading string against the rendered
  HTML's extracted text — a count-only check passes while a heading is missing.
- [~] **E2E fidelity check — partially answered 2026-08-26.** Used for a real publish (BTB Parts I/II/III). The *specified* diff-against-known-good-manual-HTML was not run, because no known-good manual HTML existed — the prior artifacts were months stale and used external `i.upmath.me` images. Verified instead by heading-string coverage (55/55, 49/49, 152/152 after the bug above was worked around) and SVG integrity (no empty/error stubs; min 563 bytes). Output is arguably *better* than the manual route: inline `<svg>` rather than external images, so no third-party dependency at view or print time. Remaining doubt is visual/typographic fidelity, which none of these checks cover.
- [ ] **Original item, still open:** Render a real submission-paper `Complete.md` with `render_paper({ useUpmath: true })` and diff the output against a known-good *manual* UpMath HTML. Only after it matches should it replace the manual round-trip. (Refs: `~/Github/beyond-the-bat/CLAUDE.md` publish workflow; memory `reference_upmath_mcp_plugin`.)

## Ideas / maybe
- [ ] Migrate tool registration to `server.registerTool` with MCP tool annotations (`readOnlyHint` etc.) so clients can distinguish read-only tools.

## Done (recent)
- [x] Document the parameters of all 16 tools in the README ("Tool Parameters" section, 2026-07-11).
- [x] Backoff/throttle/cache for the rate-limited public i.upmath.me: retry with exponential backoff on 429/5xx, `UPMATH_MIN_INTERVAL_MS` throttle, session-wide render cache. Env vars documented in README (2026-07-11).
- [x] Self-installable marketplace (`.claude-plugin/marketplace.json`) + portable `npm test` smoke test wired into CI (2026-07-11).
- [x] Package as a Claude Code plugin — manifest, `.mcp.json`, bundle, `upmath` skill (2026-07-09).
- [x] Correct README to the actual 16 tools (2026-07-09).
