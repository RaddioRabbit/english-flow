# Translation Highlight Pairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为“句译对照图”增加稳定的中英同步高亮，并保留底部场景图的现有生成方式。

**Architecture:** 新增一个高亮匹配 helper 负责从 `prompt1-4` 和 `vocabulary` 推导英文/中文片段，再新增一个 SVG 组装 helper 输出最终卡片。`page11-image-agent` 继续向图像技能请求完整参考图，但最终只裁切底部场景区域，并把上方四格换成确定性渲染文本。`task-store` 的本地 fallback 复用同一 SVG 组装逻辑。

**Tech Stack:** TypeScript, Vitest, SVG data URLs, existing image-generation skill runtime

---

### Task 1: Lock Highlight Matching With Tests

**Files:**
- Create: `src/test/translation-image-highlights.test.ts`
- Test: `src/test/translation-image-highlights.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { buildTranslationHighlights } from "@/lib/translation-image-highlights";

describe("buildTranslationHighlights", () => {
  it("pairs english words with matching chinese meanings in the corresponding panels", () => {
    const highlights = buildTranslationHighlights({
      prompt1: "After all, Xury's advice was good, and I took it;",
      prompt2: "毕竟，休里的建议很好，我采纳了；",
      prompt3: "we dropped our little anchor, and lay still all night.",
      prompt4: "我们抛下小锚，整夜静静停泊。",
      vocabulary: [
        {
          id: "vocab-advice",
          word: "advice",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "建议",
          example: "",
          translation: "",
        },
        {
          id: "vocab-anchor",
          word: "anchor",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "锚；小锚",
          example: "",
          translation: "",
        },
      ],
    });

    expect(highlights).toHaveLength(2);
    expect(highlights[0].english.panel).toBe("prompt1");
    expect(highlights[0].english.text.toLowerCase()).toBe("advice");
    expect(highlights[0].chinese.panel).toBe("prompt2");
    expect(highlights[0].chinese.text).toBe("建议");
    expect(highlights[0].color).toBe(highlights[0].chinese.color);

    expect(highlights[1].english.panel).toBe("prompt3");
    expect(highlights[1].chinese.panel).toBe("prompt4");
    expect(highlights[1].chinese.text).toBe("小锚");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/translation-image-highlights.test.ts`
Expected: FAIL with module-not-found or missing export errors for `translation-image-highlights`.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildTranslationHighlights() {
  return [];
}
```

- [ ] **Step 4: Run test to verify it still fails for the right reason**

Run: `npm test -- src/test/translation-image-highlights.test.ts`
Expected: FAIL because returned highlights do not match expected panels/text/colors.

- [ ] **Step 5: Commit**

```bash
git add src/test/translation-image-highlights.test.ts src/lib/translation-image-highlights.ts
git commit -m "test: lock translation highlight pairing behavior"
```

### Task 2: Lock Final SVG Output With Tests

**Files:**
- Create: `src/test/translation-image-svg.test.ts`
- Test: `src/test/translation-image-svg.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import { buildTranslationImageSvgDataUrl } from "@/lib/translation-image-svg";

