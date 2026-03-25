import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type {
  SentenceExplanationTtsPreviewRequest,
  SentenceExplanationTtsRequest,
} from "../src/lib/sentence-explanation-tts-contract";
import { installSentenceExplanationTtsSkillShim } from "./sentence-explanation-tts-skill-shim";
import {
  generateSentenceExplanationTts,
  previewSentenceExplanationTts,
} from "./sentence-explanation-tts-service";

const SENTENCE_EXPLANATION_TTS_API_VERSION = "tts-v2";
const SENTENCE_EXPLANATION_TTS_PATH = "/api/sentence-explanation-tts";
const SENTENCE_EXPLANATION_TTS_PREVIEW_PATH = "/api/sentence-explanation-tts-preview";

interface SentenceExplanationTtsPluginEnv {
  MINIMAX_API_KEY?: string;
  MINIMAX_BASE_URL?: string;
  SENTENCE_EXPLANATION_TTS_TIMEOUT_MS?: string;
  SENTENCE_EXPLANATION_TTS_MAX_RETRIES?: string;
  SENTENCE_EXPLANATION_TTS_SEGMENT_RETRY_PASSES?: string;
  SENTENCE_EXPLANATION_TTS_CONCURRENCY?: string;
  SENTENCE_EXPLANATION_TTS_RATE_LIMIT_RETRIES?: string;
  SENTENCE_EXPLANATION_TTS_RATE_LIMIT_COOLDOWN_MS?: string;
}

function getRequestPathname(url: string | undefined) {
  if (!url) {
    return "";
  }

  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return "";
  }
}

export function sentenceExplanationTtsApiPlugin(env: SentenceExplanationTtsPluginEnv): Plugin {
  installSentenceExplanationTtsSkillShim(env);

  return {
    name: "sentence-explanation-tts-api",
    configureServer(server) {
      attachSentenceExplanationTtsMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachSentenceExplanationTtsMiddleware(server.middlewares);
    },
  };
}

export function isSentenceExplanationTtsApiRequest(url: string | undefined) {
  return getRequestPathname(url) === SENTENCE_EXPLANATION_TTS_PATH;
}

export function isSentenceExplanationTtsPreviewApiRequest(url: string | undefined) {
  return getRequestPathname(url) === SENTENCE_EXPLANATION_TTS_PREVIEW_PATH;
}

function buildErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return `[${SENTENCE_EXPLANATION_TTS_API_VERSION}] 文本转语音失败，请稍后重试。`;
  }

  const stackLine = error.stack?.split("\n")[1]?.trim();
  const details = [error.message, stackLine].filter(Boolean).join(" | ");
  return `[${SENTENCE_EXPLANATION_TTS_API_VERSION}] ${details}`;
}

function attachSentenceExplanationTtsMiddleware(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const pathname = getRequestPathname(req.url);
    const isTtsRequest = pathname === SENTENCE_EXPLANATION_TTS_PATH;
    const isPreviewRequest = pathname === SENTENCE_EXPLANATION_TTS_PREVIEW_PATH;

    if (!isTtsRequest && !isPreviewRequest) {
      next();
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const result = isPreviewRequest
        ? await previewSentenceExplanationTts(body as SentenceExplanationTtsPreviewRequest)
        : await generateSentenceExplanationTts(body as SentenceExplanationTtsRequest);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, {
        error: buildErrorMessage(error),
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
  res.setHeader("x-sentence-explanation-tts-version", SENTENCE_EXPLANATION_TTS_API_VERSION);
  res.end(JSON.stringify(payload));
}
