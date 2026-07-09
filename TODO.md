# upmath-mcp — TODO

## Pending
- [ ] **E2E fidelity check — do before trusting this for a Beyond the Bat publish.** Render a real submission-paper `Complete.md` with `render_paper({ useUpmath: true })` and diff the output against a known-good *manual* UpMath HTML. Only after it matches should it replace the manual round-trip. (Refs: `~/Github/beyond-the-bat/CLAUDE.md` publish workflow; memory `reference_upmath_mcp_plugin`.)

## Ideas / maybe
- [ ] Document the parameters of the 10 tools that were undocumented until the 2026-07-09 README fix (README now lists names only): `scan_document_math`, `validate_equations`, `render_batch_cached`, `render_equation_sheet`, `render_parameter_grid`, `render_diff`, `list_diagram_templates`, `render_diagram_template`, `build_notation_table`.
- [ ] For whole-paper renders against the public i.upmath.me (rate-limited), add a batching/backoff default, or surface the self-host path more prominently (`docker run -t -p 8080:80 ghcr.io/parpalak/i.upmath.me:master` + `UPMATH_URL`).

## Done (recent)
- [x] Package as a Claude Code plugin — manifest, `.mcp.json`, bundle, `upmath` skill (2026-07-09).
- [x] Correct README to the actual 16 tools (2026-07-09).
