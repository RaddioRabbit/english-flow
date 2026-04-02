import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import { installTextTransferSkillShim } from "./text-transfer-skill-shim";

const MAX_BODY_BYTES = 20 * 1024 * 1024; // 20MB

export function textTransferApiPlugin(): Plugin {
  installTextTransferSkillShim();

  return {
    name: "text-transfer-api",
    configureServer(server) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      attachMiddleware(server.middlewares);
    },
  };
}

function attachMiddleware(middlewares: Connect.Server) {
  middlewares.use(async (req, res, next) => {
    if (req.url?.startsWith("/api/text-transfer")) {
      await handleTextTransfer(req, res);
      return;
    }
    next();
  });
}

async function handleTextTransfer(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { success: false, error: "Method not allowed" });
    return;
  }

  let body: unknown;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (err) {
    sendJson(res, 400, { success: false, error: err instanceof Error ? err.message : "Invalid request body" });
    return;
  }

  const params = body as Record<string, unknown>;

  if (typeof params.refImage !== "string" || !params.refImage) {
    sendJson(res, 400, { success: false, error: "缺少 refImage" });
    return;
  }
  if (typeof params.targetImage !== "string" || !params.targetImage) {
    sendJson(res, 400, { success: false, error: "缺少 targetImage" });
    return;
  }
  const hasPrompt = typeof params.prompt === "string" && params.prompt.trim().length > 0;
  const hasTargetText = typeof params.targetText === "string" && params.targetText.trim().length > 0;

  if (!hasPrompt && !hasTargetText) {
    sendJson(res, 400, { success: false, error: "缺少 prompt（编辑要求）" });
    return;
  }

  try {
    const runtime = globalThis as { skill?: (name: string, params: unknown) => Promise<unknown> };
    if (!runtime.skill) {
      sendJson(res, 503, { success: false, error: "text-transfer skill 未就绪，请检查 python 环境" });
      return;
    }

    const result = await runtime.skill("aifast-text-transfer-editor", params);
    sendJson(res, 200, { success: true, ...(result as object) });
  } catch (err) {
    sendJson(res, 500, {
      success: false,
      error: err instanceof Error ? err.message : "图片生成失败",
    });
  }
}

function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error(`Request body too large (max ${maxBytes / 1024 / 1024}MB)`));
        return;
      }
      raw += chunk.toString();
    });

    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
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
