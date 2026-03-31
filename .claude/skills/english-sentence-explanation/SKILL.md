---
name: english-sentence-explanation
description: >
  根据英语原句、文本解析结果和对应的讲解图片，生成可直接用于文章展示、TTS和视频字幕的句子讲解JSON。
  当任务涉及"生成句子讲解文章""根据图片讲解英语原句""生成后续视频讲解文案""创建口播逐字稿"时，必须使用本skill。

  用户可能会说："生成讲解文章""写句子讲解""根据解析生成文章""结合图片讲解这个句子"、
  "生成口播稿""写逐字稿""生成朗读稿""生成带字幕的讲解"等。
  只要涉及将英语句子的文本解析和图片转化为讲解文章的需求，都应触发此skill。
---

# English Sentence Explanation Skill

## 任务目标

根据以下输入内容生成一篇**口播逐字稿风格**的完整句子讲解文章：

- 用户输入的英语原句
- 书名和作者
- 文本解析结果 `textContent`
- 与各模块一一对应的讲解图片
- 模块顺序 `orderedModules`

文章必须直接服务于后续：

- **页面展示** - 每行独立显示，视觉清晰
- **逐行 TTS** - 每行是一个独立语音片段
- **字幕分段** - 每行是一条字幕
- **视频生成** - 每行对应视频中的一段时间

所以输出必须是稳定 JSON，并且**每一行讲解都要拆成数组，每行不超过50字**。

## 输入说明

输入是一个 JSON 对象，核心字段如下：

