import { afterEach, describe, expect, it, vi } from "vitest";

import { generatePage11Image } from "../../server/agents/page11-image-agent";
import { generatePage221Image } from "../../server/agents/page221-image-agent";
import { IMAGE_GENERATION_SKILL_NAME } from "../../server/image-generation-skill";

type RuntimeWithSkill = typeof globalThis & {
  skill?: (name: string, params: Record<string, unknown>) => Promise<unknown>;
};

const runtime = globalThis as RuntimeWithSkill;

describe("image generation agents runtime skill integration", () => {
  afterEach(() => {
    delete runtime.skill;
    vi.restoreAllMocks();
  });

  it("uses aifast-image-generation for translation image generation", async () => {
    const skill = vi.fn().mockResolvedValue({
      image_data_url: "data:image/png;base64,translation-image",
    });
    runtime.skill = skill;

    const result = await generatePage11Image({
      bookName: "Test Book",
      originSentence: "The boy opened the window.",
      prompt1: "The boy",
      prompt2: "opened",
      prompt3: "the window",
      prompt4: "carefully",
      referenceImage: "data:image/png;base64,reference-image",
    });

    expect(result.success).toBe(true);
    expect(result.imageDataUrl).toBe("data:image/png;base64,translation-image");
    expect(skill).toHaveBeenCalledTimes(1);
    expect(skill).toHaveBeenCalledWith(
      IMAGE_GENERATION_SKILL_NAME,
      expect.objectContaining({
        reference_image: "data:image/png;base64,reference-image",
      }),
    );
  });

  it("surfaces runtime skill failures from grammar image generation", async () => {
    const skill = vi.fn().mockRejectedValue(new Error("AIFAST unavailable"));
    runtime.skill = skill;

    const result = await generatePage221Image({
      originSentence: "He agreed to help when the storm arrived.",
      grammarAnalysis: {
        tense: "一般过去时",
        voice: "主动语态",
        structure: "- 主句\n- 时间状语从句\n**完整结构总结**",
      },
      referenceImage: "data:image/png;base64,reference-image",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("AIFAST unavailable");
    expect(skill).toHaveBeenCalledTimes(1);
    expect(skill).toHaveBeenCalledWith(
      IMAGE_GENERATION_SKILL_NAME,
      expect.objectContaining({
        reference_image: "data:image/png;base64,reference-image",
      }),
    );
  });
});
