import type { ImageGenerationResult } from "./page11-image-agent";
import { IMAGE_GENERATION_SKILL_NAME } from "../image-generation-skill";

export interface Page221ImageAgentInput {
  originSentence: string;
  grammarAnalysis: {
    tense: string;
    voice: string;
    structure: string;
  };
  referenceImage?: string;
}

interface StructureBreakdown {
  detailLines: string[];
  summaryLine: string;
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

function stripMarkdown(value: string) {
  return normalizeText(value).replace(/\*\*/g, "");
}

function splitStructureBreakdown(structure: string): StructureBreakdown {
  const lines = normalizeText(structure)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const detailLines = lines.filter((line) => line.startsWith("-"));
  let summaryLine = "";

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (/\*\*/.test(lines[index])) {
      summaryLine = lines[index];
      break;
    }
  }

  return { detailLines, summaryLine };
}

function distributeSequentially(items: string[], bucketCount: number) {
  const buckets = Array.from({ length: bucketCount }, () => [] as string[]);
  if (!items.length) {
    return buckets;
  }

  const baseSize = Math.floor(items.length / bucketCount);
  const extra = items.length % bucketCount;
  let cursor = 0;

  for (let bucketIndex = 0; bucketIndex < bucketCount; bucketIndex += 1) {
    const size = baseSize + (bucketIndex < extra ? 1 : 0);
    if (size <= 0) {
      continue;
    }

    buckets[bucketIndex] = items.slice(cursor, cursor + size);
    cursor += size;
  }

  return buckets;
}

function buildCoverageGuide(detailLines: string[]) {
  const buckets = distributeSequentially(detailLines, 4);

  return buckets
    .map((bucket, index) => {
      if (!bucket.length) {
        return `- 宫格${index + 1}：如果独立结构数量不够，就把前面较长的结构继续拆成“原句对应 + 成分拆解 + 语法作用”，但仍然必须写出完整英文原句片段。`;
      }

      return [
        `- 宫格${index + 1}优先覆盖这些结构：`,
        ...bucket.map((line) => `  ${line.replace(/^-+\s*/, "")}`),
      ].join("\n");
    })
    .join("\n");
}

