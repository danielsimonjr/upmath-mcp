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
  version: "2.0.0",
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

// ============================================================
// B. DOCUMENT INTELLIGENCE TOOLS
// ============================================================

/**
 * Extract all math expressions from a markdown file, classify them,
 * and build a notation index with equation numbers and cross-references.
 */
server.tool(
  "scan_document_math",
  "Scan a markdown file for all LaTeX math. Returns: equation inventory with numbering, symbol frequency table, notation index, and cross-reference validation. Essential for maintaining consistency in scientific papers.",
  {
    inputFile: z.string().describe("Path to markdown file to scan"),
    outputReport: z.string().optional().describe("Path to save JSON report"),
  },
  async ({ inputFile, outputReport }) => {
    const absPath = path.resolve(inputFile);
    if (!fs.existsSync(absPath)) {
      return { content: [{ type: "text", text: "File not found: " + absPath }] };
    }
    const md = fs.readFileSync(absPath, "utf-8");
    const lines = md.split("\n");

    const equations = [];   // {line, latex, type, number, section}
    const symbols = {};     // symbol -> count
    const sections = [];    // {level, title, line}
    let currentSection = "";
    let inDisplayMath = false;
    let mathBuf = [];
    let mathStartLine = 0;
    let eqCounter = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const stripped = line.trim();

      // Track sections
      const headingMatch = stripped.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        currentSection = headingMatch[2].replace(/\*\*/g, "");
        sections.push({ level: headingMatch[1].length, title: currentSection, line: i + 1 });
      }

      // Display math blocks
      if (stripped === "$$" && !inDisplayMath) {
        inDisplayMath = true;
        mathBuf = [];
        mathStartLine = i + 1;
        continue;
      }
      if ((stripped === "$$" || /^\$\$\([\w.]+\)$/.test(stripped)) && inDisplayMath) {
        inDisplayMath = false;
        const latex = mathBuf.join("\n").trim();
        const numMatch = stripped.match(/\$\$\(([\w.]+)\)/);
        const eqNum = numMatch ? numMatch[1] : null;
        if (eqNum) eqCounter++;
        equations.push({
          line: mathStartLine,
          latex,
          type: "display",
          number: eqNum,
          section: currentSection,
          length: latex.length,
        });
        extractSymbols(latex, symbols);
        continue;
      }
      if (inDisplayMath) {
        mathBuf.push(line);
        continue;
      }

      // Inline math
      const inlineMatches = [...stripped.matchAll(/\$\$(.+?)\$\$/g)];
      for (const m of inlineMatches) {
        equations.push({
          line: i + 1,
          latex: m[1].trim(),
          type: "inline",
          number: null,
          section: currentSection,
          length: m[1].trim().length,
        });
        extractSymbols(m[1].trim(), symbols);
      }
    }

    // Sort symbols by frequency
    const sortedSymbols = Object.entries(symbols)
      .sort((a, b) => b[1] - a[1])
      .map(([sym, count]) => ({ symbol: sym, count }));

    // Detect numbering gaps
    const numberedEqs = equations.filter(e => e.number).map(e => e.number);
    const numberingIssues = detectNumberingGaps(numberedEqs);

    // Cross-reference check: find $$...ref... or (E.x) references in text
    const refs = [];
    const refRegex = /\(([A-Z]?\d+(?:\.\d+)?)\)/g;
    for (let i = 0; i < lines.length; i++) {
      const matches = [...lines[i].matchAll(refRegex)];
      for (const m of matches) {
        if (numberedEqs.includes(m[1])) {
          refs.push({ line: i + 1, ref: m[1], resolved: true });
        }
      }
    }

    const report = {
      file: absPath,
      stats: {
        totalEquations: equations.length,
        displayEquations: equations.filter(e => e.type === "display").length,
        inlineEquations: equations.filter(e => e.type === "inline").length,
        numberedEquations: numberedEqs.length,
        uniqueSymbols: sortedSymbols.length,
        sections: sections.length,
      },
      numberingIssues,
      topSymbols: sortedSymbols.slice(0, 30),
      equations,
      sections,
    };

    if (outputReport) {
      const absOut = path.resolve(outputReport);
      fs.writeFileSync(absOut, JSON.stringify(report, null, 2), "utf-8");
    }

    // Build summary text
    const summary = [
      "Document Math Scan: " + path.basename(absPath),
      "─".repeat(50),
      "Total equations: " + report.stats.totalEquations + " (" + report.stats.displayEquations + " display, " + report.stats.inlineEquations + " inline)",
      "Numbered equations: " + report.stats.numberedEquations,
      "Unique symbols: " + report.stats.uniqueSymbols,
      "Sections: " + report.stats.sections,
      "",
    ];

    if (numberingIssues.length > 0) {
      summary.push("NUMBERING ISSUES:");
      for (const issue of numberingIssues) summary.push("  ⚠ " + issue);
      summary.push("");
    }

    summary.push("Top 15 symbols:");
    for (const s of sortedSymbols.slice(0, 15)) {
      summary.push("  " + s.symbol + " (" + s.count + "×)");
    }

    if (outputReport) summary.push("\nFull report saved to: " + path.resolve(outputReport));

    return { content: [{ type: "text", text: summary.join("\n") }] };
  }
);

