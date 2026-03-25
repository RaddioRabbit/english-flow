import type { ImageGenerationResult } from "./page11-image-agent";
import { IMAGE_GENERATION_SKILL_NAME } from "../image-generation-skill";

export interface Page222ImageAgentInput {
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

interface FeatureRule {
  pattern: RegExp;
  title: string;
  description: string;
}

const FEATURE_RULES: FeatureRule[] = [
  {
    pattern: /并列| and | or | but /i,
    title: "并列结构",
    description: "关注多个动作、判断或成分如何并列推进，让句子形成平行叙述节奏。",
  },
  {
    pattern: /主谓宾补|宾语补足语|宾补|补足语|make .*?(adj|aware|ready|safe|proud)/i,
    title: "主谓宾补结构",
    description: "解释宾语后面的补足语如何补充状态、结果或评价。",
  },
  {
    pattern: /系表|主系表|表语|be aware|be ready|be safe|be proud/i,
    title: "主系表结构",
    description: "说明句子如何借助表语表达状态、认识或态度。",
  },
  {
    pattern: /定语从句|关系从句|which|who|whom|that .*修饰/i,
    title: "定语从句",
    description: "突出从句如何继续限定名词，让信息越写越具体。",
  },
  {
    pattern: /状语从句|时间状语|原因状语|条件状语|让步状语|结果状语|when|if|because|as soon as|although|though/i,
    title: "状语从句",
    description: "说明从句如何补充时间、原因、条件、让步或结果关系。",
  },
  {
    pattern: /非谓语|不定式|动名词|现在分词|过去分词|伴随状语|to do|doing|done/i,
    title: "非谓语结构",
    description: "强调非谓语如何压缩信息，让句子更紧凑。",
  },
  {
    pattern: /介词短语|of 短语|of短语|介词宾语|介词结构/i,
    title: "介词短语链",
    description: "说明多个介词短语如何层层追加信息、形成递进修饰。",
  },
  {
    pattern: /后置定语|后置修饰|postpositive/i,
    title: "后置修饰",
    description: "突出核心名词后面接长尾修饰时，信息如何一步步展开。",
  },
  {
    pattern: /同位语/i,
    title: "同位语结构",
    description: "解释同位语如何补充说明前面的名词内容。",
  },
];

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

function cleanDetailLine(line: string) {
  return stripMarkdown(line).replace(/^-+\s*/, "").trim();
}

function splitSummaryComponents(summaryLine: string) {
  return stripMarkdown(summaryLine)
    .split("+")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildStructureChecklist(detailLines: string[]) {
  if (!detailLines.length) {
    return "- 请根据原句和完整结构总结，提炼出最关键的主干、修饰和从句关系。";
  }

  return detailLines.map((line) => `- ${cleanDetailLine(line)}`).join("\n");
}

function buildLogicHints(detailLines: string[], summaryLine: string) {
  const hints: string[] = [];
  const summaryComponents = splitSummaryComponents(summaryLine);

  summaryComponents.slice(0, 6).forEach((component, index) => {
    hints.push(`- 逻辑主线线索 ${index + 1}：${component}`);
  });

  detailLines.slice(0, 6).forEach((line, index) => {
    hints.push(`- 可挂到逻辑图分支的结构线索 ${index + 1}：${cleanDetailLine(line)}`);
  });

  if (!hints.length) {
    hints.push("- 先找句子的主干信息，再找修饰、补充、限定和结果关系。");
  }

  return hints.join("\n");
}

function buildFeatureCandidates(detailLines: string[], summaryLine: string, tense: string, voice: string) {
  const source = [tense, voice, summaryLine, ...detailLines].join("\n");
  const featureHints: string[] = [];

  for (const rule of FEATURE_RULES) {
    if (rule.pattern.test(source)) {
      featureHints.push(`- ${rule.title}：${rule.description}`);
    }
  }

  if (tense) {
    featureHints.push(`- 时态选择：${tense}`);
  }

  if (voice) {
    featureHints.push(`- 语态选择：${voice}`);
  }

  if (!featureHints.length) {
    featureHints.push("- 请从句式结构分析中提炼 4-6 个最有教学价值的语法特征，不要做成成分总表。");
  }

  return featureHints.slice(0, 6).join("\n");
}

function buildFinalPrompt(input: Page222ImageAgentInput): string {
  const originSentence = normalizeText(input.originSentence);
  const tense = stripMarkdown(input.grammarAnalysis.tense);
  const voice = stripMarkdown(input.grammarAnalysis.voice);
  const structureText = normalizeText(input.grammarAnalysis.structure);
  const { detailLines, summaryLine } = splitStructureBreakdown(input.grammarAnalysis.structure);
  const cleanSummaryLine = stripMarkdown(summaryLine);
  const structureChecklist = buildStructureChecklist(detailLines);
  const logicHints = buildLogicHints(detailLines, summaryLine);
  const featureCandidates = buildFeatureCandidates(detailLines, summaryLine, tense, voice);

  return `请生成一张 3:4 竖版、2宫格的“句式总结图”教学信息图。

这张图的目标不是把句式分析机械铺成“结构总表”，而是像教材总结页一样，把原句的整体逻辑和关键语法特征讲清楚。

固定版式要求：
- 整张图只能有上下两个大面板，不能出现第三块内容。
- 上半部分标题必须固定为：整体句子逻辑图
- 下半部分标题必须固定为：关键语法特征
- 不要使用“全句结构链路”“结构与成分总表”“对应表”这类标题。
- 视觉风格参考高信息密度教学图：米黄色纸张背景、红色标题栏、粗黑描边、黑色箭头、白底知识卡、黄色/绿色高亮框。
- 不要人物剧情插画，不要装饰性大场景，重点就是信息图本身。

原句：
${originSentence}

已确认的句式分析材料：
时态：${tense || "未提供"}
语态：${voice || "未提供"}
句式结构分析：
${structureText || "- 未提供"}

完整结构总结：
${cleanSummaryLine || "请根据原句自行提炼完整结构总结"}

必须覆盖的结构线索：
${structureChecklist}

逻辑图提炼线索：
${logicHints}

候选关键语法特征：
${featureCandidates}

绝对内容要求：
- 所有英文片段都必须直接取自原句，不得编造，不得写成 that ... / of ... / ... 这种残缺形式。
- 解释文字用简体中文，适合初中生阅读，短句、清楚、可读。
- 字体必须足够大，手机端清晰可读。
- 不要把整句英文原文做成占据半个画面的超大文本块。
- 不要把所有结构逐条抄成四列表格。

上半部分：整体句子逻辑图
- 目标：解释“整句话的信息是怎样一步一步推进的”，不是罗列所有成分名称。
- 请先提炼 2 到 4 个主干逻辑节点，用红色主干框从上到下串联。
- 再把修饰、补充、限定、评价、结果等次级信息，用黄色或绿色分支框挂到对应主干节点旁边。
- 每个节点必须包含：
  1. 原句中的核心英文片段
  2. 对应中文解释
- 如果句子里有多个主干动作或判断，可以写成“主句1 / 主句2 / 主句3”这种主线节点。
- 如果某个中心名词后面挂了多个修饰成分，可以做成一主多支的分支结构。
- 面板底部必须有一条浅黄色总结条，左侧可配齿轮或流程图图标，内容必须以“句子逻辑：”开头，用 1 到 2 句话总结整句如何递进、转折、补充或聚焦。
- 视觉重点应该是“主线逻辑 + 分支补充”，而不是一整块表格。

下半部分：关键语法特征
- 目标：在句式结构分析的基础上，提炼 4 到 6 个最值得学习的语法特征。
- 不要做“结构名称 / 原句对应 / 句子成分 / 语法作用”的表格。
- 每一条都做成独立的横向知识卡或编号条目，白底黑边，信息清晰。
- 每条必须包含：
  1. 编号
  2. 语法特征名称
  3. 对应英文结构（可高亮关键短语）
  4. 一句中文解释，说明它在本句中的作用
- 优先挑决定整句表达效果的特征，不要把所有细小成分都列进去。
- 时态和语态可以融入最相关的一条说明里，不必各自占一整大条。
- 面板底部必须再有一条浅黄色总结条，左侧可配灯泡图标，内容必须以“这一句值得学的地方：”开头，总结这句话的结构价值和表达效果。

请让最终成图更接近“整体句子逻辑图 + 关键语法特征”的教材总结页，而不是“结构与成分总表”的密集表格页。`;
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

export async function generatePage222Image(
  input: Page222ImageAgentInput,
): Promise<ImageGenerationResult> {
  try {
    const finalPrompt = buildFinalPrompt(input);
    const generationResult = await generateImageWithSkill(finalPrompt, input.referenceImage);

    if (!generationResult.success) {
      return {
        success: false,
        error: generationResult.error,
        metadata: {
          moduleId: "summary",
          promptLength: finalPrompt.length,
          generatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      success: true,
      imageDataUrl: generationResult.imageDataUrl,
      metadata: {
        moduleId: "summary",
        promptLength: finalPrompt.length,
        generatedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
      metadata: {
        moduleId: "summary",
        promptLength: 0,
        generatedAt: new Date().toISOString(),
      },
    };
  }
}
