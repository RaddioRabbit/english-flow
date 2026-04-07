---
name: translation-image-highlights
description: >
  为句译对照图（translation模块）生成中英文词汇标注对齐数据。
  当任务涉及"句译对照图标注""中英文单词下划线对应""翻译图片词汇高亮""英文单词对应中文翻译标注"时，必须使用本skill。

  用户可能会说："生成句译对照图标注""对齐中英文词汇""给翻译图片加下划线标注"
  "英文单词对应中文翻译""词汇标注颜色对应"等。
  只要涉及在句译对照图中标注英文单词及其对应中文翻译的需求，都应触发此skill。
---

# Translation Image Highlights Skill

## 任务目标

根据以下输入内容，智能对齐中英文词汇位置，生成精确的标注数据：

- 英文原句（分为 prompt1 和 prompt3 两部分）
- 中文翻译（分为 prompt2 和 prompt4 两部分）
- 词汇列表（包含单词和中文释义）

输出每个词汇在英文原文和中文翻译中的精确标注位置（start/end）和颜色。

## 输入说明

输入是一个 JSON 对象：

```json
{
  "prompt1": "英文原句前半部分",
  "prompt2": "中文翻译前半部分",
  "prompt3": "英文原句后半部分",
  "prompt4": "中文翻译后半部分",
  "vocabulary": [
    {
      "word": "tempted",
      "meaning": "诱惑"
    },
    {
      "word": "gingham",
      "meaning": "方格棉布"
    }
  ]
}
```

## 输出总规则

### 1. 只输出 JSON
- 只返回一个合法 JSON 对象
- 不要输出 markdown code fence
- 不要输出解释说明
- 不要输出注释

### 2. 输出格式

```json
{
  "highlights": [
    {
      "id": "vocab-1",
      "word": "tempted",
      "color": "#2563eb",
      "english": {
        "panel": "prompt1",
        "text": "tempted",
        "start": 26,
        "end": 33
      },
      "chinese": {
        "panel": "prompt2",
        "text": "诱惑",
        "start": 18,
        "end": 20
      }
    }
  ]
}
```

### 3. 标注规则

**英文标注规则：**
- 精确匹配单词（使用单词边界）
- `panel` 只能是 "prompt1" 或 "prompt3"
- `start` 和 `end` 是基于 0 的字符索引
- 如果单词出现在 prompt1 和 prompt3 中，优先标注 prompt1

**中文标注规则：**
- 根据 `meaning` 找到中文翻译中的对应位置
- `panel` 根据英文对应：prompt1 → prompt2, prompt3 → prompt4
- 优先匹配当前句译里与该词含义最贴切的中文表达，不要求必须出现 meaning 原词
- 如果 meaning 是"诱惑"，中文是"受不住诱惑"，只标注"诱惑"两个字
- 如果 meaning 是"便宜"，中文是"廉价柜台"，优先标注"廉价"，不要因为没有出现"便宜"就放弃标注
- 如果 meaning 是"小锚"，中文是"小锚"，标注"小锚"
- 避免多标（如"不住诱惑"）或少标

**颜色分配：**
- 使用预设颜色循环：["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#db2777"]
- 每个词汇分配一个颜色，中英文标注使用相同颜色

### 4. 对齐原则

**核心词优先原则：**
- 当 meaning 包含上下文包装（如"受不住诱惑"），而实际文本包含"诱惑"时，优先标注核心词"诱惑"
- 当 meaning 和句中译法是近义表达（如"便宜" vs "廉价"）时，优先标注句中最小且准确的语义对应
- 当 meaning 包含修饰词（如"小锚"），而实际文本是"小锚"时，标注完整"小锚"

**匹配优先级：**
1. 精确完整匹配（meaning 完整出现在文本中）
2. 核心词匹配（从 meaning 中提取最短核心词匹配）
3. 模糊匹配（字符重叠度 > 50%）

