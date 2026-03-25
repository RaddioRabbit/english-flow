import { afterEach, describe, expect, it, vi } from "vitest";

import type { SentenceExplanationTtsRequest } from "@/lib/sentence-explanation-tts-contract";
import { runSentenceExplanationTtsSkill } from "../../server/sentence-explanation-tts-skill-shim";

function buildRequest(): SentenceExplanationTtsRequest {
  return {
    taskId: "task-tts",
    language: "zh",
    voice: "Chinese (Mandarin)_News_Anchor",
    article: {
      title: "Sentence explanation",
      welcomeMessage: "Welcome",
      introduction: "First intro line\nSecond intro line",
      introductionLines: ["First intro line", "Second intro line"],
      sections: [
        {
          moduleId: "translation",
          moduleName: "Translation",
          imageRef: "translation",
          content: "Translate the scene first.\nThen go back to the original sentence.",
          lines: ["Translate the scene first.", "Then go back to the original sentence."],
        },
      ],
      conclusion: "Wrap the narration and sentence together.",
      conclusionLines: ["Wrap the narration and sentence together."],
      totalWordCount: 0,
    },
  };
}

function buildMiniMaxSuccess(text: string) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: () => null,
    },
    json: async () => ({
      data: {
        audio: Buffer.from(`audio:${text}`).toString("hex"),
        status: 0,
      },
      base_resp: {
        status_code: 0,
      },
    }),
    text: async () => "",
  };
}

function buildMiniMaxRateLimitError(retryAfterSeconds = 1) {
  return {
    ok: false,
    status: 429,
    headers: {
      get: (name: string) => (name.toLowerCase() === "retry-after" ? String(retryAfterSeconds) : null),
    },
    json: async () => ({}),
    text: async () => "rate limit exceeded(RPM)",
  };
}

describe("sentence explanation tts skill shim", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps explicit article line arrays as one-to-one tts segments", async () => {
    const request = buildRequest();
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      return buildMiniMaxSuccess(body.text || "");
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await runSentenceExplanationTtsSkill(request, {
      MINIMAX_API_KEY: "test-key",
      MINIMAX_BASE_URL: "https://api.minimaxi.com/v1/t2a_v2",
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.introduction.lineAudios?.map((lineAudio) => lineAudio.text)).toEqual([
      "First intro line",
      "Second intro line",
    ]);
    expect(result.sections[0]?.content.lineAudios?.map((lineAudio) => lineAudio.text)).toEqual([
      "Translate the scene first.",
      "Then go back to the original sentence.",
    ]);
    expect(result.metadata.totalSegments).toBe(5);
    expect(result.metadata.successfulSegments).toBe(5);
  });

  it("starts multiple segment synthesis requests in parallel so the whole job does not block on one line at a time", async () => {
    const request = buildRequest();
    const startedTexts: string[] = [];
    const resolvers: Array<() => void> = [];
    const fetchMock = vi.fn((_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      const text = body.text || "";
      startedTexts.push(text);

      return new Promise((resolve) => {
        resolvers.push(() => resolve(buildMiniMaxSuccess(text)));
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const promise = runSentenceExplanationTtsSkill(request, {
      MINIMAX_API_KEY: "test-key",
      MINIMAX_BASE_URL: "https://api.minimaxi.com/v1/t2a_v2",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(startedTexts.length).toBeGreaterThan(1);

    resolvers.forEach((resolve) => resolve());

    const result = await promise;
    expect(result.metadata.successfulSegments).toBe(5);
  });

  it("fails the whole request when any sentence still cannot be synthesized", async () => {
    const request = buildRequest();
    const failingSentence = "Second intro line";
    const callCounts = new Map<string, number>();
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      const text = body.text || "";
      callCounts.set(text, (callCounts.get(text) || 0) + 1);

      if (text === failingSentence) {
        return {
          ok: false,
          status: 500,
          headers: {
            get: () => null,
          },
          text: async () => "synthetic failure",
          json: async () => ({}),
        };
      }

      return buildMiniMaxSuccess(text);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      runSentenceExplanationTtsSkill(request, {
        MINIMAX_API_KEY: "test-key",
        MINIMAX_BASE_URL: "https://example.com/v1/t2a_v2",
      }),
    ).rejects.toThrow("Sentence explanation TTS still has 1/5 failed segments");
    expect(callCounts.get(failingSentence)).toBeGreaterThan(1);
  });

  it("waits for rate limit cooldown and retries the same segment before failing the whole job", async () => {
    vi.useFakeTimers();

    const request = buildRequest();
    const limitedSentence = request.article.introductionLines?.[1] || "";
    const callCounts = new Map<string, number>();
    const fetchMock = vi.fn(async (_input: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { text?: string };
      const text = body.text || "";
      const count = (callCounts.get(text) || 0) + 1;
      callCounts.set(text, count);

      if (text === limitedSentence && count === 1) {
        return buildMiniMaxRateLimitError(1);
      }

      return buildMiniMaxSuccess(text);
    });

    vi.stubGlobal("fetch", fetchMock);

    const promise = runSentenceExplanationTtsSkill(request, {
      MINIMAX_API_KEY: "test-key",
      MINIMAX_BASE_URL: "https://api.minimaxi.com/v1/t2a_v2",
      SENTENCE_EXPLANATION_TTS_CONCURRENCY: "1",
    });

    await vi.advanceTimersByTimeAsync(1_000);

    const result = await promise;
    expect(result.metadata.successfulSegments).toBe(5);
    expect(callCounts.get(limitedSentence)).toBe(2);
  });
});
