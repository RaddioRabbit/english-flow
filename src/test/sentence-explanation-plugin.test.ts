import { describe, expect, it } from "vitest";

import { isSentenceExplanationApiRequest } from "../../server/sentence-explanation-plugin";
import {
  isSentenceExplanationTtsApiRequest,
  isSentenceExplanationTtsPreviewApiRequest,
} from "../../server/sentence-explanation-tts-plugin";

describe("sentence explanation API route matching", () => {
  it("matches only the article generation endpoint", () => {
    expect(isSentenceExplanationApiRequest("/api/sentence-explanation")).toBe(true);
    expect(isSentenceExplanationApiRequest("/api/sentence-explanation?taskId=1")).toBe(true);
    expect(isSentenceExplanationApiRequest("/api/sentence-explanation-tts")).toBe(false);
    expect(isSentenceExplanationApiRequest("/api/sentence-explanation-tts?taskId=1")).toBe(false);
  });

  it("matches only the TTS endpoint", () => {
    expect(isSentenceExplanationTtsApiRequest("/api/sentence-explanation-tts")).toBe(true);
    expect(isSentenceExplanationTtsApiRequest("/api/sentence-explanation-tts?taskId=1")).toBe(true);
    expect(isSentenceExplanationTtsApiRequest("/api/sentence-explanation-tts-preview")).toBe(false);
    expect(isSentenceExplanationTtsApiRequest("/api/sentence-explanation")).toBe(false);
    expect(isSentenceExplanationTtsApiRequest("/api/sentence-explanation?taskId=1")).toBe(false);
  });

  it("matches only the preview endpoint", () => {
    expect(isSentenceExplanationTtsPreviewApiRequest("/api/sentence-explanation-tts-preview")).toBe(true);
    expect(isSentenceExplanationTtsPreviewApiRequest("/api/sentence-explanation-tts-preview?taskId=1")).toBe(true);
    expect(isSentenceExplanationTtsPreviewApiRequest("/api/sentence-explanation-tts")).toBe(false);
    expect(isSentenceExplanationTtsPreviewApiRequest("/api/sentence-explanation")).toBe(false);
  });
});
