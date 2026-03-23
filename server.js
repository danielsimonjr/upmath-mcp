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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
