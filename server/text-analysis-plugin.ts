import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { TextAnalysisRequest } from "../src/lib/text-analysis-contract";
import { analyzeSentence } from "./text-analysis-service-v2";

interface TextAnalysisPluginEnv {
  OPENAI_API_KEY?: string;
  OPENAI_API_BASE?: string;
  OPENAI_MODEL?: string;
  OPENAI_HTTP_TIMEOUT_MS?: string;
  OPENAI_HTTP_MAX_RETRIES?: string;
  // 兼容 Kimi 的变量名
  Kimi_API_KEY?: string;
  Kimi_API_BASE?: string;
  Kimi_MODEL?: string;
  // 保留旧配置兼容
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

export function textAnalysisApiPlugin(env: TextAnalysisPluginEnv): Plugin {
  return {
    name: "text-analysis-api",
    configureServer(server) {
      attachTextAnalysisMiddleware(server.middlewares, env);
    },
    configurePreviewServer(server) {
      attachTextAnalysisMiddleware(server.middlewares, env);
    },
  };
}

function attachTextAnalysisMiddleware(middlewares: Connect.Server, env: TextAnalysisPluginEnv) {
  middlewares.use(async (req, res, next) => {
    if (!req.url?.startsWith("/api/text-analysis")) {
      next();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = (await readJsonBody(req)) as TextAnalysisRequest;
      const result = await analyzeSentence(body, env);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "文本解析失败，请稍后重试。",
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
