#!/usr/bin/env node
/**
 * Test script for upmath-mcp v2 tools
 */
import { spawn } from "child_process";
import { createInterface } from "readline";

const server = spawn("node", ["server.js"], {
  cwd: import.meta.dirname,
  stdio: ["pipe", "pipe", "pipe"],
});

const rl = createInterface({ input: server.stdout });
let reqId = 0;
const pending = new Map();

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  } catch {}
});

function call(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++reqId;
    pending.set(id, resolve);
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

async function run() {
  // Initialize
  const init = await call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } });
  console.log("Initialized:", init.result?.serverInfo?.name, init.result?.serverInfo?.version);

  // List tools
  const tools = await call("tools/list");
  console.log("\nTools:", tools.result?.tools?.length);

  // Test 1: scan_document_math
  console.log("\n--- Test: scan_document_math ---");
  const scan = await call("tools/call", {
    name: "scan_document_math",
    arguments: {
      inputFile: "C:/Users/danie/Dropbox/Misc/Philosophy/Beyond the Bat/Beyond the Bat (Complete).md",
    },
  });
  console.log(scan.result?.content?.[0]?.text?.slice(0, 500));

  // Test 2: build_notation_table
  console.log("\n--- Test: build_notation_table ---");
  const notation = await call("tools/call", {
    name: "build_notation_table",
    arguments: {
      inputFile: "C:/Users/danie/Dropbox/Misc/Philosophy/Beyond the Bat/Appendix E — Unified Mathematical Framework.md",
      format: "markdown",
    },
  });
  console.log(notation.result?.content?.[0]?.text?.slice(0, 500));

  // Test 3: render_diff
  console.log("\n--- Test: render_diff ---");
  const diff = await call("tools/call", {
    name: "render_diff",
    arguments: {
      before: "F = \\sum_l F_l",
      after: "\\mathcal{J} = \\sum_{l=1}^{3} F_l + \\lambda \\mathcal{T}",
      label: "Free Energy vs Unified Functional",
      saveTo: "C:/Users/danie/Dropbox/Misc/Philosophy/Beyond the Bat/_test_diff.html",
    },
  });
  console.log(diff.result?.content?.[0]?.text);

  // Test 4: render_parameter_grid
  console.log("\n--- Test: render_parameter_grid ---");
  const grid = await call("tools/call", {
    name: "render_parameter_grid",
    arguments: {
      latexTemplate: "\\frac{1}{1 + {TAU} s}",
      paramName: "TAU",
      values: ["0.1", "0.5", "1", "5"],
      saveTo: "C:/Users/danie/Dropbox/Misc/Philosophy/Beyond the Bat/_test_grid.html",
    },
  });
  console.log(grid.result?.content?.[0]?.text);

  // Test 5: render_equation_sheet
  console.log("\n--- Test: render_equation_sheet ---");
  const sheet = await call("tools/call", {
    name: "render_equation_sheet",
    arguments: {
      title: "RSP Core Equations",
      equations: [
        { name: "Free Energy", latex: "F_l = D_{KL}[q(\\mu_l) \\| p(\\mu_l | \\mu_{l+1})] - \\ln p(y_l | \\mu_l)", description: "Level-specific free energy" },
        { name: "Prediction Error", latex: "\\varepsilon_l = y_l - g_l(\\mu_l)", description: "Sensory prediction error at level l" },
        { name: "Master Functional", latex: "\\mathcal{J}[\\mu, \\pi, a] = \\sum_{l=1}^{3} F_l(\\mu_l, \\pi_l) + \\lambda \\mathcal{T}(\\mu, \\pi)", description: "Unified variational functional" },
      ],
      saveTo: "C:/Users/danie/Dropbox/Misc/Philosophy/Beyond the Bat/_test_sheet.html",
    },
  });
  console.log(sheet.result?.content?.[0]?.text);

  // Test 6: list_diagram_templates
  console.log("\n--- Test: list_diagram_templates ---");
  const templates = await call("tools/call", { name: "list_diagram_templates", arguments: {} });
  console.log(templates.result?.content?.[0]?.text);

  console.log("\n✓ All tests complete");
  server.kill();
}

run().catch((err) => {
  console.error("Test error:", err);
  server.kill();
  process.exit(1);
});
