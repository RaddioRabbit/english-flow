import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { XiaohongshuAnalysisRequest } from "../src/lib/xiaohongshu-analysis-contract";
import { generateXiaohongshuAnalysis } from "./xiaohongshu-analysis-service";

interface XiaohongshuAnalysisPluginEnv {
  OPENAI_API_KEY?: string;
  OPENAI_API_BASE?: string;
  OPENAI_MODEL?: string;
  OPENAI_HTTP_TIMEOUT_MS?: string;
  OPENAI_HTTP_MAX_RETRIES?: string;
  Kimi_API_KEY?: string;
  Kimi_API_BASE?: string;
  Kimi_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

export function xiaohongshuAnalysisApiPlugin(env: XiaohongshuAnalysisPluginEnv): Plugin {
  return {
    name: "xiaohongshu-analysis-api",
    configureServer(server) {
      attachXiaohongshuAnalysisMiddleware(server.middlewares, env);
    },
    configurePreviewServer(server) {
      attachXiaohongshuAnalysisMiddleware(server.middlewares, env);
    },
  };
}

function attachXiaohongshuAnalysisMiddleware(middlewares: Connect.Server, env: XiaohongshuAnalysisPluginEnv) {
  middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/api/xiaohongshu-analysis")) {
      next();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = (await readJsonBody(req)) as XiaohongshuAnalysisRequest;
      const result = await generateXiaohongshuAnalysis(body, env);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "小红书文案生成失败，请稍后重试。",
      });
    }
  });
}

function readJsonBody(req: IncomingMessage) {
  return new Promise<unknown>((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
