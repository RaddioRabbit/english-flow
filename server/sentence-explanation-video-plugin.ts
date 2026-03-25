import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";

import type { SentenceExplanationVideoRequest } from "../src/lib/sentence-explanation-video-contract";
import {
  generateSentenceExplanationVideoMp4,
  listSentenceExplanationVideoFonts,
} from "./sentence-explanation-video-service";

const SENTENCE_EXPLANATION_VIDEO_PATH = "/api/sentence-explanation-video";
const SENTENCE_EXPLANATION_VIDEO_FONTS_PATH = "/api/sentence-explanation-video-fonts";

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

export function sentenceExplanationVideoApiPlugin(): Plugin {
  return {
    name: "sentence-explanation-video-api",
    configureServer(server) {
      attachSentenceExplanationVideoMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachSentenceExplanationVideoMiddleware(server.middlewares);
    },
  };
}

function attachSentenceExplanationVideoMiddleware(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    const pathname = getRequestPathname(req.url);
    if (pathname !== SENTENCE_EXPLANATION_VIDEO_PATH && pathname !== SENTENCE_EXPLANATION_VIDEO_FONTS_PATH) {
      next();
      return;
    }

    if (pathname === SENTENCE_EXPLANATION_VIDEO_FONTS_PATH) {
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "Method not allowed" });
        return;
      }

      try {
        const fonts = await listSentenceExplanationVideoFonts();
        sendJson(res, 200, { fonts });
      } catch (error) {
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : "Failed to list video subtitle fonts.",
        });
      }
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    try {
      const body = (await readJsonBody(req)) as SentenceExplanationVideoRequest;
      const result = await generateSentenceExplanationVideoMp4(body);

      res.statusCode = 200;
      res.setHeader("content-type", result.mimeType);
      res.setHeader(
        "content-disposition",
        `attachment; filename="${encodeURIComponent(result.fileName)}"; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
      );
      res.end(result.buffer);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "MP4 视频生成失败，请稍后重试。",
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
