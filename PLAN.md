<!-- /autoplan restore point: /Users/mima0000/.gstack/projects/alpsFOREST-english_flow_ai_04/main-autoplan-restore-20260331-164529.md -->
# 文字风格迁移编辑器功能

## 目标

在 http://localhost:8080/ 新增一个独立页面，用户可以：
1. 上传一张参考图（Reference Image，提供文字风格来源）
2. 上传一张目标图（Target Image，背景图，文字将被迁移到此图上）
3. 在下方输入 prompt（补充迁移指令）
4. 点击"更改"按钮，调用 `aifast-text-transfer-editor` skill（通过 `transform.py` 脚本），生成迁移后的图片
5. 在页面上显示生成结果图

## 技术方案

遵循现有的 Client/Service/Plugin 模式（与 `aifast-image-skill-shim` 对齐）：

### 新增文件

1. **`server/text-transfer-skill-shim.ts`**
   - 类似 `aifast-image-skill-shim.ts`，封装对 `transform.py` 的调用
   - 接收 `ref_image`（参考图 data URL）、`target_image`（目标图 data URL）、`prompt` 三个参数
   - 写临时文件 → 调用 `python .claude/skills/aifast-text-transfer-editor/scripts/transform.py` → 读取输出 → 返回 `image_data_url`
   - 注册为 runtime skill `aifast-text-transfer-editor`

2. **`server/text-transfer-plugin.ts`**
   - Vite plugin，注册 POST `/api/text-transfer` 路由
   - 接收 `{ refImage, targetImage, prompt }` JSON body
   - 调用 shim，返回 `{ image_data_url }`

3. **`src/lib/text-transfer-client.ts`**
   - 前端 fetch wrapper：`POST /api/text-transfer`
   - 返回 `{ image_data_url: string }`

4. **`src/pages/TextTransferPage.tsx`**
   - 两个图片上传区域（参考图、目标图），可预览
   - Prompt textarea（提示：可选，用于补充修改指令）
   - "开始迁移" 按钮（loading 状态时禁用并显示 spinner）
   - 结果图显示区 + 下载按钮
   - 使用现有 shadcn/ui 组件和 gold/ink 主题

### 修改文件

5. **`vite.config.ts`**
   - 引入并注册 `textTransferApiPlugin`

6. **`src/App.tsx`**
   - 添加路由 `/text-transfer` → `<TextTransferPage />`

7. **`src/components/AppLayout.tsx`（或导航组件）**
   - 在导航栏添加"文字迁移"入口链接

## 数据流

```
User uploads ref + target images as data URLs (base64)
  → POST /api/text-transfer { refImage, targetImage, prompt }
  → text-transfer-plugin.ts parses body
  → text-transfer-skill-shim.ts writes temp files, spawns python script
  → transform.py calls AIFAST API, writes output PNG
  → shim reads output, returns image_data_url
  → frontend renders result image
```

## 关键发现（CEO Review + 外部视角）

1. **[HIGH] 结构化 prompt 表单** — 不能暴露 bare textarea 给用户。用户不知道参考图里的原始文字内容，也不了解 SKILL.md 要求的四要素结构。改为：前端提供"参考图原始文字"和"目标文字"两个字段（可选补充说明），server-side shim 自动拼接标准 prompt。textarea 作为"高级模式"保留。
2. **[HIGH] 生成超时 UX** — `transform.py` 设置 `timeout=300`（5分钟）。前端需显示实时计时器（"生成中... 已等待 Xs"），并在 90s 时显示提示："生成时间较长，请耐心等待或稍后重试"。后端 AbortController 设 120s。
3. **[HIGH] 图片大小限制** — 两张图 base64 POST 可达 12-16MB+。前端检测图片 base64 长度，超过 3MB 单张时提示压缩。plugin 的 `readJsonBody` 添加 20MB 最大限制。
4. **[MEDIUM] 宽高比选择器** — 硬编码 `16:9`/`2K` 对每日打卡场景（竖版）不合适。加入 ratio 选择器：16:9 / 9:16 / 1:1 / 3:4，默认 16:9。
5. **[MEDIUM] contract.ts** — 遵循项目 contract-first 模式，新增 `src/lib/text-transfer-contract.ts` 定义 `TextTransferRequest` 和 `TextTransferResult` 接口。
6. **[MEDIUM] Python 依赖检查** — shim 安装时（`installTextTransferSkillShim()`）验证 python 可调用，否则 console.warn 并 skip 注册，避免运行时静默失败。
7. **[MEDIUM] 导航位置** — 待 TASTE DECISION（见下方 Phase 4 审批）。
8. **[MEDIUM] Body size guard** — plugin 的 readJsonBody 同现有实现一致，但加 20MB 上限。
9. **[LOW] 基础测试** — 新增 `src/test/text-transfer-shim.test.ts`，mock python subprocess，验证 data URL 输入/输出 round-trip。

