# Translation Image Background Color Design

**Date:** 2026-04-07

**Goal**

将“句译对照图”的整图最外层背景色从 `#1e1f2e` 调整为 `#fbf2d5`，其余视觉元素保持不变。

**Chosen Direction**

采用最小改动方案：
- 仅修改 `src/lib/translation-image-svg.ts` 中的整图背景色常量。
- 不引入新的配置参数，不改调用链。

**Why This Direction**

- 当前背景色由单一常量控制，直接替换即可覆盖所有通过该 SVG helper 生成的“句译对照图”。
- 用户要求是固定换色，不需要额外抽象。
- 变更面最小，回归风险最低。

**Scope**

- 仅修改“句译对照图”最终 SVG 的最外层底板颜色。
- 保持以下元素不变：
  - 四个文本面板底色与边框
  - 文本颜色与高亮颜色
  - 底部场景图区域及其 fallback 渐变

**Out of Scope**

- 不新增主题配置或颜色参数透传。
- 不调整面板布局、字体、描边或高亮逻辑。
- 不修改其他模块的图片生成样式。

**Implementation Boundary**

- 修改 `src/lib/translation-image-svg.ts` 中的 `C_BG` 常量值。
- 在 `src/test/translation-image-svg.test.ts` 中补充断言，验证生成的 SVG 包含新的背景色值。

**Verification Targets**

- 生成的 SVG 包含 `#fbf2d5` 作为整图背景色。
- 现有高亮与场景图相关测试继续通过。