```json
{
  "originalSentence": "英语原句",
  "bookName": "书名",
  "author": "作者",
  "textContent": {
    "translation": "中文翻译",
    "prompt1": "情境提示1",
    "prompt2": "情境提示2",
    "prompt3": "情境提示3",
    "prompt4": "情境提示4",
    "grammar": {
      "tense": "时态",
      "voice": "语态",
      "structure": "句子结构"
    },
    "vocabulary": [
      {
        "word": "单词",
        "phonetic": "音标",
        "partOfSpeech": "词性",
        "meaning": "释义",
        "example": "例句",
        "translation": "例句翻译"
      }
    ],
    "ielts": {
      "listening": "听力提示",
      "speaking": "口语提示",
      "reading": "阅读提示",
      "writing": "写作提示"
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

### 2. 所有讲解内容都要数组化（极其重要）
- `introductionLines` 必须存在，是一个字符串数组
- `sections[].lines` 必须存在，每个section的lines是字符串数组
- `conclusionLines` 必须存在，是一个字符串数组
- **每行不超过50个字符**（包括标点符号和空格）
- **换行位置**：优先在标点符号后（。，！？；）换行，或在语气停顿处换行
- 每个数组元素表示一条展示行，同时也是一条 TTS 片段和一条字幕片段
- **不能把长段落直接放进数组，必须按上述规则拆分**

### 3. 文章必须和图片逐一对应
- 每个 section 都要围绕对应图片来讲
- 每个 section 都要回扣英语原句本身
- 模块顺序必须严格遵循 `orderedModules`
- 每个模块只出现一次

### 4. 口播逐字稿风格
- **口语化表达**：使用日常说话的方式，避免书面语
- **适合朗读**：读出来要顺口，有自然的停顿和语气
- **生动活泼**：像年轻老师在镜头前讲解，有亲和力
- **互动感强**：使用"大家好"、"我们看"、"注意看这里"等表达
- **无任何符号限制**：为TTS友好，不使用引号、括号、斜杠等特殊符号

## 完整文章输出格式

当 `regenerationTarget` 为 `null` 时，必须输出完整文章，格式如下：

```json
{
  "article": {
    "title": "文章标题",
    "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
    "introduction": "开场完整文本",
    "introductionLines": [
      "开场第一行，不超过50字",
      "开场第二行，不超过50字"
    ],
    "sections": [
      {
        "moduleId": "translation",
        "moduleName": "句译对照",
        "imageRef": "translation",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行，不超过50字",
          "该模块第二行，不超过50字"
        ]
      },
      {
        "moduleId": "grammar",
        "moduleName": "句式分析",
        "imageRef": "grammar",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行，不超过50字",
          "该模块第二行，不超过50字"
        ]
      },
      {
        "moduleId": "summary",
        "moduleName": "句式总结",
        "imageRef": "summary",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行，不超过50字",
          "该模块第二行，不超过50字"
        ]
      },
      {
        "moduleId": "vocabulary",
        "moduleName": "词汇解析",
        "imageRef": "vocabulary",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行，不超过50字",
          "该模块第二行，不超过50字"
        ]
      },
      {
        "moduleId": "ielts",
        "moduleName": "雅思备考",
        "imageRef": "ielts",
        "content": "该模块完整文本",
        "lines": [
          "该模块第一行，不超过50字",
          "该模块第二行，不超过50字"
        ]
      }
    ],
    "conclusion": "结尾完整文本",
    "conclusionLines": [
      "结尾第一行，不超过50字",
      "结尾第二行，不超过50字"
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
      "开场第一行，不超过50字",
      "开场第二行，不超过50字"
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
          "该模块第一行，不超过50字",
          "该模块第二行，不超过50字"
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
      "结尾第一行，不超过50字",
      "结尾第二行，不超过50字"
    ]
  }
}
```

不要输出 `title`、`welcomeMessage`、`introduction`、`sections`、`totalWordCount`、`totalLineCount`。

## 内容要求

### 开场
- 必须用指定的欢迎语："欢迎来到英语名著句子讲解小课堂"
- 自然引入本句讲解，说明书名和作者
- 说明接下来会跟着图片顺序讲解
- 完整文章模式下必须包含 `welcomeMessage`

### 句译对照模块（约150字）
- 结合句译对照图讲解
- **必须一字不差地完整念出原句**
- 完整给出中文翻译
- 简要概括所有情境提示内容（prompt1-4）
- 说明故事背景

### 句式分析模块（约150字）
- 结合句式分析图讲解
- 必须讲清时态、语态
- 简明扼要地分析句子结构
- 把句式分析和原句对应起来

### 句式总结模块（约150字）
- 结合句式总结图讲解
- 提炼句型模板或核心主干
- 说明使用场景
- 给出一个仿写示例

### 词汇解析模块（约200字）
- 结合词汇图讲解
- **必须覆盖 textContent.vocabulary 里的每一个词，不能只挑一部分**
- 对每个词都要明确讲出：单词本身、词性、词义、英文例句、例句中文翻译
- 格式："第X个词是[单词]，它是[词性]，意思是[释义]"
- **绝对禁止**：不要解释音标，不要写"音标是""发音是""读作""念作"这类中文音译表达
- 后续 TTS 会直接把英文单词念出来，不需要额外音译

### 雅思备考模块（约150字）
- 结合雅思备考图讲解
- 覆盖听力、口语、阅读、写作四个方向
- 与当前原句直接关联
- 简明概括每科要点

### 结尾
- 自然收束，帮助用户把整句意思、结构和用法串起来
- 可以提醒用户复习重点

## 字数与行数控制

### 总字数
- 五个模块讲解内容总和控制在 **800-1000字**
- 平均每个模块约150-200字
- 如果超过1000字，必须精简，减少重复解释、简化过渡语句

### 每行字数
- **每行严格不超过50个字符**（包括标点）
- 换行位置：标点符号后 > 语气停顿处
- 一句话太长时，在语气停顿处拆分

## 符号处理规则

### 禁止出现的符号
- 引号：" ' 「」 【】
- 括号：() [] {}
- 斜杠：/
- 省略号：... …
- 破折号：—— -

### 替代方式
- 英语原句：用"这句话是""原文是"等引导，直接读出句子
- 词汇：直接说英文单词本身
- 词性：直接说"副词""名词"，不用缩写
- 列举：用"第一""第二""接下来"等连接词

## 硬性约束

1. **内容绝对不能省略**
   - 原句必须一字不差地完整念出
   - 所有词汇卡片都必须讲解，不能挑重点
   - 雅思四科提示都必须提到
   - 所有情境提示都必须讲解

2. **数组格式必须正确**
   - 每行不超过50字
   - 在标点符号后或语气停顿处换行
   - 不能输出长段落不拆分

3. **词汇解析绝对禁止中文音译**
   - 正确："第一个词是charge，它是名词"
   - 错误："第一个词是charge，发音是查之"（绝对禁止）

4. **完整文章模式下**，`welcomeMessage`、`introductionLines`、`sections`、`conclusionLines` 都不能缺

5. **不要输出** `fullScript` 字段

6. **不要把多个模块合并**进同一个 section

## 示例

### 输入示例

```json
{
  "originalSentence": "However, I said no more to the boy of what I had heard, or what I meant to do.",
  "bookName": "《双城记》",
  "author": "查尔斯·狄更斯",
  "textContent": {
    "translation": "然而，对于我所听到的以及我打算做的事情，我对那男孩只字未提。",
    "prompt1": "法国大革命前夕的伦敦",
    "prompt2": "叙述者神秘的身份背景",
    "prompt3": "悬念设置，引发读者好奇",
    "prompt4": "人物之间的信任与隐瞒",
    "grammar": {
      "tense": "一般过去时",
      "voice": "主动语态",
      "structure": "主语 + 谓语 + 宾语 + of + 宾语从句"
    },
    "vocabulary": [
      {
        "word": "however",
        "phonetic": "/haʊˈevə(r)/",
        "partOfSpeech": "adv.",
        "meaning": "然而，不过",
        "example": "However, it is too late now.",
        "translation": "然而，现在已经太晚了。"
      },
      {
        "word": "mean",
        "phonetic": "/miːn/",
        "partOfSpeech": "v.",
        "meaning": "打算，意欲",
        "example": "I didn't mean to hurt you.",
        "translation": "我不是故意伤害你的。"
      }
    ],
    "ielts": {
      "listening": "注意however的转折语气",
      "speaking": "可用mean to do表达意图",
      "reading": "识别宾语从句what I had heard",
      "writing": "用however开头制造转折"
    }
  }
}
```

### 输出示例

```json
{
  "article": {
    "title": "《双城记》悬疑句式精讲",
    "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
    "introduction": "大家好，欢迎来到英语名著句子讲解小课堂。今天我们要学习的是狄更斯名著《双城记》中的一个句子。",
    "introductionLines": [
      "大家好，欢迎来到英语名著句子讲解小课堂。",
      "今天我们要学习的是狄更斯名著《双城记》中的一个句子。",
      "这个句子充满了悬念感，非常精彩，我们一起来学习吧。"
    ],
    "sections": [
      {
        "moduleId": "translation",
        "moduleName": "句译对照",
        "imageRef": "translation",
        "content": "我们先来看这张句译对照图。原文是：However, I said no more to the boy of what I had heard, or what I meant to do。整句话的意思是：然而，对于我所听到的以及我打算做的事情，我对那男孩只字未提。",
        "lines": [
          "我们先来看这张句译对照图。",
          "大家注意看，原文是这样的：",
          "However, I said no more to the boy of what I had heard, or what I meant to do。",
          "整句话的意思是：",
          "然而，对于我所听到的以及我打算做的事情，",
          "我对那男孩只字未提。",
          "大家注意，这句话发生在法国大革命前夕的伦敦。",
          "叙述者有着神秘的身份背景，",
          "作者在这里设置了悬念，引发读者好奇。"
        ]
      },
      {
        "moduleId": "grammar",
        "moduleName": "句式分析",
        "imageRef": "grammar",
        "content": "我们再看这张句式分析图。这个句子用的是一般过去时和主动语态。",
        "lines": [
          "我们再看这张句式分析图。",
          "这个句子用的是一般过去时和主动语态。",
          "它的结构是主语加谓语加宾语，",
          "然后加上of，后面跟着宾语从句。",
          "具体来说就是I said no more to the boy of something，",
          "其中something被两个宾语从句替代了。",
          "这里的what引导的是名词性从句，",
          "相当于the thing that的意思。"
        ]
      },
      {
        "moduleId": "summary",
        "moduleName": "句式总结",
        "imageRef": "summary",
        "content": "再看这张句式总结图。这个句子的核心模板是say something to somebody of something。",
        "lines": [
          "再看这张句式总结图。",
          "这个句子的核心模板是：",
          "say something to somebody of something，",
          "也就是对某人说了某事关于某事。",
          "这个结构适合表达一个人对另一个人透露或隐瞒信息。",
          "大家可以用这个句式造句，",
          "比如I told him of what I had seen，",
          "意思就是我对他说了我所看到的事情。"
        ]
      },
      {
        "moduleId": "vocabulary",
        "moduleName": "词汇解析",
        "imageRef": "vocabulary",
        "content": "现在我们来看这张词汇解析图。第一个词是however，它是副词，意思是然而或者不过。",
        "lines": [
          "现在我们来看这张词汇解析图。",
          "第一个词是however，它是副词，",
          "意思是然而或者不过。",
          "例句是However, it is too late now，",
          "意思是然而，现在已经太晚了。",
          "第二个词是mean，它是动词，",
          "意思是打算或者意欲。",
          "例句是I didn't mean to hurt you，",
          "意思是我不是故意伤害你的。",
          "这个mean to do的结构很重要，",
          "表示打算做某事。"
        ]
      },
      {
        "moduleId": "ielts",
        "moduleName": "雅思备考",
        "imageRef": "ielts",
        "content": "最后看这张雅思备考图。这句话在雅思考试中有四个方面的应用价值。",
        "lines": [
          "最后看这张雅思备考图。",
          "这句话在雅思考试中有四个方面的应用价值。",
          "第一是听力，要注意however的转折语气，这是考点。",
          "第二是口语，可以用mean to do来表达自己的意图。",
          "第三是阅读，要学会识别what I had heard这样的宾语从句。",
          "第四是写作，可以用however开头来制造转折效果。"
        ]
      }
    ],
    "conclusion": "好了，今天关于这个句子的讲解就到这里。希望大家能把今天学到的句式和词汇用起来。",
    "conclusionLines": [
      "好了，今天关于这个句子的讲解就到这里。",
      "希望大家能把今天学到的句式和词汇用起来，",
      "我们下次再见。"
    ],
    "totalWordCount": 850,
    "totalLineCount": 45
  }
}
```

## 最终检查

输出前务必确认：

1. 是合法 JSON
2. 顶层只有 `article`
3. **每行不超过50字**，在标点符号后或语气停顿处换行
4. 行数组字段齐全（`introductionLines`、`sections[].lines`、`conclusionLines`）
5. section 数量和 `orderedModules` 一致
6. 每个 section 都和对应图片匹配
7. 原句完整念出，无省略
8. 所有词汇都讲解，无中文音译
9. 雅思四科都提到
10. 无禁止符号（引号、括号、斜杠、省略号等）
11. 总字数在800-1000字范围内
