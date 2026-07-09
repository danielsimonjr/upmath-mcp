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
