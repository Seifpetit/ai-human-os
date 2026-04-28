import http from "http";
import { fileURLToPath } from "url";
import path from "path";

import { runL0Agent } from "../runtime/agents/run_l0_agent.js";
import { runL1Agent } from "../runtime/agents/run_l1_agent.js";
import { runL19Agent } from "../runtime/agents/run_l19_agent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOST = "127.0.0.1";
const PORT = Number(process.env.AI_OS_CONSOLE_PORT || 4310);
const UI_PORT = Number(process.env.AI_OS_CONSOLE_UI_PORT || 5174);
const RAW_INTENT_MAX_LENGTH = 120;
const ALLOWED_BROWSER_ORIGINS = new Set([
  `http://127.0.0.1:${UI_PORT}`,
  `http://localhost:${UI_PORT}`,
]);

function json(res, statusCode, value) {
  const body = JSON.stringify(value, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function text(res, statusCode, value) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(value || "");
}

function badRequest(res, message) {
  json(res, 400, { ok: false, error: "bad_request", message });
}

function getBrowserOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (origin) {
    return origin;
  }

  const referer = String(req.headers.referer || "").trim();
  if (!referer) {
    return "";
  }

  try {
    return new URL(referer).origin;
  } catch {
    return "";
  }
}

function hasBrowserFetchMetadata(req) {
  return Boolean(
    req.headers["sec-fetch-site"] ||
    req.headers["sec-fetch-mode"] ||
    req.headers["sec-fetch-dest"]
  );
}

function rejectDisallowedBrowserOrigin(req, res) {
  const browserOrigin = getBrowserOrigin(req);
  const browserLikeRequest = Boolean(browserOrigin) || hasBrowserFetchMetadata(req);

  if (!browserLikeRequest) {
    return false;
  }

  if (ALLOWED_BROWSER_ORIGINS.has(browserOrigin)) {
    return false;
  }

  json(res, 403, {
    ok: false,
    error: "origin_not_allowed",
    detail: `Product API only accepts browser requests from ${[...ALLOWED_BROWSER_ORIGINS].join(", ")}`,
  });
  return true;
}

function handleOptions(req, res) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin || !ALLOWED_BROWSER_ORIGINS.has(origin)) {
    res.writeHead(403, { "Cache-Control": "no-store" });
    res.end();
    return;
  }

  res.writeHead(204, {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseJsonBody(body) {
  if (!body || !body.trim()) {
    return {};
  }

  return JSON.parse(body);
}

function normalizeRawIntent(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

async function handleL0InitRequest(req, res) {
  try {
    const payload = parseJsonBody(await readBody(req));
    const rawIntent = normalizeRawIntent(payload?.raw_intent);

    if (!rawIntent) {
      return badRequest(res, "raw_intent_missing");
    }

    if (rawIntent.length > RAW_INTENT_MAX_LENGTH) {
      return badRequest(res, `raw_intent_too_long_max_${RAW_INTENT_MAX_LENGTH}`);
    }

    const l0Result = runL0Agent(rawIntent);
    const decisionGraph = l0Result?.decision_graph || null;
    const l1Result = runL1Agent(decisionGraph);

    return json(res, 200, {
      status: "IN_PROGRESS",
      decision_graph: decisionGraph,
      interrogation_plan: l1Result?.interrogation_plan || {},
    });
  } catch (err) {
    return json(res, 500, {
      ok: false,
      error: "l0_init_failed",
      detail: String(err?.message || err),
    });
  }
}

async function handleL1VerifyRequest(req, res) {
  try {
    const payload = parseJsonBody(await readBody(req));
    const rawIntent = normalizeRawIntent(payload?.raw_intent);
    const decisionGraph = payload?.decision_graph;
    const interrogationTrace = payload?.interrogation_trace;

    if (!decisionGraph || typeof decisionGraph !== "object") {
      return badRequest(res, "decision_graph_missing");
    }

    const result = runL19Agent({
      raw_intent: rawIntent,
      decision_graph: decisionGraph,
      interrogation_trace: interrogationTrace,
    });

    return json(res, 200, result);
  } catch (err) {
    return json(res, 500, {
      ok: false,
      error: "l1_verify_failed",
      detail: String(err?.message || err),
    });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || HOST}`);
  const pathname = url.pathname;

  if (rejectDisallowedBrowserOrigin(req, res)) {
    return;
  }

  if (req.method === "OPTIONS") {
    return handleOptions(req, res);
  }

  if (req.method === "GET" && pathname === "/api/health") {
    return json(res, 200, {
      ok: true,
      host: HOST,
      port: PORT,
      product_root: path.resolve(__dirname, ".."),
    });
  }

  if (req.method === "POST" && (pathname === "/api/l0/init" || pathname === "/l0/init")) {
    return handleL0InitRequest(req, res);
  }

  if (req.method === "POST" && (pathname === "/api/l1/verify" || pathname === "/l1/verify")) {
    return handleL1VerifyRequest(req, res);
  }

  if (req.method === "GET" && pathname === "/") {
    return text(
      res,
      200,
      [
        "AI-Human OS Product API",
        `- health: http://${HOST}:${PORT}/api/health`,
        "- routes: POST /api/l0/init, POST /api/l1/verify",
      ].join("\n") + "\n"
    );
  }

  return json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, HOST, () => {
  console.log(`AI-Human OS Product API listening on http://${HOST}:${PORT}`);
});
