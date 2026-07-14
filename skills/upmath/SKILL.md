---
name: upmath
description: 'Render LaTeX, TikZ, and markdown-with-math to SVG/PNG/HTML via the upmath-mcp server (i.upmath.me API, no local TeX install). Use when the user wants to render an equation or diagram to an image, validate/scan LaTeX in a document, get an embeddable UpMath image URL, build an equation sheet or notation table, or convert a markdown/LaTeX paper with `$$...$$` math into publication-ready HTML — including the "UpMath round-trip" that turns an assembled paper `Complete.md` into `paper.html`. Triggers: "render this equation/TikZ/circuit", "LaTeX to SVG/PNG", "check/scan my LaTeX", "embed this equation", "equation sheet", "run the UpMath round-trip", "regenerate paper.html", "markdown math to HTML".'
---

# UpMath — LaTeX/TikZ/markdown-math rendering (no local TeX)

Guidance for the **upmath-mcp** server. It renders LaTeX server-side through
[i.upmath.me](https://i.upmath.me) (TeX Live behind an SVG/PNG API), so nothing
needs a local TeX installation. Tools appear as
`mcp__plugin_upmath-mcp_upmath-mcp__<tool>`.

## When to use

- Turn an equation or a TikZ/pgfplots/circuitikz/tikz-3dplot diagram into an **SVG or PNG**.
- Convert a **markdown/LaTeX paper with `$$...$$` math into publication-ready HTML** — the **UpMath round-trip**.
- **Validate or inventory** the LaTeX in a document, build an **equation sheet** or **notation table**, or diff/grid equations while iterating.

## Tools (16)

**Single render / embed**
| Tool | Use it for |
|------|-----------|
| `render_equation` | One LaTeX equation → SVG/PNG (optionally `saveTo`). |
| `render_tikz` | A TikZ / pgfplots / circuitikz / tikz-3dplot diagram → SVG/PNG. Pass the `packages` array. |
| `get_render_url` | The `i.upmath.me/svg/<encoded>` URL to embed directly, no file written. |
| `check_syntax` | Validate one LaTeX snippet by attempting to render it. Cheap pre-flight. |

**Documents / papers**
| Tool | Use it for |
|------|-----------|
| `render_paper` | **A full markdown paper with `$$...$$` → publication-ready HTML** (headings, bold/italic, lists, tables, code). Default `useUpmath:false` = KaTeX (fast, client-side); `useUpmath:true` = all math via UpMath SVG (slower, supports TikZ). **See the gotcha below.** |
| `render_markdown_with_math` | Markdown with `$$...$$` → HTML with embedded **UpMath SVG** math. |
| `scan_document_math` | Inventory every equation in a markdown file (audit before rendering). |
| `validate_equations` | Validate all equations in a file, reporting failures. |

**Batch / iteration**
| Tool | Use it for |
|------|-----------|
| `render_batch` | Many equations → one file each. |
| `render_batch_cached` | Same, but skips unchanged equations — much faster on re-runs. |
| `render_equation_sheet` | A set of named equations → one reference-sheet HTML page. |
| `render_parameter_grid` | Render a LaTeX template across a grid of parameter values. |
| `render_diff` | Two versions of an equation side by side (HTML comparison). |

**Diagrams / notation**
| Tool | Use it for |
|------|-----------|
| `list_diagram_templates` | List the built-in TikZ templates. |
| `render_diagram_template` | Render a named TikZ template. |
| `build_notation_table` | Build a symbol/notation table from a document. |

## The headline workflow: the UpMath round-trip

This replaces the old **manual** step (paste `Complete.md` into upmath.me → save HTML).

1. Assemble the paper's `Complete.md` (per the project's assembly command).
2. `render_paper({ inputFile: ".../Complete.md", outputFile: "paper.html", useUpmath: true })` → publication-ready HTML with server-side SVG math. (Or `render_markdown_with_math` for the raw HTML fragment.)
3. Wrap with the project's **print CSS** (margins/pagination).
4. Chrome headless → PDF; copy `paper.html` + PDF to the deploy repo; push.

> **⚠️ Beyond the Bat gotcha — force UpMath, not KaTeX.** `render_paper` defaults to `useUpmath:false`, which renders math with **KaTeX**. The Beyond the Bat publish workflow *mandates UpMath server-side SVG and explicitly forbids the KaTeX path* (it produces different output; the legacy `scripts/generate_html_for_pdf.py` is deprecated for the same reason). For that project's round-trip, **always pass `useUpmath: true`** (or use `render_markdown_with_math`). For other projects where KaTeX is fine, the default is faster.

## Gotchas

- **Third-party API.** i.upmath.me is Roman Parpalak's public service — mind availability. The server now handles rate limits itself: automatic retry with exponential backoff on 429/5xx, a politeness throttle between requests (`UPMATH_MIN_INTERVAL_MS`, default 100ms), and a session-wide render cache (identical LaTeX is fetched once — re-running a paper only re-renders changed equations). For heavy use, **self-host**: `docker run -t -p 8080:80 ghcr.io/parpalak/i.upmath.me:master`, then set `UPMATH_URL=http://localhost:8080` (default `https://i.upmath.me`).
- **TikZ needs its packages.** Circuits/plots/proofs fail without the right `packages` array. `check_syntax` / `validate_equations` first for anything non-trivial.
- **Pass raw LaTeX** — URL-encoding is handled server-side.
- **SVG for print/web** (crisp, small); PNG only when a consumer can't take SVG.
- **Idempotent.** Same LaTeX → same SVG, so re-running the round-trip is safe.

## Cross-references

- Beyond the Bat publish workflow: `~/Github/beyond-the-bat/CLAUDE.md` (print-CSS wrap → Chrome PDF → deploy).
- Rendering engine: [UpMath](https://upmath.me/) / [i.upmath.me](https://github.com/parpalak/i.upmath.me) by parpalak.