## 约束

- `AIFAST_API_KEY` 在 `.env.local` 中设置（现有 skill 已使用，无需额外配置）
- 图片大小：前端单张超 3MB base64 时提示；plugin 层 20MB POST 上限
- ratio：前端提供 16:9 / 9:16 / 1:1 / 3:4 选择器，默认 16:9；size 固定 2K
- 错误处理：API 失败显示 toast 错误；90s 超时显示等待提示；120s 后中断请求
- Prompt：结构化表单（原始文字 + 目标文字 + 可选补充），server-side 拼接标准 prompt

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Use Approach B (complete plan with ratio/size) | P1 | Completeness: A=6/10, B=9/10; delta is ~30 LOC | Approach A (minimal) |
| 2 | CEO | Add structured prompt form (2 fields + advanced textarea) | P1 | Users can't construct 4-part prompt; degraded output otherwise | Bare textarea only |
| 3 | CEO | Add elapsed-time counter + 90s warning + 120s timeout | P1 | 300s spinner = broken UX; user will reload and lose state | No timeout |
| 4 | CEO | Add per-image 3MB client check + 20MB plugin guard | P1 | Two images can exceed 12MB; false analogy to existing single-image flow | Unbounded |
| 5 | CEO | Add ratio selector (16:9/9:16/1:1/3:4) | P1 | Daily card use case is portrait; hardcoded 16:9 wrong for stated use case | Hardcoded only |
| 6 | CEO | Add text-transfer-contract.ts | P5 | CLAUDE.md mandates contract-first; explicit > implicit | Skip contract |
| 7 | CEO | Add Python dep startup check | P1 | Silent spawn failure = opaque UX; warn at server start | No check |
| 8 | CEO | Add shim unit test | P1 | Shim is riskiest unit (tempfile + subprocess); no tests = no confidence | No tests |
| 9 | CEO→Gate | Nav: 顶级导航（用户选择 A） | User decision | 独立工具，顶级入口更易发现 | result-page-only |
| 10 | Eng | Extract shared python runner to `server/python-runner.ts` | P4 | Two shims (aifast-image + text-transfer) share near-identical spawn logic | Duplicate code |
| 11 | Eng | Add text-transfer-shim.test.ts (5 unit tests) | P1 | Shim covers spawn lifecycle, temp cleanup, error paths | No tests |
| 12 | Eng | Add text-transfer-plugin.test.ts (3 unit tests) | P1 | Plugin validates input; needs 400/405/500 coverage | No tests |
| 13 | Eng | Defer E2E test to follow-up | P3 | Consistent with existing practice; unit tests cover core risk | E2E now |
| 14 | Design | Upload zones: raw div with dashed border, not Card | P5 | shadcn Card = generic; custom border = intentional | Card wrapper |
| 15 | Design | Result section hidden until success (no empty state needed) | P5 | Section only appears post-generation; avoids "暂无结果" | Show empty |
| 16 | Design | Drag-and-drop deferred to follow-up | P3 | Click-to-select covers core flow; drag-drop is progressive enhancement | Drag-drop now |

## 新增文件（修订版）

