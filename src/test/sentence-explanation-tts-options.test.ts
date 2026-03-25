import { describe, expect, it } from "vitest";

import {
  getSentenceExplanationTtsAccentOptions,
  getSentenceExplanationTtsGenderOptions,
  resolveSentenceExplanationTtsSelection,
  resolveSentenceExplanationTtsVoice,
} from "@/lib/sentence-explanation-tts-options";

describe("sentence explanation tts options", () => {
  it("exposes language-specific accent options", () => {
    const accents = getSentenceExplanationTtsAccentOptions("zh");

    expect(accents.map((option) => option.value)).toEqual(["hong-kong-mandarin", "mandarin"]);
  });

  it("filters genders by language and accent", () => {
    const genders = getSentenceExplanationTtsGenderOptions("yue", "cantonese");

    expect(genders.map((option) => option.value)).toEqual(["female", "male"]);
  });

  it("resolves voice selection from language, accent, and gender", () => {
    const selection = resolveSentenceExplanationTtsSelection({
      language: "en",
      accent: "australian-english",
      gender: "male",
    });

    expect(selection.voice).toBe("English_Aussie_Bloke");
    expect(selection.voiceOption.label).toBe("Aussie Bloke");
  });

  it("falls back to the language default voice when voice and language do not match", () => {
    expect(resolveSentenceExplanationTtsVoice("en", "Chinese (Mandarin)_News_Anchor")).toBe(
      "English_Graceful_Lady",
    );
  });
});
