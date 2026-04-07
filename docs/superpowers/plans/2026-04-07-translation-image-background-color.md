# Translation Image Background Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将“句译对照图”的整图最外层背景色从 `#1e1f2e` 改为 `#fbf2d5`，并用测试锁定该行为。

**Architecture:** 复用现有的 `buildTranslationImageSvgDataUrl` SVG 组装逻辑，不新增配置层。通过在单元测试中断言最终 SVG 字符串包含新的背景色，再将背景色常量替换为目标值，实现最小范围修复。

**Tech Stack:** TypeScript, Vitest, SVG data URL rendering

---

### Task 1: Lock And Change Translation Image Background Color

**Files:**
- Modify: `src/test/translation-image-svg.test.ts`
- Modify: `src/lib/translation-image-svg.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("uses the updated parchment background color for the full image", () => {
  const dataUrl = buildTranslationImageSvgDataUrl({
    bookName: "Robinson Crusoe",
    author: "Daniel Defoe",
    originSentence: "After all, Xury's advice was good, and we dropped our little anchor.",
    prompt1: "After all, Xury's advice was good,",
    prompt2: "毕竟，休里的建议很好，",
    prompt3: "and we dropped our little anchor.",
    prompt4: "我们抛下了小锚。",
    vocabulary: [],
    sceneImageDataUrl: undefined,
  });

  const svg = decodeURIComponent(dataUrl.replace("data:image/svg+xml;charset=utf-8,", ""));

  expect(svg).toContain('fill="#fbf2d5"');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/test/translation-image-svg.test.ts`
Expected: FAIL because the generated SVG still contains `#1e1f2e`.

- [ ] **Step 3: Write minimal implementation**

```ts
const C_BG = "#fbf2d5";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/test/translation-image-svg.test.ts`
Expected: PASS with all tests green in `src/test/translation-image-svg.test.ts`.
