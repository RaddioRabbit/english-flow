import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { SentenceExplanationRequest } from "../src/lib/sentence-explanation-contract";
import { installEnglishSentenceExplanationSkillShim } from "./english-sentence-explanation-skill-shim";
import { generateSentenceExplanation } from "./sentence-explanation-service";

interface SentenceExplanationPluginEnv {
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

export function sentenceExplanationApiPlugin(env: SentenceExplanationPluginEnv): Plugin {
  installEnglishSentenceExplanationSkillShim(env);

  return {
    name: "sentence-explanation-api",
    configureServer(server) {
      attachSentenceExplanationMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachSentenceExplanationMiddleware(server.middlewares);
    },
  };
}

export function isSentenceExplanationApiRequest(url: string | undefined) {
  if (!url) {
    return false;
  }

  try {
    return new URL(url, "http://localhost").pathname === "/api/sentence-explanation";
  } catch {
    return false;
  }
}

function attachSentenceExplanationMiddleware(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    if (!isSentenceExplanationApiRequest(req.url)) {
      next();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = (await readJsonBody(req)) as SentenceExplanationRequest;
      const result = await generateSentenceExplanation(body);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "句子讲解生成失败，请稍后重试。",
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
