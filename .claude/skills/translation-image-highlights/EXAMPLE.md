# Translation Image Highlights Skill - 使用示例

## LLM 调用示例

### 示例 1：基本调用

```typescript
// 在 Claude Code 中使用 skill
const result = await skill("translation-image-highlights", {
  prompt1: "One was of snuffy colored gingham which Marilla had been tempted to buy from a peddler",
  prompt2: "一件是带鼻烟色条纹的方格棉布，玛丽拉去年夏天曾受不住诱惑从一个货郎那儿买来",
  prompt3: "",
  prompt4: "",
  vocabulary: [
    { word: "gingham", meaning: "方格棉布" },
    { word: "tempted", meaning: "诱惑" },
    { word: "peddler", meaning: "货郎" }
  ]
});

// 预期输出
{
  "highlights": [
    {
      "id": "vocab-1",
      "word": "gingham",
      "color": "#2563eb",
      "english": { "panel": "prompt1", "text": "gingham", "start": 26, "end": 33 },
      "chinese": { "panel": "prompt2", "text": "方格棉布", "start": 10, "end": 14 }
    },
    {
      "id": "vocab-2",
      "word": "tempted",
      "color": "#dc2626",
      "english": { "panel": "prompt1", "text": "tempted", "start": 57, "end": 64 },
      "chinese": { "panel": "prompt2", "text": "诱惑", "start": 26, "end": 28 }
    },
    {
      "id": "vocab-3",
      "word": "peddler",
      "color": "#059669",
      "english": { "panel": "prompt1", "text": "peddler", "start": 79, "end": 86 },
      "chinese": { "panel": "prompt2", "text": "货郎", "start": 31, "end": 33 }
    }
  ]
}
```

**关键点**：`tempted` 对应的中文标注是 `"诱惑"`（位置 26-28），而不是 `"受不住诱惑"`（位置 23-28）。

---

### 示例 2：处理上下文包装

当 meaning 包含上下文包装时，skill 会智能提取核心词：

```typescript
const result = await skill("translation-image-highlights", {
  prompt1: "Marilla had been tempted to buy",
  prompt2: "玛丽拉曾受不住诱惑去买",
  prompt3: "",
  prompt4: "",
  vocabulary: [
    { word: "tempted", meaning: "受不住诱惑" }  // 注意：meaning 包含上下文
  ]
});

// 输出 - 智能提取核心词 "诱惑"
{
  "highlights": [{
    "word": "tempted",
    "english": { "panel": "prompt1", "text": "tempted", "start": 18, "end": 25 },
    "chinese": { "panel": "prompt2", "text": "诱惑", "start": 5, "end": 7 }  // 不是 "受不住诱惑"
  }]
}
```

---

### 示例 3：多面板场景

```typescript
const result = await skill("translation-image-highlights", {
  prompt1: "After all, Xury's advice was good, and I took it;",
  prompt2: "毕竟，休里的建议很好，我采纳了；",
  prompt3: "we dropped our little anchor, and lay still all night.",
  prompt4: "我们抛下小锚，整夜静静停泊。",
  vocabulary: [
    { word: "advice", meaning: "建议" },
    { word: "anchor", meaning: "锚；小锚" }
  ]
});

// 输出 - anchor 匹配 "小锚"（更具体），而不是 "锚"
{
  "highlights": [
    {
      "word": "advice",
      "english": { "panel": "prompt1", "text": "advice", "start": 23, "end": 29 },
      "chinese": { "panel": "prompt2", "text": "建议", "start": 8, "end": 10 }
    },
    {
      "word": "anchor",
      "english": { "panel": "prompt3", "text": "anchor", "start": 24, "end": 30 },
      "chinese": { "panel": "prompt4", "text": "小锚", "start": 3, "end": 5 }  // 优先 "小锚"
    }
  ]
}
```

---

## 集成到现有代码

### 在 page11-image-agent.ts 中使用

```typescript
import { callTranslationHighlightsSkill, convertVocabularyToSkillInput } from "../translation-image-highlights-skill-shim";

// 生成句译对照图时调用
async function generatePage11Image(input) {
  // 1. 生成背景图片
  const sceneImage = await generateSceneImage(input.originSentence);
  
  // 2. 调用 skill 生成标注数据
  const highlightsResult = await callTranslationHighlightsSkill({
    prompt1: input.prompt1,
    prompt2: input.prompt2,
    prompt3: input.prompt3,
    prompt4: input.prompt4,
    vocabulary: convertVocabularyToSkillInput(input.vocabulary)
  });
  
  // 3. 使用标注数据生成 SVG
  const svgDataUrl = highlightsResult.highlights.length > 0
    ? buildTranslationImageSvgDataUrlWithHighlights({
        ...input,
        highlights: highlightsResult.highlights,
        sceneImageDataUrl: sceneImage
      })
    : buildTranslationImageSvgDataUrl({ ...input, sceneImageDataUrl: sceneImage });
    
  return { success: true, imageDataUrl: svgDataUrl };
}
```

---

## 核心优势

1. **智能对齐**：LLM 理解语义，能准确匹配中英文对应关系
2. **核心词优先**：自动识别并提取核心词，避免上下文包装问题
3. **精确坐标**：生成字符级别的精确标注位置
4. **颜色对应**：中英文标注使用相同颜色，视觉对应清晰
5. **降级机制**：skill 失败时自动回退到本地实现
