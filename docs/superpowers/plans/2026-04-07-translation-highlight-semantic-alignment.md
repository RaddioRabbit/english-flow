# Translation Highlight Semantic Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make translation-image-highlights use sentence-level semantic alignment so `bargain / 便宜` can highlight `廉价` in the Chinese panel.

**Architecture:** Update both the skill instructions and the local highlight helper. The skill path becomes explicit about selecting the smallest semantically accurate Chinese span, while the local helper gains lightweight semantic candidate expansion for common translation equivalents. Tests lock the behavior at helper level and runtime integration level.

**Tech Stack:** TypeScript, Vitest, local runtime skill shim, Markdown skill prompt

---

### Task 1: Lock Semantic Highlight Expectations With Tests

**Files:**
- Modify: `src/test/translation-image-highlights.test.ts`
- Modify: `src/test/image-generation-agent-skill.test.ts`
- Modify: `src/test/translation-image-highlights-skill-shim.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("matches 廉价 when bargain means 便宜 inside 廉价柜台", () => {
  const highlights = buildTranslationHighlights({
    prompt1: "",
    prompt2: "",
    prompt3: "she had picked up at a bargain counter in the winter",
    prompt4: "是冬天她在廉价柜台淘来的",
    vocabulary: [
      {
        id: "vocab-bargain",
        word: "bargain",
        phonetic: "",
        partOfSpeech: "n.",
        meaning: "便宜",
        example: "",
        translation: "",
      },
    ],
  });

  expect(highlights[0].chinese?.text).toBe("廉价");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/test/translation-image-highlights.test.ts src/test/image-generation-agent-skill.test.ts src/test/translation-image-highlights-skill-shim.test.ts`
Expected: FAIL because current behavior does not yet guarantee semantic alias selection of `廉价`.

- [ ] **Step 3: Update runtime-facing tests**

```ts
expect(underlinedTexts.join("")).toContain("廉价");
expect(result.highlights[0].chinese?.text).toBe("廉价");
```

- [ ] **Step 4: Re-run the targeted tests**

Run: `npm test -- src/test/translation-image-highlights.test.ts src/test/image-generation-agent-skill.test.ts src/test/translation-image-highlights-skill-shim.test.ts`
Expected: FAIL only on the new semantic assertions.

### Task 2: Upgrade Skill Instructions To Semantic Alignment

**Files:**
- Modify: `.claude/skills/translation-image-highlights/SKILL.md`
- Modify: `server/translation-image-highlights-skill-shim.ts`

- [ ] **Step 1: Update SKILL.md rules**

```md
- 中文标注以当前句译中的自然表达为准，不要求必须出现 meaning 原词
- 若 meaning 是“便宜”，句中译法是“廉价柜台”，优先标“廉价”
- 优先选择最小且准确的语义单位，避免无必要地扩展到整段短语
```

- [ ] **Step 2: Mirror the same rule in the shim fallback prompt**

```ts
4. 中文优先选择当前句译里最小且准确的语义对应，不要求与 meaning 字面完全相同
```

- [ ] **Step 3: Run the runtime-skill-only test**

Run: `npm test -- src/test/translation-image-highlights-skill-shim.test.ts`
Expected: PASS or continue failing only on local helper behavior.

### Task 3: Add Semantic Candidate Expansion To Local Fallback

**Files:**
- Modify: `src/lib/translation-image-highlights.ts`
- Test: `src/test/translation-image-highlights.test.ts`

- [ ] **Step 1: Write minimal semantic alias support**

```ts
const SEMANTIC_CHINESE_ALIASES: Record<string, string[]> = {
  "便宜": ["廉价", "低价", "实惠"],
};
```

- [ ] **Step 2: Extend candidate extraction**

```ts
function expandSemanticMeaningVariants(candidate: string) {
  return [candidate, ...(SEMANTIC_CHINESE_ALIASES[candidate] ?? [])];
}
```

- [ ] **Step 3: Use the expanded candidates in chinese matching**

```ts
const unique = Array.from(
  new Set(
    [cleaned, ...rawCandidates].flatMap((candidate) => [
      ...extractWrappedMeaningVariants(candidate),
      ...expandSemanticMeaningVariants(candidate),
    ]),
  ),
);
```

- [ ] **Step 4: Run helper tests**

Run: `npm test -- src/test/translation-image-highlights.test.ts`
Expected: PASS including `bargain -> 廉价`.

### Task 4: Verify End-to-End Translation Highlight Behavior

**Files:**
- Test: `src/test/translation-image-highlights.test.ts`
- Test: `src/test/translation-image-svg.test.ts`
- Test: `src/test/image-generation-agent-skill.test.ts`
- Test: `src/test/translation-image-highlights-skill-shim.test.ts`
- Test: `src/test/image-generation-service.test.ts`

- [ ] **Step 1: Run the targeted verification suite**

Run: `npm test -- src/test/translation-image-highlights.test.ts src/test/translation-image-svg.test.ts src/test/image-generation-agent-skill.test.ts src/test/translation-image-highlights-skill-shim.test.ts src/test/image-generation-service.test.ts`
Expected: PASS

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/translation-image-highlights/SKILL.md server/translation-image-highlights-skill-shim.ts src/lib/translation-image-highlights.ts src/test/translation-image-highlights.test.ts src/test/image-generation-agent-skill.test.ts src/test/translation-image-highlights-skill-shim.test.ts docs/superpowers/specs/2026-04-07-translation-highlight-semantic-alignment-design.md docs/superpowers/plans/2026-04-07-translation-highlight-semantic-alignment.md
git commit -m "fix: align translation highlights with sentence semantics"
```
