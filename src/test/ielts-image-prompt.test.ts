import { describe, expect, it } from "vitest";

import { buildIeltsImagePrompt, sanitizeIeltsTipText } from "@/lib/ielts-image-prompt";

describe("sanitizeIeltsTipText", () => {
  it("strips panel labels, markdown, and extra whitespace", () => {
    expect(sanitizeIeltsTipText('  "**听力：** 在听力考试中，先抓主干。  ')).toBe(
      "在听力考试中，先抓主干。",
    );
    expect(sanitizeIeltsTipText("写作: 通过并列结构提升句式变化。")).toBe(
      "通过并列结构提升句式变化。",
    );
  });
});

describe("buildIeltsImagePrompt", () => {
  it("locks the prompt to IELTS tips only and forbids reference-text leakage", () => {
    const prompt = buildIeltsImagePrompt({
      listening: "听力：在听力考试中，要先抓主干，再顺着连接词定位细节。",
      speaking: "口语：可以借用并列描写组织答案，但不要机械复述原句。",
      reading: "阅读：先识别主干，再拆分修饰成分，避免被长句拖慢。",
      writing: "写作：借鉴层层展开的组织方式，但改写成自己的论证。",
    });

    expect(prompt).toContain("听力解析：在听力考试中，要先抓主干，再顺着连接词定位细节。");
    expect(prompt).toContain("口语解析：可以借用并列描写组织答案，但不要机械复述原句。");
    expect(prompt).toContain("只能使用下面提供的雅思备考解析作为文字内容来源");
    expect(prompt).toContain("禁止出现英文原句");
    expect(prompt).toContain("禁止出现整句中文翻译");
    expect(prompt).toContain("参考图只用于风格参考，任何可见文字必须忽略，不得复制、改写或翻译");
    expect(prompt).not.toContain("例句要用每个单词下方的例句");
    expect(prompt).not.toContain("还要把例句的翻译也写上");
  });
});
