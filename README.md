# UpMath MCP Server

MCP server that gives Claude Code direct access to LaTeX rendering via the [UpMath API](https://upmath.me/). Renders equations, TikZ diagrams, and full documents to SVG/PNG without a local TeX installation.

## Tools

| Tool | Description |
|------|-------------|
| `render_equation` | Render LaTeX equation to SVG or PNG |
| `render_tikz` | Render TikZ/pgfplots/circuitikz diagram to SVG or PNG |
| `render_batch` | Render multiple equations at once, saving to files |
| `render_markdown_with_math` | Render markdown with `$$...$$` math to HTML with embedded SVGs |
| `check_syntax` | Validate LaTeX syntax without saving |
| `get_render_url` | Get the UpMath URL for embedding in HTML/markdown |

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