**避免重叠：**
- 同一个位置的文本不能被多个词汇标注
- 如果两个词汇的标注范围重叠，优先标注先出现的词汇

## 示例

### 输入示例

```json
{
  "prompt1": "One was of snuffy colored gingham which Marilla had been tempted to buy from a peddler",
  "prompt2": "一件是带鼻烟色条纹的方格棉布，玛丽拉去年夏天曾受不住诱惑从一个货郎那儿买来",
  "prompt3": "",
  "prompt4": "",
  "vocabulary": [
    {
      "word": "gingham",
      "meaning": "方格棉布"
    },
    {
      "word": "tempted",
      "meaning": "诱惑"
    },
    {
      "word": "peddler",
      "meaning": "货郎"
    }
  ]
}
```

### 输出示例

```json
{
  "highlights": [
    {
      "id": "vocab-1",
      "word": "gingham",
      "color": "#2563eb",
      "english": {
        "panel": "prompt1",
        "text": "gingham",
        "start": 26,
        "end": 33
      },
      "chinese": {
        "panel": "prompt2",
        "text": "方格棉布",
        "start": 10,
        "end": 14
      }
    },
    {
      "id": "vocab-2",
      "word": "tempted",
      "color": "#dc2626",
      "english": {
        "panel": "prompt1",
        "text": "tempted",
        "start": 57,
        "end": 64
      },
      "chinese": {
        "panel": "prompt2",
        "text": "诱惑",
        "start": 26,
        "end": 28
      }
    },
    {
      "id": "vocab-3",
      "word": "peddler",
      "color": "#059669",
      "english": {
        "panel": "prompt1",
        "text": "peddler",
        "start": 79,
        "end": 86
      },
      "chinese": {
        "panel": "prompt2",
        "text": "货郎",
        "start": 31,
        "end": 33
      }
    }
  ]
}
```

**注意：** tempted 对应的中文标注是"诱惑"（start:26, end:28），而不是"受不住诱惑"（start:23, end:28）。

## 复杂场景处理

### 场景1：词汇在多个面板中出现

如果词汇在 prompt1 和 prompt3 中都出现，优先标注 prompt1。

### 场景2：中文翻译有多种表达

如果 meaning 是"锚；小锚"，文本是"我们抛下小锚"：
- 优先标注"小锚"（更具体）
- 而不是只标注"锚"

### 场景3：上下文包装

如果 meaning 是"受不住诱惑"，文本是"玛丽拉曾受不住诱惑"：
- 优先标注"诱惑"（核心词）
- 而不是"受不住诱惑"

### 场景4：模糊匹配

如果 meaning 是"靠近陆地"，文本是"船离陆地更近"：
- 标注"陆地更近"或"离陆地"（字符重叠度最高）

### 场景5：句中自然译法

如果 meaning 是"便宜"，文本是"她在廉价柜台淘来的"：
- 优先标注"廉价"
- 不要因为文本里没有"便宜"两个字就不标
- 也不要无必要地扩展成"廉价柜台"，除非更短片段不足以表达该词在当前句中的含义

## 硬性约束

1. **只输出 JSON**，不要任何其他内容
2. **start/end 必须是数字**，表示字符索引
3. **panel 必须是** "prompt1", "prompt2", "prompt3", "prompt4" 之一
4. **color 必须使用预设颜色**
5. **避免标注重叠**，每个字符位置只能属于一个标注
6. **核心词优先**，避免上下文包装的多标问题
7. **语义对齐优先**，允许用句中自然近义译法替代 meaning 字面

## 最终检查

输出前务必确认：

1. 是合法 JSON
2. 顶层只有 `highlights` 数组
3. 每个 highlight 都有 `id`, `word`, `color`, `english`, `chinese`
4. `english.panel` 是 prompt1 或 prompt3
5. `chinese.panel` 是 prompt2 或 prompt4
6. 中英文颜色一致
7. 没有标注重叠
8. 中文标注精确，没有多标或少标
