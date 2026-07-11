#!/usr/bin/env node
/**
 * Smoke test for upmath-mcp.
 *
 * Portable and network-free by default: exercises the MCP handshake,
 * tools/list, and every tool that works without calling the UpMath API
 * (document scanning, notation tables, templates, URL building), using
 * a temp-dir fixture. Set UPMATH_TEST_NETWORK=1 to also exercise a live
 * render_equation call against the API.
 *
 * Exits 0 on success, 1 on any failure — safe to run in CI via `npm test`.
 */
import { spawn } from "child_process";
import { createInterface } from "readline";
import fs from "fs";
import os from "os";
import path from "path";

const EXPECTED_TOOL_COUNT = 16;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmath-mcp-test-"));
const fixture = path.join(tmpDir, "fixture.md");
fs.writeFileSync(fixture, `# Test Paper

## Dynamics

The free energy $$F_l$$ evolves as:

$$
\\frac{d\\mu}{dt} = -\\nabla_\\mu F(\\mu, \\pi)
$$

With prediction error $$\\varepsilon_l = y_l - g_l(\\mu_l)$$ at each level.
`, "utf-8");

const server = spawn(process.execPath, ["server.js"], {
  cwd: import.meta.dirname,
  stdio: ["pipe", "pipe", "inherit"],
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

function call(method, params = {}, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const id = ++reqId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("Timed out waiting for " + method));
    }, timeoutMs);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

let failures = 0;

function check(name, condition, detail) {
  if (condition) {
    console.log("  ok: " + name);
  } else {
    failures++;
    console.error("  FAIL: " + name + (detail ? " — " + detail : ""));
  }
}

async function callTool(name, args) {
  const res = await call("tools/call", { name, arguments: args });
  return res.result?.content?.[0];
}

async function run() {
  const init = await call("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "smoke-test", version: "1.0" },
  });
  check("initialize", init.result?.serverInfo?.name === "upmath-mcp", JSON.stringify(init.error || init.result));

  const tools = await call("tools/list");
  const toolCount = tools.result?.tools?.length;
  check("tools/list returns " + EXPECTED_TOOL_COUNT + " tools", toolCount === EXPECTED_TOOL_COUNT, "got " + toolCount);

  const scan = await callTool("scan_document_math", { inputFile: fixture });
  check("scan_document_math finds equations", scan?.text?.includes("Total equations: 3"), scan?.text?.slice(0, 200));

  const notation = await callTool("build_notation_table", { inputFile: fixture, format: "markdown" });
  check("build_notation_table extracts symbols", notation?.text?.includes("\\mu") && notation?.text?.includes("| Symbol |"), notation?.text?.slice(0, 200));

  const templates = await callTool("list_diagram_templates", {});
  check("list_diagram_templates lists templates", templates?.text?.includes("control-system") && templates?.text?.includes("neural-network"), templates?.text?.slice(0, 200));

  const url = await callTool("get_render_url", { latex: "E = mc^2", format: "svg" });
  check("get_render_url builds URL", url?.text?.includes("/svg/E%20%3D%20mc%5E2"), url?.text);

  const missing = await callTool("scan_document_math", { inputFile: path.join(tmpDir, "does-not-exist.md") });
  check("missing file reports cleanly", missing?.text?.startsWith("File not found"), missing?.text);

  const badTemplate = await callTool("render_diagram_template", { template: "nope" });
  check("unknown template reports cleanly", badTemplate?.text?.startsWith("Unknown template"), badTemplate?.text);

  if (process.env.UPMATH_TEST_NETWORK === "1") {
    const render = await callTool("render_equation", { latex: "E = mc^2", format: "svg" });
    check("render_equation (network)", render?.text?.includes("<svg"), render?.text?.slice(0, 200));
  } else {
    console.log("  skip: live API test (set UPMATH_TEST_NETWORK=1 to enable)");
  }

  server.kill();
  fs.rmSync(tmpDir, { recursive: true, force: true });

  if (failures > 0) {
    console.error("\n" + failures + " check(s) failed");
    process.exit(1);
  }
  console.log("\nAll checks passed");
}

run().catch((err) => {
  console.error("Test error:", err);
  server.kill();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  process.exit(1);
});
