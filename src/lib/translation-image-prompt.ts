import { stripTranslationHighlightMarkers } from "./translation-image-highlights";

export interface TranslationImagePromptInput {
  originSentence: string;
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
}

export interface TranslationImagePanels {
  prompt1: string;
  prompt2: string;
  prompt3: string;
  prompt4: string;
}

const FIRST_SEGMENT_LABEL =
  "(?:前半部分|前半句|前半段|上半部分|上半句|第一部分|first\\s+part|first\\s+half|part\\s*1|segment\\s*1|section\\s*1)";
const SECOND_SEGMENT_LABEL =
  "(?:后半部分|後半部分|后半句|後半句|后半段|後半段|下半部分|下半句|第二部分|second\\s+part|second\\s+half|part\\s*2|segment\\s*2|section\\s*2)";
const LABEL_SUFFIX = "(?:强调|补充|说明|讲述|描述|描写|翻译|译文)?";
const LABEL_SEPARATOR = "\\s*[:：.,，、）)\\-]\\s*";

const FIRST_SEGMENT_PATTERN = new RegExp(`${FIRST_SEGMENT_LABEL}${LABEL_SUFFIX}${LABEL_SEPARATOR}`, "i");
const SECOND_SEGMENT_PATTERN = new RegExp(`${SECOND_SEGMENT_LABEL}${LABEL_SUFFIX}${LABEL_SEPARATOR}`, "i");

const LEADING_LABEL_PATTERNS = [
  /^(?:第\s*[一二三四1-4]\s*(?:部分|段|句|格)\s*[:：.,，、）)\-]\s*)/i,
  /^(?:part|section|segment|prompt|panel|grid)\s*[1-4]\s*[:：.,，、）)\-]\s*/i,
  /^(?:english|chinese)\s*(?:part\s*[1-4])?\s*[:：.,，、）)\-]\s*/i,
  /^(?:英文原句|英语原句|英文|英语|中文翻译|汉语翻译|中文译文|汉语译文|译文|翻译|原句|句子)\s*(?:第\s*[一二三四1-4]\s*(?:部分|段|句|格)?)?\s*[:：.,，、）)\-]\s*/i,
  /^(?:\(?\s*[1-4]\s*\)?|[一二三四])\s*[:：.,，、\-]\s*/,
];

const LEADING_SEGMENT_META_VERB_PATTERN =
  /^(?:主要|重点|着重|是在|在讲|讲述|描述|描写|呈现|交代|说明|概括|补充|强调|对应|翻译为|意思是)\s*/i;

const META_TOPIC_KEYWORDS = [
  "场景",
  "情景",
  "画面",
  "内容",
  "意义",
  "含义",
  "重点",
  "主旨",
  "背景",
  "部分",
  "半句",
  "半部分",
  "航行",
  "天气",
  "路线",
  "行程",
  "结果",
  "动作",
  "细节",
  "描写",
  "描述",
  "讲述",
  "说明",
  "补充",
  "强调",
  "翻译",
];

function collapseWhitespace(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\s*\n+\s*/g, " ").replace(/\s+/g, " ").trim();
}