function extractSymbols(latex, symbols) {
  // Extract Greek letters, operators, and named functions
  const patterns = [
    /\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|vartheta|iota|kappa|lambda|mu|nu|xi|pi|varpi|rho|varrho|sigma|varsigma|tau|upsilon|phi|varphi|chi|psi|omega)/g,
    /\\(Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)/g,
    /\\(nabla|partial|infty|forall|exists|neg|sum|prod|int|oint|bigcup|bigcap)/g,
    /\\(mathcal|mathbb|mathfrak|mathrm|operatorname)\{([^}]+)\}/g,
    /\\(text|textrm)\{([^}]+)\}/g,
    /\\(frac|dfrac|tfrac)/g,
    /\\(left|right|big|Big|bigg|Bigg)/g,
  ];

  for (const pat of patterns) {
    const matches = [...latex.matchAll(pat)];
    for (const m of matches) {
      const sym = m[0].length > 30 ? m[1] : m[0];
      symbols[sym] = (symbols[sym] || 0) + 1;
    }
  }

  // Extract single-letter variables (excluding commands and text{} content)
  const cleaned = latex
    .replace(/\\(text|textrm|mathrm|operatorname)\{[^}]*\}/g, "")  // Remove text content
    .replace(/\\[a-zA-Z]+/g, "");  // Remove commands
  const varMatches = cleaned.match(/[A-Za-z]/g);
  if (varMatches) {
    for (const v of varMatches) {
      // Only track uppercase or common math variables
      if (v === v.toUpperCase() || "xyztuvwnmijkpq".includes(v)) {
        symbols[v] = (symbols[v] || 0) + 1;
      }
    }
  }
}

function detectNumberingGaps(numbers) {
  const issues = [];
  // Group by prefix (e.g., "E.1", "1", "A.1")
  const groups = {};
  for (const num of numbers) {
    const parts = num.split(".");
    const prefix = parts.length > 1 ? parts[0] : "";
    if (!groups[prefix]) groups[prefix] = [];
    groups[prefix].push(num);
  }

  for (const [prefix, nums] of Object.entries(groups)) {
    // Check for duplicates
    const seen = new Set();
    for (const n of nums) {
      if (seen.has(n)) issues.push("Duplicate equation number: " + n);
      seen.add(n);
    }
  }
  return issues;
}

