export interface IeltsImagePromptInput {
  listening: string;
  speaking: string;
  reading: string;
  writing: string;
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

export function sanitizeIeltsTipText(value: string) {
  return normalizeText(value)
    .replace(/\*\*/g, "")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .replace(/^(听力|口语|阅读|写作)\s*[：:]\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPanelSource(title: string, content: string) {
  return `${title}解析：${sanitizeIeltsTipText(content) || "请仅保留该维度最核心的雅思策略，不要补充外部内容。"}`;
}

export function buildIeltsImagePrompt(input: IeltsImagePromptInput) {
  return `请生成 1 张 3:4 竖版、2×2 四宫格的“雅思备考”教学信息图。

【唯一内容来源】
只能使用下面提供的雅思备考解析作为文字内容来源。最终图片里的可见文字，必须完全基于这四段解析提炼、改写和排版，不能借用其他来源补充内容。
- ${formatPanelSource("听力", input.listening)}
- ${formatPanelSource("口语", input.speaking)}
- ${formatPanelSource("阅读", input.reading)}
- ${formatPanelSource("写作", input.writing)}

【允许出现的内容】
- 四个宫格标题：听力、口语、阅读、写作
- 每个宫格基于对应解析提炼出的 2-4 条中文策略点
- 少量通用英文术语，例如 main clause、linker、parallel structure、Band 7+，仅在确实服务该宫格解析时出现
- 简洁的箭头、图标、结构框等信息图元素

【禁止出现的内容】
- 禁止出现英文原句
- 禁止出现整句中文翻译
- 禁止出现句译对照、句式分析、句式总结、词汇解析等其他模块文字
- 禁止出现书名、作者名、角色名、Gatsby、The Great Gatsby、Day 01、Day 06 等无关文案
- 禁止出现参考图里已有的标题、示例句、页眉、品牌词、编号、注释
- 禁止出现第五宫格、封面、大标题、页脚或与雅思备考无关的补充版块

【参考图使用边界】
- 如果提供参考图，参考图只用于借鉴版式、配色、边框、图标风格、字体粗细和信息密度
- 参考图里任何可见文字都必须忽略
- 参考图只用于风格参考，任何可见文字必须忽略，不得复制、改写或翻译
- 不要继承参考图里的主题、角色、场景叙事或书籍内容
- 如果参考图和“唯一内容来源”冲突，以“唯一内容来源”为唯一准则

【四宫格结构】
- 左上：听力，只能使用“听力解析”提炼内容
- 右上：口语，只能使用“口语解析”提炼内容
- 左下：阅读，只能使用“阅读解析”提炼内容
- 右下：写作，只能使用“写作解析”提炼内容
- 每格用黑色标题栏 + 白色标题字 + 对应图标，正文为中文策略点，文字清晰易读

【输出要求】
- 只输出 1 张雅思备考四宫格信息图，不要额外封面或总标题
- 画面保持信息密集但清晰，优先保证文字准确可读
- 如果某一格内容不足，宁可写得更短，也不要补入原句、翻译、参考图文字或其他模块内容`;
}
