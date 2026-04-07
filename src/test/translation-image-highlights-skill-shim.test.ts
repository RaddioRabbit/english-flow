import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function resetRuntimeSkillRegistry() {
  delete (globalThis as typeof globalThis & Record<string, unknown>).skill;
  delete (globalThis as typeof globalThis & Record<string, unknown>).__englishFlowRuntimeSkillRegistry;
  delete (globalThis as typeof globalThis & Record<string, unknown>).__englishFlowRuntimeSkillHandler;
}

describe("translation image highlights runtime skill shim", () => {
  beforeEach(() => {
    vi.resetModules();
    resetRuntimeSkillRegistry();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    resetRuntimeSkillRegistry();
  });

  it("registers translation-image-highlights and returns parsed skill output", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/messages")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    highlights: [
                      {
                        id: "vocab-bargain",
                        word: "bargain",
                        color: "#2563eb",
                        english: {
                          panel: "prompt3",
                          text: "bargain",
                          start: 73,
                          end: 80,
                          color: "#2563eb",
                        },
                        chinese: {
                          panel: "prompt4",
                          text: "廉价",
                          start: 17,
                          end: 19,
                          color: "#2563eb",
                        },
                      },
                    ],
                  }),
                },
              ],
            }),
        } satisfies Partial<Response> as Response;
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    const { installTranslationImageHighlightsSkillShim } = await import(
      "../../server/translation-image-highlights-skill-shim"
    );

    installTranslationImageHighlightsSkillShim({
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_BASE_URL: "https://api.kimi.com/coding/",
      ANTHROPIC_MODEL: "kimi-for-coding",
    });

    const result = (await (globalThis as typeof globalThis & {
      skill: (name: string, params: unknown) => Promise<unknown>;
    }).skill("translation-image-highlights", {
      prompt1: "",
      prompt2: "",
      prompt3:
        "one was of black-and-white checkered sateen which she had picked up at a bargain counter in the winter; and one was a stiff print of an ugly blue shade which she had purchased that week at a Carmody store.",
      prompt4:
        "一条是黑白格子的缎子布，是冬天她在廉价柜台淘来的；还有一件是质地硬挺的印花布，颜色是难看的蓝色，那是她这周在卡莫迪的商店里买的。",
      vocabulary: [{ word: "bargain", meaning: "便宜" }],
    })) as {
      highlights: Array<{
        word: string;
        chinese?: { text: string; panel: string };
      }>;
    };

    expect(result.highlights).toEqual([
      expect.objectContaining({
        word: "bargain",
        chinese: expect.objectContaining({
          panel: "prompt4",
          text: "廉价",
        }),
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