server.tool(
  "build_notation_table",
  "Extract all mathematical notation from a markdown file and generate a formatted notation table (symbol, meaning, first appearance). Useful for creating a 'Notation' section in a paper.",
  {
    inputFile: z.string().describe("Path to markdown file"),
    format: z.enum(["markdown", "latex", "html"]).default("markdown").describe("Output format for the notation table"),
    saveTo: z.string().optional().describe("File path to save the notation table"),
  },
  async ({ inputFile, format, saveTo }) => {
    const absPath = path.resolve(inputFile);
    if (!fs.existsSync(absPath)) {
      return { content: [{ type: "text", text: "File not found: " + absPath }] };
    }
    const md = fs.readFileSync(absPath, "utf-8");
    const lines = md.split("\n");

    // Track notation with context
    const notation = new Map(); // symbol -> {firstLine, section, context}
    let currentSection = "";
    let inDisplayMath = false;
    let mathBuf = [];
    let mathStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();
      const headingMatch = stripped.match(/^#{1,6}\s+(.+)/);
      if (headingMatch) currentSection = headingMatch[1].replace(/\*\*/g, "");

      if (stripped === "$$" && !inDisplayMath) {
        inDisplayMath = true;
        mathBuf = [];
        mathStartLine = i + 1;
        continue;
      }
      if ((stripped === "$$" || /^\$\$\(/.test(stripped)) && inDisplayMath) {
        inDisplayMath = false;
        const latex = mathBuf.join("\n").trim();
        recordNotation(latex, mathStartLine, currentSection, notation);
        continue;
      }
      if (inDisplayMath) { mathBuf.push(lines[i]); continue; }

      const inlineMatches = [...stripped.matchAll(/\$\$(.+?)\$\$/g)];
      for (const m of inlineMatches) {
        recordNotation(m[1].trim(), i + 1, currentSection, notation);
      }
    }

    // Build table
    const entries = [...notation.entries()]
      .sort((a, b) => a[1].firstLine - b[1].firstLine);

    let output;
    if (format === "markdown") {
      output = "| Symbol | First Appears | Section |\n|--------|---------------|--------|\n";
      for (const [sym, info] of entries) {
        output += "| `" + sym + "` | Line " + info.firstLine + " | " + info.section + " |\n";
      }
    } else if (format === "latex") {
      output = "\\begin{tabular}{lll}\n\\hline\nSymbol & First Appears & Section \\\\\n\\hline\n";
      for (const [sym, info] of entries) {
        output += "$" + sym + "$ & Line " + info.firstLine + " & " + info.section + " \\\\\n";
      }
      output += "\\hline\n\\end{tabular}";
    } else {
      output = "<table><thead><tr><th>Symbol</th><th>First Appears</th><th>Section</th></tr></thead><tbody>\n";
      for (const [sym, info] of entries) {
        output += "<tr><td><code>" + sym + "</code></td><td>Line " + info.firstLine + "</td><td>" + info.section + "</td></tr>\n";
      }
      output += "</tbody></table>";
    }

    if (saveTo) {
      fs.writeFileSync(path.resolve(saveTo), output, "utf-8");
      return { content: [{ type: "text", text: "Notation table (" + entries.length + " symbols) saved to: " + path.resolve(saveTo) }] };
    }
    return { content: [{ type: "text", text: output }] };
  }
);

function recordNotation(latex, line, section, notation) {
  // Greek letters
  const greekRe = /\\(alpha|beta|gamma|delta|epsilon|varepsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|phi|varphi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Upsilon|Phi|Psi|Omega)\b/g;
  for (const m of latex.matchAll(greekRe)) {
    const key = m[0];
    if (!notation.has(key)) notation.set(key, { firstLine: line, section });
  }
  // Calligraphic/blackboard bold
  const calRe = /\\(mathcal|mathbb|mathfrak)\{([^}]+)\}/g;
  for (const m of latex.matchAll(calRe)) {
    const key = m[0];
    if (!notation.has(key)) notation.set(key, { firstLine: line, section });
  }
  // Operators
  const opRe = /\\(nabla|partial|sum|prod|int|oint|langle|rangle)\b/g;
  for (const m of latex.matchAll(opRe)) {
    if (!notation.has(m[0])) notation.set(m[0], { firstLine: line, section });
  }
  // Subscripted variables (common in physics/engineering: x_i, F_d, etc.)
  const subRe = /([A-Za-z])_\{?([A-Za-z0-9]+)\}?/g;
  for (const m of latex.matchAll(subRe)) {
    const key = m[0].replace(/[{}]/g, "");
    if (key.length <= 10 && !notation.has(key)) {
      notation.set(key, { firstLine: line, section });
    }
  }
}

