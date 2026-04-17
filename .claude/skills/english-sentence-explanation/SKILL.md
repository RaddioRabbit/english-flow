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
    "context": "可选。句子在原著中的上下文与历史文化背景信息，包括前后文语境、出版背景、故事时代、作者生平与创作意图等。未提供时请基于你的知识合理推断",
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

### 句译对照模块（不超过500字）
- 结合句译对照图讲解
- **必须一字不差地完整念出原句**
- 完整给出中文翻译
- 简要概括所有情境提示内容（prompt1-4）
- 在念完原句和翻译之后，**必须加入一段语境溯源讲解**
- **核心问题**：为什么在那个历史和文本背景下，作者会写出这句话？
- **解读角度必须全面联系以下四点**：
  1. 句子**上下文三句**的语境关系
  2. 《{book_name}》**出版年代**的历史背景（社会、政治、经济、文化环境）
  3. 书中**故事描绘的年代**的历史背景（历史事件、社会状况）
  4. **作者**的生平、思想及创作意图
- 聚焦于**文本外部**的历史文化分析，提供宏观背景和深层原因
- **格式要求**：整段连贯，不分段，用口语化表达，示例结构如下：从上下文来看，这句话承接前文……呼应后文……在局部语境中起到……作用。结合《{book_name}》的创作背景，作者在……年代的……社会环境下，试图通过这句话表达……。故事所描绘的……年代正值……历史时期，……的社会现实为这句话提供了深厚的历史底蕴。作者基于自身……的生平经历和……的思想观点，借此句传达出……的创作意图。
- 如果提供了 textContent.context，请将其作为重要参考融入语境溯源；如果未提供，请基于你的知识合理推断
- **该模块总字数严格不得超过500字**

### 句式分析模块（150-500字，尽量详细但不要超过500字）
- 结合句式分析图讲解
- **时态语态可以不讲，不是重点**
- **必须按照图片中的各个 panel 逐一讲解，不能遗漏任何一部分**
- 必须覆盖的成分包括但不限于：**主语、谓语、宾语、定语、状语（让步状语、条件状语、结果状语等）、补语、从句（定语从句、条件状语从句等）、介词短语、特殊语法现象**
- 如果句子中包含**从句**，必须说明从句类型（如名词性从句、定语从句、状语从句等）及其作用
- 如有特殊短语结构（如介词短语、不定式短语、分词短语）或特殊语法现象，也应一并说明
- 把句式分析和原句逐部分对应起来，不要泛泛而谈