1. **`server/python-runner.ts`** [NEW] — 共享 Python subprocess 执行器，提取自现有 shim 逻辑
2. **`server/text-transfer-skill-shim.ts`** [NEW] — 注册 `aifast-text-transfer-editor` runtime skill；使用 `python-runner.ts`；含 Python dep 检查；server-side prompt 构建
3. **`server/text-transfer-plugin.ts`** [NEW] — POST `/api/text-transfer`；body 大小限制 20MB；字段验证
4. **`src/lib/text-transfer-contract.ts`** [NEW] — `TextTransferRequest` / `TextTransferResult` 类型
5. **`src/lib/text-transfer-client.ts`** [NEW] — 前端 fetch wrapper，含 120s AbortController timeout
6. **`src/pages/TextTransferPage.tsx`** [NEW] — 见 UI 规格（下方）
7. **`src/test/text-transfer-shim.test.ts`** [NEW] — 5 unit tests
8. **`src/test/text-transfer-plugin.test.ts`** [NEW] — 3 unit tests

## UI 规格（TextTransferPage）

```
页面标题：文字风格迁移
副标题：上传参考图和目标图，迁移文字风格

─── 上传区（flex row，mobile: stack）───────────────
  [参考图上传区]           [目标图上传区]
  dashed border-2          dashed border-2
  border-gold/30           border-gold/30
  rounded-xl               rounded-xl
  "文字风格来源"           "背景图"
  上传后显示 preview       上传后显示 preview

─── 文字表单────────────────────────────────────────
  Label: 参考图文字内容（帮助模型理解样式）
  Input: placeholder="e.g. Day 01 · 读《鲁滨逊漂流记》学英语"
  Label: 目标文字（最终渲染的文字内容）
  Input: placeholder="e.g. Day 05 · 读《鲁滨逊漂流记》学英语"
  Label: 补充说明（可选）
  Textarea: 3行

─── 宽高比选择器────────────────────────────────────
  [16:9] [9:16] [1:1] [3:4]  ← pill group，16:9 默认选中

─── 提交按钮────────────────────────────────────────
  [        开始迁移        ]  full-width, gradient-ink
  disabled when: either image missing
  loading: spinner + "生成中... 已等待 Xs" (秒数实时递增)
  90s+: 追加 "（生成时间较长，请耐心等待）"

─── 结果区（hidden until success）──────────────────
  生成结果
  [generated image, full-width]
  [下载图片]  ← 触发 anchor download
```

交互状态表：
| 元素 | Loading | Empty/Initial | Error | Success |
|------|---------|---------------|-------|---------|
| 上传区 | — | dashed + icon | toast "格式/大小错误" | thumbnail preview |
| 提交按钮 | disabled+spinner+timer | disabled | — | — |
| 结果区 | hidden | hidden | — | slide in |
| 错误 | — | — | sonner toast + "重试" | — |

键盘顺序：ref upload → target upload → refText → targetText → supplement → ratio pills → submit → (after result) download

## NOT in scope（本次 PR 明确不做）

- 图片历史记录 / 生成记录
- 拖拽上传（drag-and-drop）
- 图片裁剪 / 压缩工具
- 批量处理
- E2E 测试（Playwright）
- 首页入口（通过完成的 task result 页进入 — 见 TASTE DECISION）

## GSTACK REVIEW REPORT

| Review | Trigger | Runs | Status | Key Findings |
|--------|---------|------|--------|--------------|
| CEO Review | `/plan-ceo-review` | 1 | issues_found | 结构化prompt表单、超时UX、图片大小限制、ratio选择器、contract.ts |
| CEO Voices | subagent only | 1 | issues_found | 10 findings from Claude subagent; Codex unavailable |
| Design Review | `/plan-design-review` | 1 | issues_found | IA diagram added, state table added, a11y specs added; mockups unavailable (no OpenAI key) |
| Design Voices | unavailable | 0 | — | Auth error (403) |
| Eng Review | `/plan-eng-review` | 1 | issues_found | DRY violation (python-runner.ts), 8 new unit tests, type safety |
| Eng Voices | unavailable | 0 | — | Auth error (403) |

**VERDICT:** REVIEWED — 1 TASTE DECISION remaining (nav placement). 16 auto-decisions made. Ready for implementation after gate approval.
