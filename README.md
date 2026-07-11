# UpMath MCP Server

MCP server that gives Claude Code direct access to LaTeX rendering via the [UpMath API](https://upmath.me/). Renders equations, TikZ diagrams, and full documents to SVG/PNG without a local TeX installation.

## Tools (16)

**Single render / embed**

| Tool | Description |
|------|-------------|
| `render_equation` | Render a LaTeX equation to SVG or PNG (optionally save to file) |
| `render_tikz` | Render a TikZ/pgfplots/circuitikz/tikz-3dplot diagram to SVG or PNG |
| `get_render_url` | Get the UpMath image URL for a LaTeX expression (embed, no file) |
| `check_syntax` | Validate a LaTeX snippet by attempting to render it |

**Documents / papers**

| Tool | Description |
|------|-------------|
| `render_paper` | Render a full markdown paper (`$$...$$` math, headings, tables, code) to publication-ready HTML. `useUpmath:false` (default) uses KaTeX; `useUpmath:true` renders all math via the UpMath SVG API |
| `render_markdown_with_math` | Render markdown with `$$...$$` math to HTML with embedded UpMath SVGs |
| `scan_document_math` | Inventory every equation in a markdown file |
| `validate_equations` | Validate all equations in a document, reporting failures |

**Batch / iteration**

| Tool | Description |
|------|-------------|
| `render_batch` | Render multiple equations at once, saving each to a file |
| `render_batch_cached` | Batch render with caching — skips unchanged equations |
| `render_equation_sheet` | Render named equations into one reference-sheet HTML page |
| `render_parameter_grid` | Render a LaTeX template across a grid of parameter values |
| `render_diff` | Render two versions of an equation side by side for comparison |

**Diagrams / notation**

| Tool | Description |
|------|-------------|
| `list_diagram_templates` | List the built-in TikZ diagram templates |
| `render_diagram_template` | Render a named TikZ template |
| `build_notation_table` | Build a symbol/notation table from a document |

## Supported Packages

Everything TeX Live supports, including:

| Category | Packages |
|----------|----------|
| Math | All standard LaTeX math, `mathrsfs`, `esvect`, `stmaryrd` |
| Graphics | `tikz` + libraries, `tikz-3dplot`, `pgfplots`, `pgflibrary` |
| Diagrams | `circuitikz` (circuits), `bussproofs` (proofs) |
| Chemistry | `mhchem` |
| Formatting | `array`, `xcolor`, `kotex` |

## Setup

### As a Claude Code plugin (recommended)

The repo is its own plugin marketplace. In Claude Code:

```
/plugin marketplace add danielsimonjr/upmath-mcp
/plugin install upmath-mcp@upmath
```

This loads the bundled server (no `npm install` needed) plus the companion `upmath` skill.

### As a plain MCP server

```bash
git clone https://github.com/danielsimonjr/upmath-mcp.git
cd upmath-mcp
npm install
```

Add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "upmath": {
      "command": "node",
      "args": ["/path/to/upmath-mcp/server.js"]
    }
  }
}
```

Restart Claude Code. The rendering tools will be available.

## Configuration

All settings are environment variables (set them in the `env` block of your MCP config):

| Variable | Default | Purpose |
|----------|---------|---------|
| `UPMATH_URL` | `https://i.upmath.me` | Renderer base URL (point at a self-hosted instance) |
| `UPMATH_TIMEOUT_MS` | `30000` | Per-request timeout |
| `UPMATH_RETRIES` | `3` | Retries on 429/5xx/network errors (exponential backoff) |
| `UPMATH_RETRY_BASE_MS` | `1000` | First backoff delay (doubles per retry) |
| `UPMATH_MIN_INTERVAL_MS` | `100` | Minimum gap between API requests (politeness throttle for the public API) |

Reliability behavior (built in, no flags needed):

