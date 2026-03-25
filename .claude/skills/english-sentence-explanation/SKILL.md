---
name: english-sentence-explanation
description: >
  根据英语原句、文本解析结果和对应的讲解图片，生成可直接用于文章展示、TTS 和视频字幕的句子讲解 JSON。
  当任务涉及“生成句子讲解文章”“根据图片讲解英语原句”“生成后续视频讲解文案”时，必须使用本 skill。
---

# English Sentence Explanation Skill

## 任务目标
根据以下输入内容生成一篇完整的句子讲解文章：

- 用户输入的英语原句
- 书名和作者
- 文本解析结果 `textContent`
- 与各模块一一对应的讲解图片
- 模块顺序 `orderedModules`

文章必须直接服务于后续：

- 页面展示
- 逐行 TTS
- 字幕分段
- 视频生成

所以输出必须是稳定 JSON，并且每一行讲解都要拆成数组。

## 输入说明
输入是一个 JSON 对象，核心字段如下：

```json
{
  "originalSentence": "英语原句",
  "bookName": "书名",
  "author": "作者",
  "textContent": {
    "translation": "中文翻译",
    "prompt1": "英文片段一",
    "prompt2": "对应中文提示一",
    "prompt3": "英文片段二",
    "prompt4": "对应中文提示二",
    "grammar": {
      "tense": "时态分析",
      "voice": "语态分析",
      "structure": "句式结构分析"
    },
    "vocabulary": [
      {
        "word": "单词",
        "phonetic": "音标",
        "partOfSpeech": "词性",
        "meaning": "词义",
        "example": "英文例句",
        "translation": "例句翻译"
      }
    ],
    "ielts": {
      "listening": "听力建议",
      "speaking": "口语建议",
      "reading": "阅读建议",
      "writing": "写作建议"
    }
  },
  "images": {
    "translation": "句译对照图",
    "grammar": "句式分析图",
    "summary": "句式总结图",
    "vocabulary": "词汇解析图",
    "ielts": "雅思备考图"
  },
  "orderedModules": [
    "translation",
    "grammar",
    "summary",
    "vocabulary",
    "ielts"
  ],
  "regenerationTarget": null,
  "currentArticle": null
}
```

## 输出总规则

### 1. 只输出 JSON
- 只返回一个合法 JSON 对象
- 不要输出 markdown code fence
- 不要输出解释说明
- 不要输出注释
- 不要输出额外顶层字段

### 2. 所有讲解内容都要数组化
- `introductionLines` 必须存在
- `sections[].lines` 必须存在
- `conclusionLines` 必须存在
- 每个数组元素表示一条展示行，同时也是一条 TTS 片段和一条字幕片段
- 不能只写长段落而不拆行

### 3. 文章必须和图片逐一对应
- 每个 section 都要围绕对应图片来讲
- 每个 section 都要回扣英语原句本身
- 模块顺序必须严格遵循 `orderedModules`
- 每个模块只出现一次

### 4. 自然中文讲解
- 中文表达自然、口语化、适合老师对着图片讲解
- 可以保留英语原句和必要标点
- 不能写成提纲式关键词堆砌
- 不能省略核心教学信息

## 完整文章输出格式
当 `regenerationTarget` 为 `null` 时，必须输出完整文章，格式如下：

```json
{
  "article": {
    "title": "文章标题",
    "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
    "introduction": "开场完整文本",
    "introductionLines": [
      "开场第一行",
      "开场第二行"
    ],
    "sections": [
      {
        "moduleId": "translation",
        "moduleName": "句译对照",
        "imageRef": "translation",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行",
          "该模块第二行"
        ]
      },
      {
        "moduleId": "grammar",
        "moduleName": "句式分析",
        "imageRef": "grammar",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行",
          "该模块第二行"
        ]
      },
      {
        "moduleId": "summary",
        "moduleName": "句式总结",
        "imageRef": "summary",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行",
          "该模块第二行"
        ]
      },
      {
        "moduleId": "vocabulary",
        "moduleName": "词汇解析",
        "imageRef": "vocabulary",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行",
          "该模块第二行"
        ]
      },
      {
        "moduleId": "ielts",
        "moduleName": "雅思备考",
        "imageRef": "ielts",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行",
          "该模块第二行"
        ]
      }
    ],
    "conclusion": "结尾完整文本",
    "conclusionLines": [
      "结尾第一行",
      "结尾第二行"
    ],
    "totalWordCount": 900,
    "totalLineCount": 18
  }
}
```

