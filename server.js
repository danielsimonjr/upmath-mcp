#!/usr/bin/env node
/**
 * UpMath MCP Server
 *
 * Provides LaTeX rendering tools via the UpMath API (i.upmath.me).
 * Renders equations, TikZ diagrams, and full LaTeX to SVG/PNG
 * without requiring a local TeX installation.
 *
 * API: https://i.upmath.me/svg/{encoded-latex} -> SVG
 *      https://i.upmath.me/png/{encoded-latex} -> PNG
 *
 * Supports: all standard LaTeX math, TikZ, pgfplots, circuitikz,
 *           bussproofs, mhchem, mathrsfs, xcolor, and more.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import https from "https";
import fs from "fs";
import path from "path";

const UPMATH_BASE = process.env.UPMATH_URL || "https://i.upmath.me";

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode + " from UpMath"));
        res.resume();
        return;
      }
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function renderLatex(latex, format) {
  const encoded = encodeURIComponent(latex);
  const url = UPMATH_BASE + "/" + format + "/" + encoded;
  const data = await fetchUrl(url);
  return { data, url };
}

const server = new McpServer({
  name: "upmath-mcp",
  version: "1.0.0",
});

server.tool(
  "render_equation",
  "Render a LaTeX equation to SVG or PNG via UpMath. Returns SVG markup or saves to file.",
  {
    latex: z.string().describe("LaTeX equation"),
    format: z.enum(["svg", "png"]).default("svg").describe("Output format"),
    saveTo: z.string().optional().describe("File path to save output"),
  },
  async ({ latex, format, saveTo }) => {
    const result = await renderLatex(latex, format);
    if (saveTo) {
      const absPath = path.resolve(saveTo);
      fs.writeFileSync(absPath, result.data);
      return { content: [{ type: "text", text: "Saved " + format.toUpperCase() + " (" + result.data.length + " bytes) to: " + absPath }] };
    }
    if (format === "svg") {
      return { content: [{ type: "text", text: result.data.toString("utf-8") }] };
    }
    return { content: [{ type: "image", data: result.data.toString("base64"), mimeType: "image/png" }] };
  }
);

server.tool(
  "render_tikz",
  "Render a TikZ diagram to SVG or PNG. Supports tikz, pgfplots, circuitikz, tikz-3dplot.",
  {
    tikz: z.string().describe("TikZ code including \\begin{tikzpicture}...\\end{tikzpicture}"),
    packages: z.array(z.string()).optional().describe("Additional packages (e.g., ['circuitikz', 'pgfplots'])"),
    format: z.enum(["svg", "png"]).default("svg").describe("Output format"),
    saveTo: z.string().optional().describe("File path to save output"),
  },
  async ({ tikz, packages, format, saveTo }) => {
    let preamble = "";
    if (packages && packages.length > 0) {
      for (const pkg of packages) {
        preamble += "\\usepackage{" + pkg + "} ";
      }
    }
    const fullLatex = preamble ? preamble + tikz : tikz;
    const result = await renderLatex(fullLatex, format);
    if (saveTo) {
      const absPath = path.resolve(saveTo);
      fs.writeFileSync(absPath, result.data);
      return { content: [{ type: "text", text: "TikZ diagram (" + result.data.length + " bytes) saved to: " + absPath }] };
    }
    if (format === "svg") {
      return { content: [{ type: "text", text: result.data.toString("utf-8") }] };
    }
    return { content: [{ type: "image", data: result.data.toString("base64"), mimeType: "image/png" }] };
  }
);

server.tool(
  "render_batch",
  "Render multiple LaTeX equations at once, saving each to a file.",
  {
    equations: z.array(z.object({
      name: z.string().describe("Filename without extension"),
      latex: z.string().describe("LaTeX equation"),
    })).describe("Array of {name, latex} to render"),
    format: z.enum(["svg", "png"]).default("svg").describe("Output format"),
    outputDir: z.string().describe("Directory to save files"),
  },
  async ({ equations, format, outputDir }) => {
    const absDir = path.resolve(outputDir);
    if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });
    const results = [];
    for (const eq of equations) {
      try {
        const result = await renderLatex(eq.latex, format);
        const filename = eq.name + "." + format;
        fs.writeFileSync(path.join(absDir, filename), result.data);
        results.push("  " + filename + " (" + result.data.length + " bytes)");
      } catch (err) {
        results.push("  " + eq.name + ": ERROR - " + err.message);
      }
    }
    return { content: [{ type: "text", text: "Rendered " + equations.length + " equations to " + absDir + ":\n" + results.join("\n") }] };
  }
);

server.tool(
  "check_syntax",
  "Check if LaTeX syntax is valid by attempting to render it.",
  {
    latex: z.string().describe("LaTeX to validate"),
  },
  async ({ latex }) => {
    try {
      const result = await renderLatex(latex, "svg");
      const svg = result.data.toString("utf-8");
      const hasContent = svg.includes("<path") || svg.includes("<text") || svg.includes("<g");
      return { content: [{ type: "text", text: hasContent
        ? "Valid LaTeX. Rendered successfully (" + result.data.length + " bytes SVG)."
        : "Warning: rendered but produced minimal SVG. Check syntax." }] };
    } catch (err) {
      return { content: [{ type: "text", text: "Invalid LaTeX: " + err.message }] };
    }
  }
);

server.tool(
  "get_render_url",
  "Get the UpMath URL for a LaTeX expression (for embedding in HTML/markdown).",
  {
    latex: z.string().describe("LaTeX expression"),
    format: z.enum(["svg", "png"]).default("svg").describe("Output format"),
  },
  async ({ latex, format }) => {
    const encoded = encodeURIComponent(latex);
    return { content: [{ type: "text", text: UPMATH_BASE + "/" + format + "/" + encoded }] };
  }
);

server.tool(
  "render_markdown_with_math",
  "Render markdown containing $$...$$ LaTeX to HTML with embedded SVG equations.",
  {
    markdown: z.string().describe("Markdown with $$...$$ LaTeX equations"),
    saveTo: z.string().optional().describe("File path to save HTML output"),
  },
  async ({ markdown, saveTo }) => {
    const parts = [];
    const mathRegex = /\$\$([\s\S]*?)\$\$/g;
    let lastIndex = 0;
    let match;

    while ((match = mathRegex.exec(markdown)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: "text", content: markdown.slice(lastIndex, match.index) });
      }
      try {
        const result = await renderLatex(match[1].trim(), "svg");
        parts.push({ type: "svg", content: result.data.toString("utf-8") });
      } catch (err) {
        parts.push({ type: "error", content: "[Render error: " + err.message + "]" });
      }
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < markdown.length) {
      parts.push({ type: "text", content: markdown.slice(lastIndex) });
    }

    const htmlParts = parts.map((p) => {
      if (p.type === "svg") return '<div style="text-align:center;margin:16px 0">' + p.content + "</div>";
      if (p.type === "error") return '<span style="color:red">' + p.content + "</span>";
      return "<p>" + p.content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>") + "</p>";
    });

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:"Times New Roman",serif;max-width:800px;margin:40px auto;line-height:1.6}</style></head><body>' + htmlParts.join("\n") + "</body></html>";

    if (saveTo) {
      const absPath = path.resolve(saveTo);
      fs.writeFileSync(absPath, html, "utf-8");
      return { content: [{ type: "text", text: "HTML with equations (" + html.length + " bytes) saved to: " + absPath }] };
    }
    return { content: [{ type: "text", text: html }] };
  }
);

server.tool(
  "render_paper",
  "Render a full markdown paper with $$...$$ LaTeX to a publication-ready HTML file. Uses KaTeX for standard math (fast, client-side) and falls back to UpMath API for TikZ/special packages. Handles headings, bold, italic, lists, tables, and code blocks.",
  {
    inputFile: z.string().describe("Path to the markdown file (e.g., 'Beyond the Bat (Complete).md')"),
    outputFile: z.string().describe("Path for the output HTML file"),
    title: z.string().optional().describe("Document title for the HTML head"),
    author: z.string().optional().describe("Author name"),
    useUpmath: z.boolean().optional().default(false).describe("If true, render ALL math via UpMath API (slow but supports TikZ). If false, use KaTeX CDN (fast, client-side)."),
  },
  async ({ inputFile, outputFile, title, author, useUpmath }) => {
    const absInput = path.resolve(inputFile);
    const absOutput = path.resolve(outputFile);

    if (!fs.existsSync(absInput)) {
      return { content: [{ type: "text", text: "File not found: " + absInput }] };
    }

    const md = fs.readFileSync(absInput, "utf-8");
    const lines = md.split("\n");

    // Detect title from first # heading if not provided
    if (!title) {
      for (const line of lines) {
        if (line.startsWith("# ")) {
          title = line.slice(2).trim();
          break;
        }
      }
    }

    if (useUpmath) {
      // UpMath mode: render each equation via API (slow but supports everything)
      let html = "";
      let inDisplayMath = false;
      let mathBuf = [];
      let mathCount = 0;

      for (const line of lines) {
        const stripped = line.trim();

        if (stripped === "$$" && !inDisplayMath) {
          inDisplayMath = true;
          mathBuf = [];
          continue;
        }
        if ((stripped === "$$" || /^\$\$\([^)]+\)$/.test(stripped)) && inDisplayMath) {
          inDisplayMath = false;
          const latex = mathBuf.join("\n").trim();
          if (latex) {
            try {
              const result = await renderLatex(latex, "svg");
              html += '<div class="math-display">' + result.data.toString("utf-8") + "</div>\n";
              mathCount++;
              if (mathCount % 20 === 0) {
                // Log progress for large documents
              }
            } catch {
              html += '<div class="math-error">[Render error for: ' + latex.slice(0, 50) + '...]</div>\n';
            }
          }
          continue;
        }
        if (inDisplayMath) {
          mathBuf.push(line);
          continue;
        }

        // Process inline math $$...$$ on same line
        let processed = line;
        const inlineMatches = [...processed.matchAll(/\$\$(.+?)\$\$/g)];
        for (const m of inlineMatches.reverse()) {
          const latex = m[1].trim();
          try {
            const result = await renderLatex(latex, "svg");
            const svg = result.data.toString("utf-8");
            processed = processed.slice(0, m.index) + '<span class="math-inline">' + svg + "</span>" + processed.slice(m.index + m[0].length);
            mathCount++;
          } catch {
            // Leave as text on error
          }
        }

        // Convert markdown to HTML
        html += convertLineToHtml(processed) + "\n";
      }

      const fullHtml = buildHtmlPage(title || "Document", author, html, false);
      fs.writeFileSync(absOutput, fullHtml, "utf-8");
      return { content: [{ type: "text", text: "Rendered " + mathCount + " equations via UpMath API. Saved to: " + absOutput + " (" + fullHtml.length + " bytes)" }] };

    } else {
      // KaTeX mode: embed KaTeX CDN, render client-side (fast)
      let html = "";
      let inDisplayMath = false;
      let mathBuf = [];

      for (const line of lines) {
        const stripped = line.trim();

        if (stripped === "$$" && !inDisplayMath) {
          inDisplayMath = true;
          mathBuf = [];
          continue;
        }
        if ((stripped === "$$" || /^\$\$\([^)]+\)$/.test(stripped)) && inDisplayMath) {
          inDisplayMath = false;
          const latex = mathBuf.join("\n").trim()
            .replace(/^\|/, "").replace(/\|$/, ""); // Strip UpMath pipe delimiters
          if (latex) {
            html += '<div class="math-display">$$' + latex + "$$</div>\n";
          }
          continue;
        }
        if (inDisplayMath) {
          mathBuf.push(line);
          continue;
        }

        // Convert inline $$...$$ to \(...\) for KaTeX
        let processed = line.replace(/\$\$(.+?)\$\$/g, function(match, p1) {
          return "\\(" + p1.trim() + "\\)";
        });

        html += convertLineToHtml(processed) + "\n";
      }

      const fullHtml = buildHtmlPage(title || "Document", author, html, true);
      fs.writeFileSync(absOutput, fullHtml, "utf-8");
      return { content: [{ type: "text", text: "Rendered with KaTeX (client-side). Saved to: " + absOutput + " (" + fullHtml.length + " bytes)" }] };
    }
  }
);

function convertLineToHtml(line) {
  const stripped = line.trim();
  if (!stripped) return "";

  // Headings
  if (stripped.startsWith("######")) return "<h6>" + processInline(stripped.slice(6).trim()) + "</h6>";
  if (stripped.startsWith("#####")) return "<h5>" + processInline(stripped.slice(5).trim()) + "</h5>";
  if (stripped.startsWith("####")) return "<h4>" + processInline(stripped.slice(4).trim()) + "</h4>";
  if (stripped.startsWith("###")) return "<h3>" + processInline(stripped.slice(3).trim()) + "</h3>";
  if (stripped.startsWith("##")) return "<h2>" + processInline(stripped.slice(2).trim()) + "</h2>";
  if (stripped.startsWith("#")) return "<h1>" + processInline(stripped.slice(1).trim()) + "</h1>";

  // Horizontal rule
  if (/^---+$/.test(stripped)) return "<hr>";

  // List items
  if (/^[-*+]\s/.test(stripped)) return "<li>" + processInline(stripped.slice(2).trim()) + "</li>";
  if (/^\d+\.\s/.test(stripped)) return "<li>" + processInline(stripped.replace(/^\d+\.\s/, "").trim()) + "</li>";

  // Table rows
  if (stripped.startsWith("|") && stripped.endsWith("|")) {
    if (/^\|[-:|]+\|$/.test(stripped)) return ""; // Separator row
    const cells = stripped.split("|").filter(Boolean).map(c => "<td>" + processInline(c.trim()) + "</td>");
    return "<tr>" + cells.join("") + "</tr>";
  }

  // Regular paragraph
  return "<p>" + processInline(stripped) + "</p>";
}

function processInline(text) {
  return text
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function buildHtmlPage(title, author, body, useKatex) {
  const katexHead = useKatex ? `
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"
  onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'\\\\(',right:'\\\\)',display:false}],throwOnError:false});"></script>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>${katexHead}
<style>
  body { font-family: "Times New Roman", Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.8; color: #222; }
  h1 { font-size: 1.8em; text-align: center; margin: 40px 0 10px; }
  h2 { font-size: 1.4em; margin: 32px 0 12px; border-bottom: 1px solid #ccc; padding-bottom: 6px; }
  h3 { font-size: 1.2em; margin: 24px 0 8px; }
  h4, h5, h6 { font-size: 1em; margin: 16px 0 6px; }
  p { margin: 8px 0; text-align: justify; }
  li { margin: 4px 0; }
  code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
  table { border-collapse: collapse; margin: 16px 0; width: 100%; }
  td, th { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
  tr:nth-child(even) { background: #f9f9f9; }
  hr { border: none; border-top: 1px solid #ccc; margin: 24px 0; }
  a { color: #2a5db0; text-decoration: none; }
  .math-display { text-align: center; margin: 16px 0; overflow-x: auto; }
  .math-display svg { max-width: 100%; }
  .math-inline { display: inline; }
  .math-inline svg { vertical-align: middle; }
  .math-error { color: red; font-style: italic; }
  .author { text-align: center; color: #666; margin-bottom: 30px; }
  @media print { body { max-width: none; margin: 0; } }
</style>
</head>
<body>
${author ? '<div class="author">' + author + "</div>" : ""}
${body}
</body>
</html>`;
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
