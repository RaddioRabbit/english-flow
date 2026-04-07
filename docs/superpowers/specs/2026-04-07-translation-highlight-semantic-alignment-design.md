# Translation Highlight Semantic Alignment Design

**Date:** 2026-04-07

**Goal**

让“句译对照图”的中文高亮从“机械匹配词义原文”升级为“按当前句子里的实际翻译表达做最小准确标注”。当词汇释义和句中译法不完全同字时，仍然能标中最贴切的中文表达。

**Chosen Direction**

采用双路径一致方案：
- LLM `translation-image-highlights` skill 明确改为“语义对齐优先”。
- 本地 fallback helper 同步加入轻量语义候选扩展，避免 runtime skill 不可用时退化回生硬匹配。

**Why This Direction**

- 只改 skill prompt 不够，runtime 失败时仍会回退到本地逻辑并复现旧 bug。
- 只改本地 helper 不够，LLM skill 仍可能输出“看字面、不看句译”的结果。
- 双路径统一规则后，主路径与兜底路径行为一致，用户感知稳定。

**Scope**

- 修改 `.claude/skills/translation-image-highlights/SKILL.md`
- 修改 `server/translation-image-highlights-skill-shim.ts` 的 fallback prompt 文案
- 修改 `src/lib/translation-image-highlights.ts` 的中文候选生成与排序
- 补充回归测试，锁定 `bargain -> 廉价`

**Semantic Matching Rules**

1. 中文高亮目标不是“必须出现 meaning 原词”，而是“在当前句译里，与该英文词在该上下文下最贴切的中文表达”。
2. 优先标注最小准确语义单位：
   - `bargain -> 便宜`，句中译法为“廉价柜台”时，优先标 `廉价`
   - `tempted -> 诱惑`，句中译法为“受不住诱惑”时，优先标 `诱惑`
3. 只有当核心词不足以表达该词含义时，才允许标更长短语。
4. 仍然禁止跨 panel、整句乱标、与其他高亮重叠。

**Fallback Strategy**

本地 helper 不做通用语义推理，而是做“轻量语义候选扩展”：
- 从 `meaning` 中提取核心词
- 为常见中文语义等价表达补充候选，例如 `便宜 -> 廉价`
- 继续复用现有 exact / approximate match 机制

**Verification Targets**

- 当 `meaning = "便宜"` 且 panel 文本出现“廉价柜台”时，中文高亮应为“廉价”
- 已有 `tempted -> 诱惑`、`anchor -> 小锚` 行为不回退
- runtime skill 输出与 fallback 行为方向一致