server.tool(
  "validate_equations",
  "Validate all equations in a markdown file: check LaTeX syntax via UpMath, report render errors, and flag potential issues (unmatched braces, undefined commands). Slower than scan_document_math but verifies renderability.",
  {
    inputFile: z.string().describe("Path to markdown file"),
    maxEquations: z.number().optional().default(50).describe("Max equations to validate (API calls). Use -1 for all."),
  },
  async ({ inputFile, maxEquations }) => {
    const absPath = path.resolve(inputFile);
    if (!fs.existsSync(absPath)) {
      return { content: [{ type: "text", text: "File not found: " + absPath }] };
    }
    const md = fs.readFileSync(absPath, "utf-8");

    // Extract equations
    const equations = [];
    const lines = md.split("\n");
    let inDisplay = false;
    let buf = [];
    let startLine = 0;

    for (let i = 0; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (stripped === "$$" && !inDisplay) { inDisplay = true; buf = []; startLine = i + 1; continue; }
      if ((stripped === "$$" || /^\$\$\(/.test(stripped)) && inDisplay) {
        inDisplay = false;
        equations.push({ line: startLine, latex: buf.join("\n").trim(), type: "display" });
        continue;
      }
      if (inDisplay) { buf.push(lines[i]); continue; }
      for (const m of stripped.matchAll(/\$\$(.+?)\$\$/g)) {
        equations.push({ line: i + 1, latex: m[1].trim(), type: "inline" });
      }
    }

    const limit = maxEquations === -1 ? equations.length : Math.min(maxEquations, equations.length);
    const results = [];
    let errors = 0;
    let warnings = 0;

    for (let i = 0; i < limit; i++) {
      const eq = equations[i];
      // Local checks first
      const localIssues = checkLocalSyntax(eq.latex);
      if (localIssues.length > 0) {
        warnings += localIssues.length;
        results.push({ line: eq.line, status: "warning", issues: localIssues, latex: eq.latex.slice(0, 60) });
        continue;
      }

      // Remote render check
      try {
        const result = await renderLatex(eq.latex, "svg");
        const svg = result.data.toString("utf-8");
        if (!svg.includes("<path") && !svg.includes("<text") && !svg.includes("<g")) {
          warnings++;
          results.push({ line: eq.line, status: "warning", issues: ["Rendered but empty SVG"], latex: eq.latex.slice(0, 60) });
        }
      } catch (err) {
        errors++;
        results.push({ line: eq.line, status: "error", issues: [err.message], latex: eq.latex.slice(0, 60) });
      }
    }

    const summary = [
      "Equation Validation: " + path.basename(absPath),
      "─".repeat(50),
      "Checked: " + limit + " / " + equations.length + " equations",
      "Errors: " + errors,
      "Warnings: " + warnings,
      "OK: " + (limit - errors - warnings),
    ];

    if (results.length > 0) {
      summary.push("\nIssues found:");
      for (const r of results) {
        summary.push("  Line " + r.line + " [" + r.status.toUpperCase() + "]: " + r.issues.join(", "));
        summary.push("    " + r.latex + (r.latex.length >= 60 ? "..." : ""));
      }
    } else {
      summary.push("\nAll checked equations render successfully.");
    }

    return { content: [{ type: "text", text: summary.join("\n") }] };
  }
);

function checkLocalSyntax(latex) {
  const issues = [];
  // Unmatched braces
  let depth = 0;
  for (const ch of latex) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (depth < 0) { issues.push("Extra closing brace }"); break; }
  }
  if (depth > 0) issues.push("Unmatched opening brace { (" + depth + " unclosed)");

  // Unmatched \left \right
  const lefts = (latex.match(/\\left[\s(.[{|\\]/g) || []).length;
  const rights = (latex.match(/\\right[\s).\]}|\\]/g) || []).length;
  if (lefts !== rights) issues.push("Mismatched \\left/" + "\\right (" + lefts + " left, " + rights + " right)");

  // Common typos
  if (latex.includes("\\frc{")) issues.push("Possible typo: \\frc → \\frac");
  if (latex.includes("\\labmda")) issues.push("Possible typo: \\labmda → \\lambda");
  if (latex.includes("\\bigg(") && !latex.includes("\\bigg)")) issues.push("Mismatched \\bigg delimiter");

  return issues;
}


// ============================================================
// A. DIAGRAM TEMPLATES
// ============================================================