function buildFinalPrompt(input: Page221ImageAgentInput): string {
  const originSentence = normalizeText(input.originSentence);
  const tense = stripMarkdown(input.grammarAnalysis.tense);
  const voice = stripMarkdown(input.grammarAnalysis.voice);
  const structureText = normalizeText(input.grammarAnalysis.structure);
  const { detailLines, summaryLine } = splitStructureBreakdown(input.grammarAnalysis.structure);
  const structureChecklist =
    detailLines.length > 0
      ? detailLines.map((line) => `- ${line.replace(/^-+\s*/, "")}`).join("\n")
      : "- 请直接根据原句和完整结构总结，把所有结构逐一拆成可讲清楚的宫格。";

  return `请生成一张 3:4 竖版、4宫格的英语句式分析教学图。

【核心目标】
这张图必须完整分析下面这个英语原句的句式结构，并让读者一眼看清：
1. 这句话具体有哪些句式结构。
2. 每个结构分别是什么句子成分。
3. 每个结构在原英语句子中对应的是哪些完整英文原话。
4. 这些结构在全句里分别起什么作用。

【原句】
${originSentence}

【必须覆盖的语法材料】
时态：${tense || "未提供"}
语态：${voice || "未提供"}
句式结构分析：
${structureText || "- 未提供"}

【绝对硬性要求】
- 整张图只能有 4 个宫格，不要页眉大标题，不要额外第五格，不要封面。
- 4 个宫格合起来必须覆盖原句的全部结构，不允许遗漏任何一个结构。
- 不允许出现任何省略写法，不允许出现 "...", "…", "that ...", "of the boy..." 这类截断内容。
- 不允许把标题写成"状语2及省略""结构3""补充说明"这类含糊名字。标题必须写明具体结构，例如"主句核心""让步状语从句""宾语从句""后置定语""非谓语伴随状语""并列补足成分"。
- 每个宫格都必须写清楚这个宫格讲的是哪一个具体句式结构、哪一个具体句子成分。
- 每个宫格都必须有"原句对应"区域，完整抄写该宫格对应的英文原句片段。必须直接复制自原句，不能改写，不能截断，不能只写半句。
- 如果一个结构对应原句里两个或更多不连续的片段，也要全部写出来，可以写成"原句对应1 / 原句对应2"，但每个片段都必须完整。
- 如果分析里提到英语里存在省略关系，也不要在图上写"省略"。要改写成清楚的结构名称，并把原句里真实出现的英文完整写出。
- 除了英文原句片段和必要语法术语，其他解释尽量用简体中文，让初中生也能看懂。
- 所有文字必须足够大，手机端清晰可读；宁可减少装饰，也不能让文字太小。
- **文字必须清晰无误，禁止出现错别字、语病、乱码或不易理解的缩写。每个字、每个词都必须准确通顺。**

【视觉风格要求 - 必须严格遵守】
- 整体风格：英语教学信息图，扁平化矢量风格，高信息密度
- 背景：浅米黄色/奶油色纸张质感背景
- 边框：粗黑色轮廓线（2-3px），圆角矩形宫格
- 宫格布局：2×2 四宫格，每个宫格独立带边框

【标题栏样式】
- 主句/主干结构：红色背景标题栏（#dc2626 或类似红色）+ 白色粗体文字
- 从句/修饰结构：蓝色背景标题栏（#2563eb 或类似蓝色）+ 白色粗体文字
- 标题右侧必须配图标：主句用🔍放大镜或⚡闪电，从句用🛡️盾牌或⚙️齿轮
- 图标风格：简洁的扁平化图标，白色或与标题栏协调

【原句对应区域样式 - 必须严格遵守】
- 每个宫格必须用大号字体完整展示该结构对应的英文原句片段，不能省略、不能截断
- 用不同颜色背景高亮标注不同的句子成分：
  * 主语：粉色背景（#fecaca）+ 黑色粗体
  * 谓语：蓝色背景（#bfdbfe）+ 黑色粗体
  * 宾语/表语：绿色背景（#bbf7d0）+ 黑色粗体
  * 状语：黄色背景（#fef08a）+ 黑色粗体
  * 定语：紫色背景（#e9d5ff）+ 黑色粗体
  * 补语：橙色背景（#fed7aa）+ 黑色粗体
  * 连词/连接词：灰色背景（#e5e7eb）+ 黑色粗体
- 每个高亮片段后必须紧跟括号备注，说明这是什么句子成分，例如：
  * "He（主语）"
  * "agreed（谓语动词）"
  * "thinking no harm（现在分词短语作伴随状语）"
  * "to the boy（介词短语作状语，表示对象）"
- 如果片段有多个成分，用"+"号连接，每个成分都要标注，例如：
  "He（主语）+ agreed（谓语）+ to help（不定式作宾语）"

【成分拆解区域样式 - 必须严格遵守】
- 只允许使用以下纯文本符号表示层级关系：
  * → 箭头（U+2192）表示修饰关系或指向
  * ↳ 或 └─ 表示层级缩进和分支
  * [ ] 方括号标注成分类型，如 [主语]、[谓语]、[宾语]
- 明确禁止使用的符号（这些会导致理解混乱）：
  * 禁止齿轮图标 ⚙️ 或类似机械符号
  * 禁止链条/链接图标 🔗 或类似连接符号
  * 禁止定位图标 📍 或类似标记符号
  * 禁止任何emoji图标出现在成分拆解区域
  * 禁止数字角标如 ²] 或上标数字
- 层级结构用缩进表示，嵌套从句要清晰展示层次
- 关键语法术语用粗体或彩色标注，但不要用符号装饰
- 格式示例：
  → [主语] He
    ↳ [谓语] agreed
    ↳ [宾语] to set the sails

【中文讲解区域样式 - 必须严格遵守】
- 放在圆角浅黄色背景框内（#fef3c7 或类似米黄色）
- 框左侧配小图标：💡灯泡表示重点解释，⚙️齿轮表示技巧提示
- 文字行间距适中，段落清晰
- 关键概念可以用彩色文字或粗体强调
- 讲解必须逻辑清晰，按以下结构组织：
  1. 是什么：这个结构叫什么名字，包含哪些词
  2. 做什么：这个结构在全句中起什么作用（修饰谁、补充说明什么）
  3. 怎么用：理解这个结构对理解整句有什么帮助
- 使用高中生能理解的简单直白语言，避免堆砌复杂语法术语
- 每个句子控制在20字以内，避免长难句
- 禁止出现逻辑混乱、前后矛盾的表述
- 讲解模板示例：
  "这个结构是时间状语从句，由when引导。它告诉我们动作发生的时间背景。理解它就能知道故事是按什么顺序发展的。"

【每个宫格的固定内容结构】
每个宫格都必须同时包含以下 4 个区域，缺一不可：

1. 标题栏：
   - 彩色背景标题栏（红色用于主句/主干结构，蓝色用于从句/修饰结构）
   - 标题文字为白色粗体，左侧有对应图标（如：主句用放大镜或闪电图标，从句用盾牌或齿轮图标）
   - 标题必须写明具体结构名称，如"主句1（让步后承认）"、"让步状语从句1"等

2. 原句对应（必须用彩色高亮）：
   - 用彩色背景高亮显示原句片段（粉色/黄色背景突出主句部分，浅蓝色背景突出从句部分）
   - 下方逐词标注中文翻译，格式如：he (他) + was forced (被迫) + to acknowledge (去承认)
   - 完整展示英文原句片段，不能截断

3. 成分拆解（必须有视觉图示）：
   - 使用箭头"→"、方括号"[ ]"、圆括号"( )"等符号清晰展示句式结构
   - 明确标注：[主语]、[谓语]、[宾语]、[状语]、[定语]、[补足语]等
   - 用层级缩进展示嵌套结构，如：
     [让步连词] Though
     → [主语] he
     → [谓语] had detected
   - 复杂结构用分支箭头展示修饰关系

4. 中文讲解（必须有图标和背景框）：
   - 放在浅黄色/米色背景框内
   - 左侧配小图标（灯泡表示解释，齿轮表示技巧）
   - 详细解释该结构的语法作用、与上下文的逻辑关系、理解要点
   - 语言通俗易懂，让初中生能看懂

【宫格分配原则】
- 按原句中结构出现的先后顺序来排布 4 个宫格。
- 先讲主干，再讲修饰、从句、补充结构。
- 如果结构很多，可以把相关结构合并在同一格，但原句片段必须仍然写全。
- 如果结构不够 4 大类，就把长结构拆成“原句定位”“成分拆解”“作用说明”两个或多个宫格，但不能重复空话，也不能只做总结。
- 4 个宫格都必须用于结构讲解，不要任何封面格、总览格、空白格。

【建议覆盖顺序】
${buildCoverageGuide(detailLines)}

【必须完整展示的结构清单】
${structureChecklist}
${summaryLine ? `完整结构总结：${stripMarkdown(summaryLine)}` : ""}

【禁止事项】
- 禁止复现分析输入里的模糊标题、截断短语、三点省略号。
- 禁止只给概括，不给原句对应英文。
- 禁止让某个宫格只有解释，没有"原句对应"。
- 禁止把原句英文写得过小、被图形遮挡、或被装饰性插图打断。
- 禁止出现和句式分析无关的人物对白、剧情插图、装饰性大场景。
- 禁止在成分拆解区域使用任何装饰性符号（齿轮⚙️、链条🔗、定位📍等），只允许使用箭头→和方括号[]。
- 禁止出现错别字、语病、乱码、不易理解的缩写或数字角标（如²]）。

【格式示例 - 每个宫格必须按此格式输出】

宫格示例1（主句核心）：
┌─────────────────────────────────────────┐
│ 🔍 主句核心（He agreed）                  │ ← 红色标题栏+白色文字+图标
├─────────────────────────────────────────┤
│                                         │
│  He（主语）+ agreed（谓语动词）           │ ← 原句片段，每个成分标注类型
│  + to set the sails（不定式作宾语）       │
│                                         │
│  → [主语] He                             │ ← 成分拆解，用箭头层级展示
│    → [谓语] agreed                       │
│    → [宾语] to set the sails             │
│                                         │
│  💡 这是句子的主干部分。He是动作发出者     │ ← 中文讲解，浅黄背景框
│     （主语），agreed是核心动作（谓语）。   │
│     理解主干就能抓住句子大意：他同意了。   │
│                                         │
└─────────────────────────────────────────┘

宫格示例2（状语从句）：
┌─────────────────────────────────────────┐
│ 🛡️ 时间状语从句（When thinking...）      │ ← 蓝色标题栏+白色文字+图标
├─────────────────────────────────────────┤
│                                         │
│  When（连词）+ thinking no harm（现在分词 │ ← 原句片段，颜色区分成分
│  短语作时间状语）                         │
│                                         │
│  → [连词] When                           │ ← 成分拆解
│    → [状语] thinking no harm             │
│      → thinking（现在分词）              │
│      → no harm（宾语）                   │
│                                         │
│  💡 这个结构是时间状语，由when引导。它告诉 │ ← 中文讲解，简单直白
│     我们主句动作发生的时间背景。"thinking   │
│     no harm"意思是"觉得没有恶意时"。       │
│                                         │
└─────────────────────────────────────────────────────────┘

【颜色标注规范】
- 粉色背景 = 主语
- 蓝色背景 = 谓语
- 绿色背景 = 宾语/表语
- 黄色背景 = 状语
- 紫色背景 = 定语
- 橙色背景 = 补语
- 灰色背景 = 连词/连接词`;
}

