import { describe, expect, it } from "vitest";

import { orderSentenceExplanationModules } from "../../server/sentence-explanation-service";

describe("orderSentenceExplanationModules", () => {
  it("always returns modules in the fixed explanation order", () => {
    expect(
      orderSentenceExplanationModules({
        vocabulary: "vocabulary-image",
        translation: "translation-image",
        ielts: "ielts-image",
        grammar: "grammar-image",
        summary: "summary-image",
      }),
    ).toEqual(["translation", "grammar", "summary", "vocabulary", "ielts"]);
  });
});