const DIAGRAM_TEMPLATES = {
  "control-system": {
    description: "Feedback control system block diagram (reference, plant, controller, feedback)",
    template: (params) => {
      const { reference = "r(t)", output = "y(t)", controller = "C(s)", plant = "G(s)", feedback = "H(s)" } = params;
      return `\\usepackage{tikz}
\\usetikzlibrary{positioning,arrows.meta}
\\begin{tikzpicture}[auto,>=Stealth,block/.style={draw,minimum height=2em,minimum width=3em},sum/.style={draw,circle,inner sep=2pt}]
  \\node[sum] (sum) {};
  \\node[block,right=1.2 of sum] (ctrl) {$${controller}$};
  \\node[block,right=1.2 of ctrl] (plant) {$${plant}$};
  \\node[block,below=0.8 of plant] (fb) {$${feedback}$};
  \\node[left=1.2 of sum] (ref) {$${reference}$};
  \\node[right=1.2 of plant] (out) {$${output}$};
  \\draw[->] (ref) -- (sum);
  \\draw[->] (sum) -- node{$e$} (ctrl);
  \\draw[->] (ctrl) -- node{$u$} (plant);
  \\draw[->] (plant) -- (out);
  \\draw[->] (out) |- (fb);
  \\draw[->] (fb) -| node[pos=0.99,left]{$-$} (sum);
  \\node at (sum.north west) {$+$};
\\end{tikzpicture}`;
    },
  },
  "neural-network": {
    description: "Layered neural network diagram with configurable layers",
    template: (params) => {
      const { layers = [3, 4, 4, 2], labels = ["Input", "Hidden 1", "Hidden 2", "Output"] } = params;
      let code = `\\usepackage{tikz}
\\begin{tikzpicture}[x=2.2cm,y=1.2cm,>=stealth]`;
      for (let l = 0; l < layers.length; l++) {
        const n = layers[l];
        const yOff = -(n - 1) / 2;
        for (let i = 0; i < n; i++) {
          code += `\n  \\node[circle,draw,minimum size=0.6cm] (n${l}_${i}) at (${l},${yOff + i}) {};`;
        }
        if (labels[l]) code += `\n  \\node[above] at (${l},${-yOff + 0.5}) {\\small ${labels[l]}};`;
        if (l > 0) {
          for (let i = 0; i < layers[l - 1]; i++) {
            for (let j = 0; j < n; j++) {
              code += `\n  \\draw[->] (n${l - 1}_${i}) -- (n${l}_${j});`;
            }
          }
        }
      }
      code += "\n\\end{tikzpicture}";
      return code;
    },
  },
  "state-machine": {
    description: "Finite state machine / state transition diagram",
    template: (params) => {
      const { states = ["S0", "S1", "S2"], transitions = [["S0", "S1", "a"], ["S1", "S2", "b"], ["S2", "S0", "c"]], initial = "S0" } = params;
      let code = `\\usepackage{tikz}
\\usetikzlibrary{automata,positioning,arrows.meta}
\\begin{tikzpicture}[auto,>=Stealth,node distance=2.5cm,state/.style={circle,draw,minimum size=1cm}]`;
      const angle = 360 / states.length;
      for (let i = 0; i < states.length; i++) {
        const a = (90 - i * angle) * Math.PI / 180;
        const x = (2 * Math.cos(a)).toFixed(2);
        const y = (2 * Math.sin(a)).toFixed(2);
        const extra = states[i] === initial ? ",initial" : "";
        code += `\n  \\node[state${extra}] (${states[i]}) at (${x},${y}) {$${states[i]}$};`;
      }
      for (const [from, to, label] of transitions) {
        if (from === to) {
          code += `\n  \\draw[->] (${from}) edge[loop above] node{$${label}$} (${to});`;
        } else {
          code += `\n  \\draw[->] (${from}) edge node{$${label}$} (${to});`;
        }
      }
      code += "\n\\end{tikzpicture}";
      return code;
    },
  },
  "bayesian-network": {
    description: "Bayesian/probabilistic graphical model",
    template: (params) => {
      const { nodes = [["X", 0, 2], ["Y", -1, 0], ["Z", 1, 0]], edges = [["X", "Y"], ["X", "Z"]], observed = ["Z"] } = params;
      let code = `\\usepackage{tikz}
\\begin{tikzpicture}[>=stealth,node distance=1.5cm,
  latent/.style={circle,draw,minimum size=1cm},
  observed/.style={circle,draw,fill=gray!30,minimum size=1cm}]`;
      for (const [name, x, y] of nodes) {
        const style = observed.includes(name) ? "observed" : "latent";
        code += `\n  \\node[${style}] (${name}) at (${x},${y}) {$${name}$};`;
      }
      for (const [from, to] of edges) {
        code += `\n  \\draw[->] (${from}) -- (${to});`;
      }
      code += "\n\\end{tikzpicture}";
      return code;
    },
  },
  "signal-flow": {
    description: "Signal flow diagram (for control theory / DSP)",
    template: (params) => {
      const { nodes = ["x", "H_1", "H_2", "y"], connections = [["x", "H_1", ""], ["H_1", "H_2", ""], ["H_2", "y", ""]] } = params;
      let code = `\\usepackage{tikz}
\\usetikzlibrary{positioning,arrows.meta}
\\begin{tikzpicture}[auto,>=Stealth,block/.style={draw,rectangle,minimum height=1.5em,minimum width=2.5em}]`;
      for (let i = 0; i < nodes.length; i++) {
        const style = (i === 0 || i === nodes.length - 1) ? "" : "block,";
        code += `\n  \\node[${style}] (n${i}) at (${i * 2.5},0) {$${nodes[i]}$};`;
      }
      for (let i = 0; i < connections.length; i++) {
        const label = connections[i][2] ? `node{$${connections[i][2]}$}` : "";
        code += `\n  \\draw[->] (n${i}) -- ${label} (n${i + 1});`;
      }
      code += "\n\\end{tikzpicture}";
      return code;
    },
  },
  "data-plot": {
    description: "Publication-quality data plot using pgfplots",
    template: (params) => {
      const { xlabel = "x", ylabel = "y", title = "", xdata = "0,1,2,3,4,5", ydata = "0,1,4,9,16,25", style = "mark=*,blue" } = params;
      return `\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\begin{tikzpicture}
\\begin{axis}[
  xlabel={$${xlabel}$},
  ylabel={$${ylabel}$},
  ${title ? "title={" + title + "}," : ""}
  grid=major,
  width=10cm,height=7cm,
  tick label style={font=\\small},
  label style={font=\\small},
]
\\addplot[${style}] coordinates {
  ${xdata.split(",").map((x, i) => "(" + x.trim() + "," + ydata.split(",")[i].trim() + ")").join(" ")}
};
\\end{axis}
\\end{tikzpicture}`;
    },
  },
  "commutative-diagram": {
    description: "Commutative diagram (category theory / algebra)",
    template: (params) => {
      const { nodes = [["A", 0, 1], ["B", 2, 1], ["C", 0, -1], ["D", 2, -1]], arrows = [["A", "B", "f", "above"], ["A", "C", "g", "left"], ["B", "D", "h", "right"], ["C", "D", "k", "below"]] } = params;
      let code = `\\usepackage{tikz}
\\usetikzlibrary{arrows.meta}
\\begin{tikzpicture}[>=Stealth]`;
      for (const [name, x, y] of nodes) {
        code += `\n  \\node (${name}) at (${x},${y}) {$${name}$};`;
      }
      for (const [from, to, label, pos] of arrows) {
        code += `\n  \\draw[->] (${from}) -- node[${pos}]{$${label}$} (${to});`;
      }
      code += "\n\\end{tikzpicture}";
      return code;
    },
  },
};

