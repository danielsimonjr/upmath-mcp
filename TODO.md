# upmath-mcp — TODO

## Pending
- [ ] **E2E fidelity check — do before trusting this for a Beyond the Bat publish.** Render a real submission-paper `Complete.md` with `render_paper({ useUpmath: true })` and diff the output against a known-good *manual* UpMath HTML. Only after it matches should it replace the manual round-trip. (Refs: `~/Github/beyond-the-bat/CLAUDE.md` publish workflow; memory `reference_upmath_mcp_plugin`.)

## Ideas / maybe
- [ ] Migrate tool registration to `server.registerTool` with MCP tool annotations (`readOnlyHint` etc.) so clients can distinguish read-only tools.

## Done (recent)
- [x] Document the parameters of all 16 tools in the README ("Tool Parameters" section, 2026-07-11).
- [x] Backoff/throttle/cache for the rate-limited public i.upmath.me: retry with exponential backoff on 429/5xx, `UPMATH_MIN_INTERVAL_MS` throttle, session-wide render cache. Env vars documented in README (2026-07-11).
- [x] Self-installable marketplace (`.claude-plugin/marketplace.json`) + portable `npm test` smoke test wired into CI (2026-07-11).
- [x] Package as a Claude Code plugin — manifest, `.mcp.json`, bundle, `upmath` skill (2026-07-09).
- [x] Correct README to the actual 16 tools (2026-07-09).