describe("buildTranslationImageSvgDataUrl", () => {
  it("renders highlighted english and chinese spans and keeps the bottom scene image", () => {
    const dataUrl = buildTranslationImageSvgDataUrl({
      bookName: "Robinson Crusoe",
      author: "Daniel Defoe",
      originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
      prompt1: "After all, Xury's advice was good,",
      prompt2: "毕竟，休里的建议很好，",
      prompt3: "and we dropped our little anchor.",
      prompt4: "我们抛下了小锚。",
      vocabulary: [
        {
          id: "vocab-advice",
          word: "advice",
          phonetic: "",
          partOfSpeech: "n.",
          meaning: "建议",
          example: "",
          translation: "",
        },
      ],
      sceneImageDataUrl: "data:image/png;base64,scene",
    });

    const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

    expect(svg).toContain("advice");
    expect(svg).toContain("建议");
    expect(svg).toContain("data:image/png;base64,scene");
    expect(svg).toContain("translation-highlight");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/translation-image-svg.test.ts`
Expected: FAIL with module-not-found or missing export errors for `translation-image-svg`.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildTranslationImageSvgDataUrl() {
  return "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C/svg%3E";
}
```

- [ ] **Step 4: Run test to verify it still fails for the right reason**

Run: `npm test -- src/test/translation-image-svg.test.ts`
Expected: FAIL because the SVG does not include highlight markup or scene image data.

- [ ] **Step 5: Commit**

```bash
git add src/test/translation-image-svg.test.ts src/lib/translation-image-svg.ts
git commit -m "test: lock translation svg rendering behavior"
```

### Task 3: Implement Highlight Matching Helper

**Files:**
- Create: `src/lib/translation-image-highlights.ts`
- Test: `src/test/translation-image-highlights.test.ts`

- [ ] **Step 1: Implement color assignment and english/chinese panel matching**

```ts
const HIGHLIGHT_COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777"];

export interface TranslationHighlightMatch {
  panel: "prompt1" | "prompt2" | "prompt3" | "prompt4";
  text: string;
  start: number;
  end: number;
  color: string;
}
```

- [ ] **Step 2: Implement candidate extraction from `meaning` and chinese fallback matching**

```ts
function extractMeaningCandidates(meaning: string) {
  return meaning
    .split(/[；;、,/|]/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 1);
}
```

- [ ] **Step 3: Return stable highlight descriptors for renderers**

```ts
export interface TranslationHighlightSpan {
  id: string;
  color: string;
  word: string;
  english: TranslationHighlightMatch;
  chinese?: TranslationHighlightMatch;
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- src/test/translation-image-highlights.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/translation-image-highlights.ts src/test/translation-image-highlights.test.ts
git commit -m "feat: derive translation highlight spans"
```

### Task 4: Implement Shared SVG Renderer

**Files:**
- Create: `src/lib/translation-image-svg.ts`
- Modify: `src/lib/task-store.ts`
- Test: `src/test/translation-image-svg.test.ts`

- [ ] **Step 1: Build a shared renderer that outputs the final translation card SVG data URL**

```ts
export function buildTranslationImageSvgDataUrl(input: TranslationImageSvgInput) {
  // assemble header, four deterministic text panels, and clipped bottom scene image
}
```

- [ ] **Step 2: Reuse the shared renderer in `task-store.ts` for local fallback translation images**

Run: update the `translation` branch inside `createSvgImage()`.
Expected: translation fallback no longer uses generic plain text rows.

- [ ] **Step 3: Run focused tests**

Run: `npm test -- src/test/translation-image-svg.test.ts src/test/task-store.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/translation-image-svg.ts src/lib/task-store.ts src/test/translation-image-svg.test.ts src/test/task-store.test.ts
git commit -m "feat: render translation cards with deterministic highlighted panels"
```

### Task 5: Switch `page11-image-agent` To Hybrid Output

**Files:**
- Modify: `server/agents/page11-image-agent.ts`
- Modify: `server/image-generation-service.ts`
- Modify: `src/test/image-generation-agent-skill.test.ts`
- Modify: `src/test/image-generation-service.test.ts`

- [ ] **Step 1: Extend the translation agent input so it receives `vocabulary`**

```ts
export interface Page11ImageAgentInput {
  bookName: string;
  originSentence: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
  vocabulary: TextAnalysisVocabularyCard[];
  referenceImage?: string;
}
```

- [ ] **Step 2: Keep the existing image-skill call, then wrap its result with `buildTranslationImageSvgDataUrl()`**

```ts
const generationResult = await generateImageWithSkill(finalPrompt, input.referenceImage);

return {
  success: true,
  imageDataUrl: buildTranslationImageSvgDataUrl({
    ...input,
    author: "",
    sceneImageDataUrl: generationResult.imageDataUrl,
  }),
  metadata: { ... }
};
```

- [ ] **Step 3: Update tests so they assert hybrid behavior**

Run: `npm test -- src/test/image-generation-agent-skill.test.ts src/test/image-generation-service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add server/agents/page11-image-agent.ts server/image-generation-service.ts src/test/image-generation-agent-skill.test.ts src/test/image-generation-service.test.ts
git commit -m "feat: compose translation cards from model scene and deterministic panels"
```

### Task 6: Full Verification

**Files:**
- Modify: none
- Test: `src/test/translation-image-highlights.test.ts`
- Test: `src/test/translation-image-svg.test.ts`
- Test: `src/test/image-generation-agent-skill.test.ts`
- Test: `src/test/image-generation-service.test.ts`
- Test: `src/test/task-store.test.ts`

- [ ] **Step 1: Run the full targeted verification suite**

Run: `npm test -- src/test/translation-image-highlights.test.ts src/test/translation-image-svg.test.ts src/test/image-generation-agent-skill.test.ts src/test/image-generation-service.test.ts src/test/task-store.test.ts`
Expected: PASS

- [ ] **Step 2: Run the broader project checks most likely affected by these changes**

Run: `npm test -- src/test/translation-image-prompt.test.ts`
Expected: PASS

- [ ] **Step 3: Run lint if the focused tests are green**

Run: `npm run lint`
Expected: exit 0

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add bilingual translation highlights"
```
