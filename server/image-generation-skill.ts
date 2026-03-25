export const IMAGE_GENERATION_SKILL_NAME = "aifast-image-generation";

type RuntimeSkill = (name: string, params: Record<string, unknown>) => Promise<unknown>;

type RuntimeImageGenerationResult = {
  image_url?: string;
  image_data_url?: string;
};

type ImageGenerationSkillCallResult = {
  success: boolean;
  imageDataUrl?: string;
  error?: string;
};

function getRuntimeSkill() {
  return (globalThis as typeof globalThis & { skill?: RuntimeSkill }).skill;
}

export async function generateImageWithSkill(
  prompt: string,
  referenceImage?: string,
): Promise<ImageGenerationSkillCallResult> {
  try {
    const runtimeSkill = getRuntimeSkill();
    if (!runtimeSkill) {
      throw new Error(`Image generation skill "${IMAGE_GENERATION_SKILL_NAME}" is not installed.`);
    }

    const result = (await runtimeSkill(IMAGE_GENERATION_SKILL_NAME, {
      prompt,
      reference_image: referenceImage || undefined,
    })) as RuntimeImageGenerationResult;

    const imageDataUrl = result.image_data_url || result.image_url;
    if (!imageDataUrl) {
      throw new Error(`Image generation skill "${IMAGE_GENERATION_SKILL_NAME}" returned no image data.`);
    }

    return {
      success: true,
      imageDataUrl,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "图像生成失败",
    };
  }
}