## 局部重生成规则

### 1. 重生成开场
当 `regenerationTarget.type = "introduction"` 时，只能输出：

```json
{
  "article": {
    "welcomeMessage": "欢迎语",
    "introduction": "开场完整文本",
    "introductionLines": [
      "开场第一行",
      "开场第二行"
    ]
  }
}
```

不要输出 `title`、`sections`、`conclusion`、`totalWordCount`、`totalLineCount`。

### 2. 重生成单个模块
当 `regenerationTarget.type = "section"` 时，只能输出：

```json
{
  "article": {
    "sections": [
      {
        "moduleId": "translation",
        "moduleName": "句译对照",
        "imageRef": "translation",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行",
          "该模块第二行"
        ]
      }
    ]
  }
}
```

`sections` 数组里只能有一个 section，并且必须对应目标模块。

### 3. 重生成结尾
当 `regenerationTarget.type = "conclusion"` 时，只能输出：

```json
{
  "article": {
    "conclusion": "结尾完整文本",
    "conclusionLines": [
      "结尾第一行",
      "结尾第二行"
    ]
  }
}
```

不要输出 `title`、`welcomeMessage`、`introduction`、`sections`、`totalWordCount`、`totalLineCount`。

## 内容要求

### 开场
- 要自然引入本句讲解
- 要说明接下来会跟着图片顺序讲
- 完整文章模式下必须包含 `welcomeMessage`

### 句译对照模块
- 要结合句译对照图讲
- 要点出原句和中文翻译
- 要说明图里如何帮助理解整句

### 句式分析模块
- 要结合句式分析图讲
- 必须讲清时态、语态、结构重点
- 要把句式分析和原句对应起来

### 句式总结模块
- 要结合句式总结图讲
- 要提炼句型模板或核心主干
- 要说明这种句式如何迁移使用

### 词汇解析模块
- 要结合词汇图讲
- 要覆盖图里出现的核心词汇
- 要说明词义和语境作用
- 必须覆盖 `textContent.vocabulary` 里的每一个词，不能只挑一部分
- 对每个词都要明确讲出单词、词性、词义、英文例句、例句中文翻译
- 不要解释音标，不要写“音标是”“发音是”“读作”“念作”这类表达，后续 TTS 会直接把单词念出来

### 雅思备考模块
- 要结合雅思备考图讲
- 要覆盖听力、口语、阅读、写作四个方向
- 要与当前原句直接关联

### 结尾
- 要自然收束
- 要帮助用户把整句意思、结构和用法串起来

## 硬性约束
- 完整文章模式下，`welcomeMessage`、`introductionLines`、`sections`、`conclusionLines` 都不能缺
- `sections` 必须覆盖 `orderedModules` 中的全部模块
- 每个 section 必须包含 `moduleId`、`moduleName`、`imageRef`、`content`、`lines`
- 不要输出 `fullScript`
- 不要输出旧版格式
- 不要把多个模块合并进同一个 section
- 不要遗漏图片讲解视角
- 词汇解析 section 里不能遗漏词义、例句或例句中文翻译
- 词汇解析 section 里不要写音标说明或发音说明

## 最终检查
输出前务必确认：

1. 是合法 JSON
2. 顶层只有 `article`
3. 行数组字段齐全
4. section 数量和 `orderedModules` 一致
5. 每个 section 都和对应图片匹配
6. 输出格式可直接被当前解析器消费