async function generateImageWithSkill(
  prompt: string,
  referenceImage?: string,
): Promise<{ success: boolean; imageDataUrl?: string; error?: string }> {
  try {
    const result = await (globalThis as unknown as {
      skill: (name: string, params: Record<string, unknown>) => Promise<unknown>;
    }).skill(IMAGE_GENERATION_SKILL_NAME, {
      prompt,
      reference_image: referenceImage || undefined,
    });

    const typedResult = result as { image_url?: string; image_data_url?: string };

    return {
      success: true,
      imageDataUrl: typedResult.image_data_url || typedResult.image_url,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "图像生成失败",
    };
  }
}

export async function generatePage221Image(
  input: Page221ImageAgentInput,
): Promise<ImageGenerationResult> {
  try {
    const finalPrompt = buildFinalPrompt(input);
    const generationResult = await generateImageWithSkill(finalPrompt, input.referenceImage);

    if (!generationResult.success) {
      return {
        success: false,
        error: generationResult.error,
        metadata: {
          moduleId: "grammar",
          promptLength: finalPrompt.length,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      imageDataUrl: generationResult.imageDataUrl,
      metadata: {
        moduleId: "grammar",
        promptLength: finalPrompt.length,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      metadata: {
        moduleId: "grammar",
        promptLength: 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
