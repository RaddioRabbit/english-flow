import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import type { ModuleId, TextContent, ReferenceAsset } from "../src/lib/task-store";
import {
  generateModuleImage,
  generateMultipleImages,
  buildImageGenerationRequests,
  type ImageGenerationRequest,
} from "./image-generation-service";
import { installAIFASTImageSkillShim } from "./aifast-image-skill-shim";
import { installTranslationImageHighlightsSkillShim } from "./translation-image-highlights-skill-shim";

interface ImageGenerationPluginEnv {
  // 可以添加图像生成相关的环境变量配置
  IMAGE_GENERATION_TIMEOUT_MS?: string;
  IMAGE_GENERATION_MAX_RETRIES?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  ANTHROPIC_HTTP_TIMEOUT_MS?: string;
  ANTHROPIC_HTTP_MAX_RETRIES?: string;
}

export function imageGenerationApiPlugin(env: ImageGenerationPluginEnv): Plugin {
  installAIFASTImageSkillShim();
  installTranslationImageHighlightsSkillShim(env);

  return {
    name: "image-generation-api",
    configureServer(server) {
      attachImageGenerationMiddleware(server.middlewares, env);
    },
    configurePreviewServer(server) {
      attachImageGenerationMiddleware(server.middlewares, env);
    },
  };
}

interface GenerateImageRequest {
  taskId: string;
  moduleId: ModuleId;
  textContent: TextContent;
  bookName: string;
  originSentence: string;
  referenceImage?: string;
}

interface GenerateImagesBatchRequest {
  taskId: string;
  modules: ModuleId[];
  textContent: TextContent;
  bookName: string;
  originSentence: string;
  referenceImages: Record<ModuleId, ReferenceAsset | null>;
}

function attachImageGenerationMiddleware(
  middlewares: Connect.Server,
  _env: ImageGenerationPluginEnv
) {
  middlewares.use(async (req, res, next) => {
    // 处理单张图片生成
    if (req.url?.startsWith("/api/image-generation/generate")) {
      await handleGenerateImage(req, res);
      return;
    }

    // 处理批量图片生成
    if (req.url?.startsWith("/api/image-generation/batch")) {
      await handleGenerateImagesBatch(req, res);
      return;
    }

    next();
  });
}

async function handleGenerateImage(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as GenerateImageRequest;

    // 验证请求参数
    if (!body.taskId || !body.moduleId || !body.textContent) {
      sendJson(res, 400, { error: "缺少必要参数: taskId, moduleId, textContent" });
      return;
    }

    const request: ImageGenerationRequest = {
      taskId: body.taskId,
      moduleId: body.moduleId,
      textContent: body.textContent,
      bookName: body.bookName,
      originSentence: body.originSentence,
      referenceImage: body.referenceImage,
    };

    const result = await generateModuleImage(request);

    sendJson(res, result.success ? 200 : 500, result);
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : "图像生成失败",
      moduleId: null,
      metadata: {
        promptLength: 0,
        generatedAt: new Date().toISOString(),
      },
    });
  }
}

async function handleGenerateImagesBatch(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = (await readJsonBody(req)) as GenerateImagesBatchRequest;

    // 验证请求参数
    if (!body.taskId || !body.modules || !body.textContent) {
      sendJson(res, 400, { error: "缺少必要参数: taskId, modules, textContent" });
      return;
    }

    const requests = buildImageGenerationRequests(
      body.taskId,
      body.modules,
      body.textContent,
      body.bookName,
      body.originSentence,
      body.referenceImages
    );

    const results = await generateMultipleImages(requests);

    sendJson(res, 200, {
      success: true,
      taskId: body.taskId,
      results,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : "批量图像生成失败",
      results: [],
    });
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
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