- **Retry with backoff** — 429/5xx responses and network errors are retried automatically.
- **Session-wide render cache** — identical LaTeX+format pairs are fetched once per server session; re-running `render_paper` on an edited document only re-renders changed equations.
- **Request throttling** — API calls are spaced by `UPMATH_MIN_INTERVAL_MS` to respect the public service's rate limits.
- **Size guard** — expressions too large for the GET API fail fast with a clear message instead of a cryptic server error.

## Tool Parameters

Common conventions: `format` is `"svg"` (default) or `"png"`; `saveTo` writes the output to a file instead of returning it inline; file paths are resolved relative to the server's working directory (absolute paths are safest).

**Single render / embed**

- `render_equation({ latex, format?, saveTo? })` — `latex` is the raw (un-encoded) expression.
- `render_tikz({ tikz, packages?, format?, saveTo? })` — `tikz` includes `\begin{tikzpicture}...\end{tikzpicture}`; `packages` is an array like `["circuitikz", "pgfplots"]` prepended as `\usepackage{...}`.
- `get_render_url({ latex, format? })` — returns the `i.upmath.me` URL only; no API call, no file.
- `check_syntax({ latex })` — renders to SVG and reports valid / empty / error.

**Documents / papers**

- `render_paper({ inputFile, outputFile, title?, author?, useUpmath? })` — full markdown paper → HTML. `useUpmath: false` (default) embeds KaTeX (fast, client-side); `useUpmath: true` renders every equation to server-side SVG (supports TikZ). `title` defaults to the first `#` heading.
- `render_markdown_with_math({ markdown, saveTo? })` — markdown *string* (not a file) with `$$...$$` → HTML with embedded SVGs.
- `scan_document_math({ inputFile, outputReport? })` — equation inventory, symbol frequency, numbering checks; `outputReport` saves the full JSON.
- `validate_equations({ inputFile, maxEquations? })` — renders each equation to verify it; `maxEquations` caps API calls (default 50, `-1` = all).

**Batch / iteration**

- `render_batch({ equations, format?, outputDir })` — `equations` is `[{ name, latex }, ...]`; each saved as `<name>.<format>` in `outputDir`.
- `render_batch_cached({ equations, format?, outputDir })` — same, reporting which files came from the session cache.
- `render_equation_sheet({ title?, equations, saveTo? })` — `equations` is `[{ name, latex, description? }, ...]` → one reference-sheet HTML page.
- `render_parameter_grid({ latexTemplate, paramName?, values, saveTo? })` — substitutes each of `values` for `{PARAM}` (or `{<paramName>}`) in the template and renders a comparison grid.
- `render_diff({ before, after, label?, saveTo? })` — two LaTeX versions side by side as HTML.

**Diagrams / notation**

- `list_diagram_templates()` — no parameters.
- `render_diagram_template({ template, params?, format?, saveTo? })` — `template` is one of `control-system`, `neural-network`, `state-machine`, `bayesian-network`, `signal-flow`, `data-plot`, `commutative-diagram`; `params` is an object (or JSON string) of template-specific overrides.
- `build_notation_table({ inputFile, format?, saveTo? })` — `format` is `markdown` (default), `latex`, or `html`.

## Examples

Render the quadratic formula:
```
render_equation({ latex: "\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", format: "svg" })
```

Render a circuit:
```
render_tikz({
  tikz: "\\begin{circuitikz}\\draw (0,0) to[R, l=$R_1$] (2,0) to[C, l=$C_1$] (4,0);\\end{circuitikz}",
  packages: ["circuitikz"],
  format: "svg",
  saveTo: "circuit.svg"
})
```

## Self-Hosting

You can run your own UpMath renderer:

```bash
docker run -t -p 8080:80 ghcr.io/parpalak/i.upmath.me:master
```

Then set `UPMATH_URL=http://localhost:8080` in your environment.

## License

MIT

## Credits

- [UpMath](https://upmath.me/) by [parpalak](https://github.com/parpalak) — the rendering engine
- [i.upmath.me](https://github.com/parpalak/i.upmath.me) — the LaTeX-to-SVG API