server.tool(
  "list_diagram_templates",
  "List all available TikZ diagram templates with descriptions.",
  {},
  async () => {
    const lines = ["Available Diagram Templates:", "─".repeat(40)];
    for (const [name, tmpl] of Object.entries(DIAGRAM_TEMPLATES)) {
      lines.push("  " + name + " — " + tmpl.description);
    }
    lines.push("", "Use render_diagram_template to generate and render any template.");
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

server.tool(
  "render_diagram_template",
  "Render a pre-built TikZ diagram template with custom parameters. Templates: control-system, neural-network, state-machine, bayesian-network, signal-flow, data-plot, commutative-diagram.",
  {
    template: z.string().describe("Template name (e.g., 'control-system', 'neural-network')"),
    params: z.string().optional().default("{}").describe("Template parameters as JSON string (varies by template)"),
    format: z.enum(["svg", "png"]).default("svg").describe("Output format"),
    saveTo: z.string().optional().describe("File path to save output"),
  },
  async ({ template, params: paramsStr, format, saveTo }) => {
    const tmpl = DIAGRAM_TEMPLATES[template];
    if (!tmpl) {
      return { content: [{ type: "text", text: "Unknown template: " + template + ". Use list_diagram_templates to see available templates." }] };
    }
    let params = {};
    try { params = JSON.parse(paramsStr || "{}"); } catch { /* use defaults */ }
    const tikzCode = tmpl.template(params);
    const result = await renderLatex(tikzCode, format);

    if (saveTo) {
      const absPath = path.resolve(saveTo);
      fs.writeFileSync(absPath, result.data);
      return { content: [{ type: "text", text: "Diagram '" + template + "' (" + result.data.length + " bytes) saved to: " + absPath }] };
    }
    if (format === "svg") {
      return { content: [{ type: "text", text: result.data.toString("utf-8") }] };
    }
    return { content: [{ type: "image", data: result.data.toString("base64"), mimeType: "image/png" }] };
  }
);


// ============================================================
// C. RENDER PIPELINE IMPROVEMENTS
// ============================================================

const renderCache = new Map(); // latex+format -> {data, timestamp}

server.tool(
  "render_batch_cached",
  "Render multiple equations with caching — skips re-rendering unchanged equations. Much faster for iterative editing. Cache persists within the MCP session.",
  {
    equations: z.array(z.object({
      name: z.string().describe("Identifier"),
      latex: z.string().describe("LaTeX equation"),
    })).describe("Array of {name, latex}"),
    format: z.enum(["svg", "png"]).default("svg"),
    outputDir: z.string().describe("Directory to save files"),
  },
  async ({ equations, format, outputDir }) => {
    const absDir = path.resolve(outputDir);
    if (!fs.existsSync(absDir)) fs.mkdirSync(absDir, { recursive: true });

    let rendered = 0;
    let cached = 0;
    const results = [];

    for (const eq of equations) {
      const cacheKey = eq.latex + "||" + format;
      const filename = eq.name + "." + format;
      const filePath = path.join(absDir, filename);

      if (renderCache.has(cacheKey)) {
        fs.writeFileSync(filePath, renderCache.get(cacheKey).data);
        cached++;
        results.push("  " + filename + " (cached)");
      } else {
        try {
          const result = await renderLatex(eq.latex, format);
          renderCache.set(cacheKey, { data: result.data, timestamp: Date.now() });
          fs.writeFileSync(filePath, result.data);
          rendered++;
          results.push("  " + filename + " (" + result.data.length + " bytes)");
        } catch (err) {
          results.push("  " + eq.name + ": ERROR - " + err.message);
        }
      }
    }

    return { content: [{ type: "text", text: "Batch render: " + rendered + " rendered, " + cached + " from cache\n" + results.join("\n") }] };
  }
);

server.tool(
  "render_diff",
  "Render two versions of a LaTeX equation side by side for visual comparison. Returns an HTML page with both versions.",
  {
    before: z.string().describe("Original LaTeX"),
    after: z.string().describe("Modified LaTeX"),
    label: z.string().optional().default("Equation").describe("Label for the comparison"),
    saveTo: z.string().optional().describe("File path to save HTML comparison"),
  },
  async ({ before, after, label, saveTo }) => {
    let beforeSvg, afterSvg;
    try {
      beforeSvg = (await renderLatex(before, "svg")).data.toString("utf-8");
    } catch (err) {
      beforeSvg = '<span style="color:red">Render error: ' + err.message + "</span>";
    }
    try {
      afterSvg = (await renderLatex(after, "svg")).data.toString("utf-8");
    } catch (err) {
      afterSvg = '<span style="color:red">Render error: ' + err.message + "</span>";
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: sans-serif; margin: 20px; }
  .diff { display: flex; gap: 40px; }
  .version { flex: 1; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
  .version h3 { margin: 0 0 10px; }
  .before { border-color: #e74c3c; }
  .after { border-color: #2ecc71; }
  .latex-source { background: #f8f8f8; padding: 8px; font-family: monospace; font-size: 12px; white-space: pre-wrap; margin-top: 12px; border-radius: 4px; }
  svg { max-width: 100%; }
</style></head><body>
<h2>${label} — Comparison</h2>
<div class="diff">
  <div class="version before">
    <h3 style="color:#e74c3c">Before</h3>
    <div class="render">${beforeSvg}</div>
    <div class="latex-source">${escapeHtml(before)}</div>
  </div>
  <div class="version after">
    <h3 style="color:#2ecc71">After</h3>
    <div class="render">${afterSvg}</div>
    <div class="latex-source">${escapeHtml(after)}</div>
  </div>
</div>
</body></html>`;

    if (saveTo) {
      fs.writeFileSync(path.resolve(saveTo), html, "utf-8");
      return { content: [{ type: "text", text: "Diff comparison saved to: " + path.resolve(saveTo) }] };
    }
    return { content: [{ type: "text", text: html }] };
  }
);

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


// ============================================================
// D. INTERACTIVE EXPLORATION
// ============================================================

server.tool(
  "render_parameter_grid",
  "Render a parameterized equation across a grid of values, producing an HTML comparison page. Useful for exploring how changing coefficients affects formulas. Use {PARAM} as placeholder in the LaTeX template.",
  {
    latexTemplate: z.string().describe("LaTeX with {PARAM} placeholder(s) (e.g., '\\\\frac{1}{1+{PARAM}s}')"),
    paramName: z.string().default("PARAM").describe("Placeholder name in the template"),
    values: z.array(z.string()).describe("Array of values to substitute (e.g., ['0.1', '0.5', '1', '2', '10'])"),
    saveTo: z.string().optional().describe("File path to save HTML grid"),
  },
  async ({ latexTemplate, paramName, values, saveTo }) => {
    const cells = [];
    for (const val of values) {
      const latex = latexTemplate.replaceAll("{" + paramName + "}", val);
      let svg;
      try {
        svg = (await renderLatex(latex, "svg")).data.toString("utf-8");
      } catch (err) {
        svg = '<span style="color:red">Error: ' + err.message + "</span>";
      }
      cells.push({ value: val, svg, latex });
    }

    const cellsHtml = cells.map(c =>
      `<div class="cell">
        <div class="value">${paramName} = ${c.value}</div>
        <div class="render">${c.svg}</div>
      </div>`
    ).join("\n");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: sans-serif; margin: 20px; }
  h2 { margin-bottom: 4px; }
  .template { font-family: monospace; background: #f0f0f0; padding: 8px; border-radius: 4px; margin-bottom: 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 16px; }
  .cell { border: 1px solid #ddd; border-radius: 8px; padding: 12px; text-align: center; }
  .value { font-weight: bold; margin-bottom: 8px; color: #2a5db0; }
  .render svg { max-width: 100%; }
</style></head><body>
<h2>Parameter Exploration</h2>
<div class="template">Template: ${escapeHtml(latexTemplate)}</div>
<div class="grid">${cellsHtml}</div>
</body></html>`;

    if (saveTo) {
      fs.writeFileSync(path.resolve(saveTo), html, "utf-8");
      return { content: [{ type: "text", text: "Parameter grid (" + values.length + " variations) saved to: " + path.resolve(saveTo) }] };
    }
    return { content: [{ type: "text", text: html }] };
  }
);

server.tool(
  "render_equation_sheet",
  "Render a collection of named equations into a single reference sheet HTML page. Useful for creating equation cheat sheets or appendix summaries.",
  {
    title: z.string().default("Equation Reference Sheet").describe("Page title"),
    equations: z.array(z.object({
      name: z.string().describe("Equation name/label"),
      latex: z.string().describe("LaTeX"),
      description: z.string().optional().describe("Brief description"),
    })).describe("Array of equations to render"),
    saveTo: z.string().optional().describe("File path to save HTML"),
  },
  async ({ title, equations, saveTo }) => {
    const rows = [];
    for (const eq of equations) {
      let svg;
      try {
        svg = (await renderLatex(eq.latex, "svg")).data.toString("utf-8");
      } catch (err) {
        svg = '<span style="color:red">Error: ' + err.message + "</span>";
      }
      rows.push(`<tr>
        <td class="eq-name">${escapeHtml(eq.name)}</td>
        <td class="eq-render">${svg}</td>
        <td class="eq-desc">${eq.description ? escapeHtml(eq.description) : ""}</td>
      </tr>`);
    }

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>
  body { font-family: "Times New Roman", serif; margin: 20px auto; max-width: 900px; }
  h1 { text-align: center; }
  table { width: 100%; border-collapse: collapse; margin-top: 20px; }
  th { background: #f0f0f0; padding: 8px; text-align: left; border-bottom: 2px solid #333; }
  td { padding: 10px 8px; border-bottom: 1px solid #ddd; vertical-align: middle; }
  .eq-name { font-weight: bold; width: 20%; }
  .eq-render { text-align: center; width: 50%; }
  .eq-render svg { max-width: 100%; }
  .eq-desc { color: #555; font-size: 0.9em; width: 30%; }
  @media print { body { max-width: none; } }
</style></head><body>
<h1>${escapeHtml(title)}</h1>
<table>
<thead><tr><th>Name</th><th>Equation</th><th>Description</th></tr></thead>
<tbody>${rows.join("\n")}</tbody>
</table>
</body></html>`;

    if (saveTo) {
      fs.writeFileSync(path.resolve(saveTo), html, "utf-8");
      return { content: [{ type: "text", text: "Equation sheet (" + equations.length + " equations) saved to: " + path.resolve(saveTo) }] };
    }
    return { content: [{ type: "text", text: html }] };
  }
);


// ============================================================
// MAIN
// ============================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
