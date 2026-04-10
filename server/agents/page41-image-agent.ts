/**
 * Page 4-1 Image Agent - 雅思备考图生成
 * 基于 english_page4_1_agent.js 转换的 Subagent
 * 生成 4 宫格雅思备考教学条漫
 */

import { buildIeltsImagePrompt } from "../../src/lib/ielts-image-prompt";
import type { ImageGenerationResult } from "./page11-image-agent";
import { IMAGE_GENERATION_SKILL_NAME } from "../image-generation-skill";

export interface Page41ImageAgentInput {
  ieltsTips: {
    listening: string;
    speaking: string;
    reading: string;
    writing: string;
  };
  referenceImage?: string;
}

/**
 * 调用 aifast-image-generation skill 生成图像
 */
async function generateImageWithSkill(
  prompt: string,
  referenceImage?: string
): Promise<{ success: boolean; imageDataUrl?: string; error?: string }> {
  try {
    const result = await (globalThis as unknown as {
      skill: (name: string, params: Record<string, unknown>) => Promise<unknown>;
    }).skill(IMAGE_GENERATION_SKILL_NAME, {
      prompt,
      reference_image: referenceImage || undefined,
    });

    const typedResult = result as { image_url?: string; image_data_url?: string };

    return {
      success: true,
      imageDataUrl: typedResult.image_data_url || typedResult.image_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "图像生成失败",
    };
  }
}

/**
 * Page 4-1 Image Agent 主函数
 * 生成雅思备考图（4宫格）
 */
export async function generatePage41Image(
  input: Page41ImageAgentInput
): Promise<ImageGenerationResult> {
  try {
    const finalPrompt = buildIeltsImagePrompt(input.ieltsTips);

    // 直接使用结构化 prompt，避免把原句或参考图文字带入雅思备考图。
    const generationResult = await generateImageWithSkill(
      finalPrompt,
      input.referenceImage
    );

    if (!generationResult.success) {
      return {
        success: false,
        error: generationResult.error,
        metadata: {
          moduleId: "ielts",
          promptLength: finalPrompt.length,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      imageDataUrl: generationResult.imageDataUrl,
      metadata: {
        moduleId: "ielts",
        promptLength: finalPrompt.length,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      metadata: {
        moduleId: "ielts",
        promptLength: 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