### 句式总结模块（100-200字，讲清楚即可，不要超过200字）
- 结合句式总结图讲解，必须按图中内容逐一讲解
- 提炼整句的大句子结构和句子逻辑
- 说明核心主干是什么
- 不要写仿写例句

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
- **句译对照模块严格控制在500字以内**
- 其他模块的讲解字数暂时不做硬性限制，但仍需保持口播逐字稿的简洁自然

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
    "context": "这句话出自小说第一章，叙述者马奈特医生对自己的神秘过去讳莫如深，与前文的紧张气氛和后文的危机爆发形成呼应。狄更斯创作于1859年，当时英国社会正处于工业革命的转型期，阶级矛盾日益尖锐。故事背景设定在法国大革命前夕的伦敦与巴黎，贵族对平民的压迫引发了剧烈的社会动荡。狄更斯本人经历了童年贫困和底层社会的艰辛，深受人道主义思想影响，创作《双城记》旨在揭示社会不公与人性的复杂。",
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
        "content": "我们先来看这张句译对照图。原文是：However, I said no more to the boy of what I had heard, or what I meant to do。整句话的意思是：然而，对于我所听到的以及我打算做的事情，我对那男孩只字未提。从上下文来看，这句话承接前文的紧张气氛，呼应后文即将到来的危机，在局部语境中起到承上启下的作用。结合《双城记》的创作背景，作者在十九世纪中期的英国社会环境下，试图通过这句话表达时代动荡中的人性挣扎。故事所描绘的法国大革命前夕正值社会矛盾激化的历史时期，阶级对立的社会现实为这句话提供了深厚的历史底蕴。作者基于自身对社会底层深切同情的生平经历和批判现实主义的思想观点，借此句传达出关注个体命运与时代洪流交织的创作意图。",
        "lines": [
          "我们先来看这张句译对照图。",
          "大家注意看，原文是这样的：",
          "However, I said no more to the boy of what I had heard, or what I meant to do。",
          "整句话的意思是：",
          "然而，对于我所听到的以及我打算做的事情，",
          "我对那男孩只字未提。",
          "从上下文来看，",
          "这句话承接前文的紧张气氛，",
          "呼应后文即将到来的危机，",
          "在局部语境中起到承上启下的作用。",
          "结合《双城记》的创作背景，",
          "作者在十九世纪中期的英国社会环境下，",
          "试图通过这句话表达时代动荡中的人性挣扎。",
          "故事所描绘的法国大革命前夕，",
          "正值社会矛盾激化的历史时期，",
          "阶级对立的社会现实为这句话提供了深厚的历史底蕴。",
          "作者基于自身对社会底层深切同情的生平经历，",
          "和批判现实主义的思想观点，",
          "借此句传达出关注个体命运与时代洪流交织的创作意图。"
        ]
      },
      {
        "moduleId": "grammar",
        "moduleName": "句式分析",
        "imageRef": "grammar",
        "content": "我们再看这张句式分析图。这个句子成分非常丰富，我们按图中的panel逐一来看。主句的核心结构是I said no more to the boy，主语是I，谓语动词是said，no more是宾语，to the boy是介词短语作状语，表示对象是男孩。接下来看让步状语however，它放在句首，用逗号隔开，表示一种转折和让步的语气，暗示后文内容与上文形成对比。再看定语从句，of what I had heard, or what I meant to do是一个介词短语，其中of后面跟了两个由what引导的宾语从句，分别表示我听到的事情和我打算做的事情，这两个what从句都是名词性从句，在句中充当of的宾语。句子里还隐含了并列让步和条件关系，what I had heard与what I meant to do用or连接，形成并列结构，说明叙述者对男孩隐瞒了两方面的信息。最后看结果状语，整个no more的否定表达造成了一种悬念的结果，让读者感觉到叙述者保留了秘密，从而引出后续情节。整个句子通过多个状语和从句的叠加，把一种隐瞒和神秘的氛围表达得淋漓尽致。",
        "lines": [
          "我们再看这张句式分析图。",
          "这个句子成分非常丰富，",
          "我们按图中的panel逐一来看。",
          "主句的核心结构是I said no more to the boy，",
          "主语是I，谓语动词是said，",
          "no more是宾语，",
          "to the boy是介词短语作状语，表示对象是男孩。",
          "接下来看让步状语however，",
          "它放在句首，用逗号隔开，",
          "表示一种转折和让步的语气，",
          "暗示后文内容与上文形成对比。",
          "再看定语从句部分，",
          "of what I had heard, or what I meant to do",
          "是一个介词短语，",
          "其中of后面跟了两个what引导的宾语从句。",
          "第一个从句what I had heard表示我听到的事情，",
          "第二个从句what I meant to do表示我打算做的事情。",
          "这两个what从句都是名词性从句，",
          "在句中充当of的宾语。",
          "句子里还隐含了并列结构，",
          "what I had heard与what I meant to do用or连接，",
          "说明叙述者对男孩隐瞒了两方面的信息。",
          "最后看结果状语，",
          "no more的否定表达造成了悬念的结果，",
          "让读者感觉到叙述者保留了秘密。",
          "整个句子通过多个状语和从句的叠加，",
          "把隐瞒和神秘的氛围表达得淋漓尽致。"
        ]
      },
      {
        "moduleId": "summary",
        "moduleName": "句式总结",
        "imageRef": "summary",
        "content": "再来看这张句式总结图。这个句子的核心主干是I said no more to the boy，主语I发出动作，谓语said表示说，no more是说的内容，to the boy指向说话对象。后半部分的of what I had heard, or what I meant to do则用两个what从句补充说明了隐瞒的具体内容，整个句子的逻辑是先说转折、再讲动作、最后交代细节，层层推进，把那种欲言又止的神秘感表现得非常到位。",
        "lines": [
          "再来看这张句式总结图。",
          "这个句子的核心主干是I said no more to the boy，",
          "主语I发出动作，谓语said表示说，",
          "no more是说的内容，",
          "to the boy指向说话对象。",
          "后半部分的of what I had heard，",
          "or what I meant to do",
          "用两个what从句补充说明了隐瞒的具体内容。",
          "整个句子先说转折、再讲动作、最后交代细节，",
          "层层推进，",
          "把欲言又止的神秘感表现得非常到位。"
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
    "totalWordCount": 1010,
    "totalLineCount": 57
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
11. 句译对照模块总字数不超过500字