function stripWrappingMarks(value: string) {
  let cleaned = value.trim();
  const wrappers: Array<[RegExp, RegExp]> = [
    [/^["“”'`]+/, /["“”'`]+$/],
    [/^\*+/, /\*+$/],
    [/^_+/, /_+$/],
  ];

  let changed = true;
  while (changed) {
    changed = false;
    for (const [start, end] of wrappers) {
      if (start.test(cleaned) && end.test(cleaned)) {
        cleaned = cleaned.replace(start, "").replace(end, "").trim();
        changed = true;
      }
    }
  }

  return cleaned;
}

export function sanitizeTranslationPanelText(value: string) {
  let cleaned = stripWrappingMarks(collapseWhitespace(value ?? ""));
  let changed = true;

  while (changed && cleaned) {
    changed = false;
    for (const pattern of LEADING_LABEL_PATTERNS) {
      const next = cleaned.replace(pattern, "").trim();
      if (next !== cleaned) {
        cleaned = next;
        changed = true;
      }
    }
    cleaned = stripWrappingMarks(cleaned);
  }

  return cleaned;
}

export function sanitizeSegmentationTranslationText(value: string) {
  let cleaned = sanitizeTranslationPanelText(value ?? "");
  let changed = true;

  while (changed && cleaned) {
    changed = false;

    const withoutSegmentSummaryPrefix = cleaned
      .replace(
        /^(?:(?:前|后|上|下)半(?:部分|句|段)|第[一二]部分)(?:主要|重点)?(?:描述|讲述|说明|补充|强调)(?:了|的是|着)?/u,
        "",
      )
      .replace(/^(?:first|second)\s+(?:half|part|segment)\s+(?:mainly\s+)?(?:describes?|explains?|summarizes?|highlights?)\s*/i, "")
      .trim();
    if (withoutSegmentSummaryPrefix !== cleaned) {
      cleaned = stripWrappingMarks(withoutSegmentSummaryPrefix);
      changed = true;
    }

    const withoutVerb = cleaned
      .replace(LEADING_SEGMENT_META_VERB_PATTERN, "")
      .replace(/^[：:，,、.\-\s]+/, "")
      .trim();
    if (withoutVerb !== cleaned) {
      cleaned = stripWrappingMarks(withoutVerb);
      changed = true;
    }

    const colonMatch = cleaned.match(/^([^：:，,。！？]{1,24})[:：]\s*(.+)$/);
    if (colonMatch && META_TOPIC_KEYWORDS.some((keyword) => colonMatch[1].includes(keyword))) {
      cleaned = stripWrappingMarks(collapseWhitespace(colonMatch[2]));
      changed = true;
    }
  }

  return cleaned;
}

export function sanitizeSceneReference(originSentence: string) {
  return stripWrappingMarks(collapseWhitespace(originSentence ?? ""));
}

function extractExpectedSegment(value: string, expected: "first" | "second") {
  const cleaned = stripWrappingMarks(collapseWhitespace(value ?? ""));
  if (!cleaned) {
    return cleaned;
  }

  const firstMatch = FIRST_SEGMENT_PATTERN.exec(cleaned);
  const secondMatch = SECOND_SEGMENT_PATTERN.exec(cleaned);

  if (expected === "first") {
    if (firstMatch) {
      const start = (firstMatch.index ?? 0) + firstMatch[0].length;
      const end = secondMatch && (secondMatch.index ?? cleaned.length) > start ? secondMatch.index : cleaned.length;
      return cleaned.slice(start, end).trim();
    }

    if (secondMatch && (secondMatch.index ?? 0) > 0) {
      return cleaned.slice(0, secondMatch.index).trim();
    }

    return cleaned;
  }

  if (secondMatch) {
    const start = (secondMatch.index ?? 0) + secondMatch[0].length;
    return cleaned.slice(start).trim();
  }

  return cleaned;
}

export function prepareTranslationImagePanels(input: TranslationImagePromptInput): TranslationImagePanels {
  return {
    prompt1: sanitizeTranslationPanelText(extractExpectedSegment(input.prompt1, "first")),
    prompt2: sanitizeSegmentationTranslationText(extractExpectedSegment(input.prompt2, "first")),
    prompt3: sanitizeTranslationPanelText(extractExpectedSegment(input.prompt3, "second")),
    prompt4: sanitizeSegmentationTranslationText(extractExpectedSegment(input.prompt4, "second")),
  };
}

function buildPanelInstruction(index: number, language: "英文" | "中文", text: string) {
  if (!text) {
    return `第${index}格使用空白羊皮纸卷轴版式，不要补充任何文字。`;
  }

  return `第${index}格使用羊皮纸卷轴文本框，只展示这段${language}内容，不要添加任何标题、标签、编号、引号、解释或额外文字：${text}`;
}

export function buildTranslationSceneOnlyPrompt(originSentence: string): string {
  const sceneReference = sanitizeSceneReference(originSentence);
  return [
    "请生成一张竖版 3:4 的英语教学插画，整张图片是一个单一叙事场景，无任何文字宫格分割。",
    "风格：复古旧纸背景、温暖柔和配色、写实细腻线条、适合小红书英语学习内容。",
    "只绘制英语原句真实描述的场景，只保留与原句直接相关的人物、动作、环境、时间氛围和关键物体。",
    "不要加入任何无关剧情、无关角色、无关动物、无关道具、无关说明牌或装饰性标题框。",
    "图片里不要出现任何文字元素，包括标题、横幅、字幕、对白、旁白、标签、书名、作者名、英语原句、中文翻译、部分编号。",
    `依据这句英语原句来构图：${sceneReference}。这句话只用于理解场景，绝不能在画面中出现为任何文字。`,
    "负面要求：任何文字、标题横幅、无关场景、无关人物、无关物体、画面模糊。",
  ].join("\n");
}

export function buildTranslationImagePrompt(input: TranslationImagePromptInput) {
  const panels = prepareTranslationImagePanels(input);
  const sceneReference = sanitizeSceneReference(input.originSentence);

  return [
    "请生成一张竖版 3:4 的英语教学插画，总布局为 6 宫格，其中最下方第 5、6 格合并为 1 个横向大场景。",
    "整体风格统一：复古旧纸背景、羊皮纸卷轴文本框、干净线条、柔和配色、适合小红书英语学习内容。",
    "上方前四个宫格的规则：",
    buildPanelInstruction(1, "英文", stripTranslationHighlightMarkers(panels.prompt1)),
    buildPanelInstruction(2, "中文", stripTranslationHighlightMarkers(panels.prompt2)),
    buildPanelInstruction(3, "英文", stripTranslationHighlightMarkers(panels.prompt3)),
    buildPanelInstruction(4, "中文", stripTranslationHighlightMarkers(panels.prompt4)),
    "上方前四个宫格严格禁止出现这些内容：前半部分、后半部分、前半句、后半句、第一部分、第二部分、Part 1、Part 2、Prompt1、Prompt2、Prompt3、Prompt4、英文原句、中文翻译、解释说明、语法讲解、词汇讲解、书名、作者名、页眉页脚、对话气泡、旁白框。",
    "下方合并大图的规则：",
    "只绘制英语原句真实描述的场景，只保留与原句直接相关的人物、动作、环境、时间氛围和关键物体。",
    "不要加入任何无关剧情、无关角色、无关动物、无关道具、无关说明牌或装饰性标题框。",
    "下方合并大图里不要出现任何文字元素，包括标题、横幅、字幕、对白、旁白、标签、书名、作者名、英语原句、中文翻译、部分编号。",
    `底部大图依据这句英语原句来构图：${sceneReference}。这句话只用于理解场景，绝不能在画面中出现为任何文字。`,
    "负面要求：多余文字、错误文字、标题横幅、无关场景、无关人物、无关物体、解释性说明、图文脱节、文字过小、画面模糊。",
  ].join("\n");
}
