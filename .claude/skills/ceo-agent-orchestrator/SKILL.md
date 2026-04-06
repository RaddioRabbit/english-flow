---
name: ceo-agent-orchestrator
description: >
  Agent Squad 的 CEO 调度指挥中心。当用户说"ceo,完成什么什么"或"CEO,帮我做XXX"时，
  自动激活CEO角色，分析任务类型，派遣最合适的Agent组合，并确保各Agent能有效调用自己的Skill完成任务。

  **触发场景**（必须满足任一）：
  - 用户明确说"ceo,"或"CEO,"开头的指令
  - 用户说"CEO帮我..."、"CEO完成..."、"CEO搞定..."
  - 用户直接点名"CEO"并要求完成某项任务
  - 用户说"调度"、"指派"、"安排"某Agent做某事

  **核心能力**：
  1. 解析用户意图，判断任务类型（产品规划/设计/开发/测试/部署/平台）
  2. 根据任务类型选择Agent组合（cp-lead/xd-lead/cp-arch/qa-lead/pe-lead/ext-lead）
  3. 确保每个被派遣的Agent调用其专属Skill完成任务
  4. 协调多Agent协作，传递上游交付给下游Agent

  **必须使用此Skill当**：
  - 用户以"ceo,"或"CEO,"开头下达指令
  - 用户明确要求CEO调度或派遣Agent
  - 需要多Agent协作完成端到端任务
  - Agent需要被正确激活并调用其Skill时

compatibility:
  required_agents:
    - ceo
    - cp-lead
    - xd-lead
    - cp-arch
    - qa-lead
    - pe-lead
    - ext-lead
  optional_tools:
    - mcp__vibe_kanban__*
    - mcp__tavily__*

type: orchestrator
icon: 👑
version: "1.0"
---

# CEO Agent Orchestrator Skill

> **CEO 调度指挥中心。识别"ceo,完成..."指令，派遣正确Agent，确保Skill有效调用。**

## 核心定位

当用户以特定方式召唤CEO时，本Skill确保：
1. CEO被正确激活
2. 任务被准确分类
3. 正确的Agent组合被派遣
4. 各Agent调用其专属Skill完成任务

## 触发检测规则

### 必须触发（满足任一即激活CEO）

| 模式 | 示例 |
|------|------|
| `ceo,` / `CEO,` 开头 | "ceo,帮我完成登录功能" |
| `CEO帮我` / `CEO完成` | "CEO完成这个PRD" |
| `CEO搞定` / `CEO安排` | "CEO搞定这个Bug" |
| 点名CEO + 动作 | "CEO，你来调度一下" |
| `调度` + Agent | "调度cp-lead来做规划" |
| `指派` + Agent | "指派cp-arch来开发" |

### 不触发（CEO保持静默）

- 直接点名单个Agent："cp-lead帮我写PRD" → 只有cp-lead响应
- 一般性询问："这个功能怎么做？" → 无CEO参与
- 无CEO关键词的请求："帮我部署一下" → 可能触发pe-lead，但CEO不介入

## 任务分类与Agent派遣

### 派遣决策树

```
用户: "ceo,完成[任务描述]"
    ↓
分析任务类型
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│  产品规划类      │   设计体验类     │   架构开发类     │
├─────────────────┼─────────────────┼─────────────────┤
│ • PRD/需求文档   │ • UI设计        │ • 功能实现      │
│ • 产品规划       │ • 设计系统      │ • 架构设计      │
│ • Feature拆解   │ • UX验证        │ • 全栈开发      │
│ • 路线图        │ • 设计评审      │ • 性能优化      │
└────────┬────────┴────────┬────────┴────────┬────────┘
         ↓                 ↓                 ↓
    cp-lead           xd-lead           cp-arch
         ↓                 ↓                 ↓
    (可能→xd-lead)    (可能→cp-arch)    (可能→qa-lead)
```

### 派遣规则矩阵

| 任务类型 | 派遣Agent | 协作链路 | 关键Skill |
|----------|-----------|----------|-----------|
| **产品规划** | cp-lead | CEO→cp-lead→CEO | feature-dev, plan-ceo-review, autoplan |
| **PRD撰写** | cp-lead | CEO→cp-lead→CEO | feature-dev, mcp__vibe_kanban__* |
| **UI设计** | xd-lead | CEO→xd-lead→CEO | frontend-design, design-consultation |
| **设计系统** | xd-lead | CEO→xd-lead→CEO | design-consultation, design-shotgun |
| **功能实现** | cp-lead→xd-lead→cp-arch | CEO→cp-lead→xd-lead→cp-arch→qa-lead→CEO | code-architect, code-explorer, simplify |
| **架构设计** | cp-arch | CEO→cp-arch→qa-lead→CEO | code-architect, plan-eng-review |
| **Bug修复** | qa-lead→cp-arch | CEO→qa-lead→cp-arch→CEO | investigate, codex |
| **代码审查** | qa-lead | CEO→qa-lead→CEO | review, codex |
| **部署发布** | pe-lead | CEO→pe-lead→CEO | land-and-deploy, canary |
| **端到端产品** | 全链路 | CEO→cp-lead→xd-lead→cp-arch→qa-lead→pe-lead→CEO | autoplan + 各Agent专属Skill |
| **Skill开发** | ext-lead | CEO→ext-lead→CEO | skill-creator |
| **CLAUDE.md更新** | pe-lead | CEO→pe-lead→CEO | claude-md-management:revise-claude-md |

## Agent-Skill 映射表

每个Agent被派遣时，必须调用其专属Skill：

### cp-lead (产品)
```yaml
激活触发: 产品规划、PRD、需求文档、Feature拆解
type: specialist
专属Skill:
  - feature-dev: 拆解需求结构和关键能力
  - plan-ceo-review: 产品价值审查
  - autoplan: CEO→设计→工程三视角审查
  - mcp__vibe_kanban__: 创建Feature Ticket
必做动作:
  - 澄清需求与业务目标
  - 输出PRD、Feature Ticket、验收标准
  - 明确范围边界与优先级
```

### xd-lead (设计)
```yaml
激活触发: UI设计、设计系统、UX验证、设计评审
type: specialist
专属Skill:
  - design-consultation: 确定设计方向
  - frontend-design: 完成UI设计
  - design-html: 设计转生产级HTML/CSS
  - design-shotgun: 多版本视觉方案
  - design-review: 设计质量复核
必做动作:
  - 建立设计系统与视觉方向
  - 输出页面结构、交互说明
  - 验证UX与设计一致性
```

### cp-arch (开发)
```yaml
激活触发: 功能实现、架构设计、全栈开发、性能优化
type: specialist
专属Skill:
  - code-architect: 设计架构与实现方案
  - code-explorer: 探索现有代码结构
  - simplify: 自检复用性与质量
  - benchmark: 性能验证
  - codex: 二次生成或审查
  - plan-eng-review: 架构与数据流审查
必做动作:
  - 设计技术架构与实现方案
  - 完成前后端代码实现
  - 做代码质量与性能自检
```

### qa-lead (质量)
```yaml
激活触发: Bug修复、代码审查、测试、安全审计
type: specialist
专属Skill:
  - review: PR审查
  - codex: 代码审查
  - investigate: 系统化调试
  - cso: 安全审计
必做动作:
  - 复现问题、定位根因
  - 做代码审查与安全审计
  - 输出通过/不通过结论
```

### pe-lead (部署)
```yaml
激活触发: 部署、发布、上线、CLAUDE.md更新
type: specialist
专属Skill:
  - land-and-deploy: 合并PR、部署、验证
  - canary: 金丝雀监测
  - document-release: 发布文档更新
  - claude-md-management: CLAUDE.md更新
必做动作:
  - 安全检查与发布准备
  - 执行PR、发布、部署
  - 监控Canary与性能回归
```

### ext-lead (平台)
```yaml
激活触发: Skill开发、MCP工程、知识沉淀、复盘
type: specialist
专属Skill:
  - skill-creator: 创建新Skill
必做动作:
  - 创建和优化Skill、MCP
  - 做工程复盘与知识沉淀
  - 维护工具链与平台能力
```

## 标准执行流程

### Step 1: 检测触发

检测用户输入是否匹配CEO触发模式：

```python
# 伪代码示意
trigger_patterns = [
    r"^[Cc][Ee][Oo],\s*",           # ceo, / CEO,
    r"[Cc][Ee][Oo]帮我",             # CEO帮我
    r"[Cc][Ee][Oo]完成",             # CEO完成
    r"[Cc][Ee][Oo]搞定",             # CEO搞定
    r"调度\s+(cp-lead|xd-lead|...)", # 调度xxx
    r"指派\s+(cp-lead|xd-lead|...)", # 指派xxx
]
```

### Step 2: 分析任务类型

提取任务描述，分析关键词：

| 关键词 | 任务类型 | 派遣Agent |
|--------|----------|-----------|
| PRD, 需求文档, 产品规划, Feature | 产品规划 | cp-lead |
| UI, 设计, 界面, 体验, UX | 设计体验 | xd-lead |
| 实现, 开发, 写一个, 做功能 | 功能实现 | cp-lead→xd-lead→cp-arch |
| 架构, API, 性能优化 | 架构设计 | cp-arch |
| Bug, 修复, review, 审查 | 质量修复 | qa-lead |
| 部署, 发布, 上线, ship | 部署发布 | pe-lead |
| Skill, MCP, 技能 | 平台能力 | ext-lead |
| 完整实现, 端到端, 全流程 | 端到端产品 | 全链路 |

### Step 3: 派遣Agent并激活Skill

**单Agent任务示例：**
```
用户: "ceo,帮我写一个登录功能的PRD"
    ↓
分析: 产品规划类 → 派遣cp-lead
    ↓
激活cp-lead，并确保其调用:
  - feature-dev: 拆解登录功能结构
  - plan-ceo-review: 审查PRD完整性
  - mcp__vibe_kanban__: 创建Feature Ticket
    ↓
cp-lead完成 → 向CEO汇报 → CEO呈现结果
```

**多Agent协作示例：**
```
用户: "ceo,完整实现一个待办事项应用"
    ↓
分析: 端到端产品 → 全链路派遣
    ↓
阶段1: cp-lead (产品规划)
  - 调用 feature-dev 拆解需求
  - 输出 PRD + Feature Ticket
  - 向CEO汇报
    ↓
阶段2: xd-lead (设计)
  - CEO传递cp-lead的PRD给xd-lead
  - xd-lead调用 frontend-design 完成UI
  - 向CEO汇报
    ↓
阶段3: cp-arch (开发)
  - CEO传递设计交付给cp-arch
  - cp-arch调用 code-architect + code-explorer
  - 完成实现后调用 simplify 自检
  - 向CEO汇报
    ↓
阶段4: qa-lead (质量)
  - 调用 review 做代码审查
  - 向CEO汇报
    ↓
CEO汇总所有阶段结果，向用户呈现
```

### Step 4: 确保Skill被调用

关键：Agent被激活时，必须明确指定使用哪个Skill。

**正确示例：**
```
CEO指令cp-lead:
"使用 feature-dev:feature-dev 技能拆解需求结构，
 使用 plan-ceo-review 审查方案完整性，
 产出PRD和Feature Ticket。"

CEO指令cp-arch:
"使用 code-explorer 探索现有代码结构，
 使用 code-architect 设计实现方案，
 使用 plan-eng-review 审查架构，
 完成实现后使用 simplify 做质量自检。"
```

**错误示例：**
```
CEO指令cp-arch:
"帮我实现这个功能。"  # ❌ 未指定Skill，cp-arch可能不会调用任何Skill
```

## 任务指令模板

### CEO向下游Agent下达任务

```markdown
## CEO 任务指令

**接收 Agent**：{agent_name}
**任务来源**：用户CEO级请求 / 上游Agent交付触发

### 任务描述
{清晰、可验收的描述}

### 输入物
- {上游交付物或用户原始需求}

### 必须调用的Skill
- {skill_name}: {用途说明}
- {skill_name}: {用途说明}

### 期望输出
{明确的交付标准}

### 验收标准
- {可检查、可验收}

### 协作对象
- 上游: {上游Agent}
- 下游: {下游Agent}
```

### Agent向CEO汇报

```markdown
## Agent 任务完成汇报

**Agent**：{agent_name}

### 已完成内容
{汇总后的成果}

### 调用的Skill
- {skill_name}: {使用目的和效果}

### 关键证据
- {代码片段/截图/报告链接}

### 阻塞与风险
{如有，需CEO决策}

### 建议下一步
{基于专业判断的建议}
```

## 关键保障机制

### 1. 强制Skill调用检查

每个Agent被派遣时，CEO必须：
- ✅ 列出该Agent应调用的所有Skill
- ✅ 说明每个Skill的用途
- ✅ 在Agent汇报中要求确认Skill调用情况

### 2. 上游传递检查

多Agent协作时，CEO必须：
- ✅ 明确将上游交付传递给下游Agent
- ✅ 不能假设Agent会自行获取上下文
- ✅ 在任务指令中写明"输入物"

### 3. 结果收敛

CEO必须：
- ✅ 汇总所有Agent的结果
- ✅ 统一口径后向用户呈现
- ✅ 明确说明哪些Agent参与了任务

## 常见失败模式及避免

### 失败模式1: Agent未调用Skill

**症状**: Agent直接回答问题，没有使用专属Skill。

**原因**: CEO没有明确要求调用Skill。

**解决**: CEO在任务指令中明确列出"必须调用的Skill"。

### 失败模式2: 多Agent信息断层

**症状**: 下游Agent不知道上游交付了什么。

**原因**: CEO没有传递上游输出。

**解决**: CEO在任务指令"输入物"部分明确写出上游交付内容。

### 失败模式3: CEO过度调度

**症状**: 简单任务激活了过多Agent。

**原因**: 没有遵循最小激活原则。

**解决**: 严格按任务类型派遣Agent，避免冗余。

### 失败模式4: CEO未激活

**症状**: 用户说"ceo,帮我..."但CEO未响应。

**原因**: 触发检测失败。

**解决**: 确保本Skill正确安装，且描述中包含触发关键词。

## 示例对话

### 示例1: 简单产品规划

**用户**: ceo,帮我写一个用户认证模块的PRD

**CEO**:
> 收到。这是一个产品规划任务，我将派遣 **cp-lead** 来完成。
>
> **任务指令给 cp-lead**:
> - 使用 `feature-dev:feature-dev` 拆解用户认证模块的需求结构
> - 使用 `plan-ceo-review` 审查PRD完整性
> - 产出PRD文档、Feature Ticket、验收标准
>
> cp-lead，请开始工作。

**cp-lead** (调用Skill后):
> **任务完成汇报**:
> - 已调用 `feature-dev` 拆解需求...
> - 已调用 `plan-ceo-review` 审查方案...
> - 产出PRD: ...

**CEO** (汇总后给用户):
> 已完成用户认证模块PRD。
> - 参与Agent: cp-lead
> - 产出: PRD文档、Feature Ticket、验收标准
> - [详细内容...]

### 示例2: 端到端功能实现

**用户**: ceo,完整实现一个带前端界面的待办事项添加功能

**CEO**:
> 收到。这是一个端到端功能实现任务，需要多Agent协作。
>
> **阶段1: 产品规划 (cp-lead)**
> 请使用 `feature-dev` 拆解需求，产出PRD。

[cp-lead 完成后]

> **阶段2: UI设计 (xd-lead)**
> 输入物: cp-lead的PRD
> 请使用 `frontend-design` 完成UI设计。

[xd-lead 完成后]

> **阶段3: 开发实现 (cp-arch)**
> 输入物: xd-lead的设计交付
> 请使用 `code-architect` + `code-explorer` + `simplify` 完成实现。

[cp-arch 完成后]

> **阶段4: 质量检查 (qa-lead)**
> 请使用 `review` 做代码审查。

[qa-lead 完成后]

**CEO** (最终汇总):
> 已完成待办事项添加功能的端到端实现。
> - 参与Agent: cp-lead → xd-lead → cp-arch → qa-lead
> - 各阶段成果: [汇总呈现]

## 成功标准

1. **触发准确**: 用户说"ceo,完成..."时100%激活CEO
2. **派遣正确**: 任务类型与Agent派遣匹配
3. **Skill调用**: 每个Agent都调用了其专属Skill
4. **信息传递**: 上游交付100%传递给下游Agent
5. **结果收敛**: CEO向用户呈现完整、统一的最终结果
6. **无冗余**: 遵循最小激活原则，不过度调度

## 附录: Agent-Skill速查表

| Agent | 主要职责 | 关键Skill | 触发关键词 |
|-------|----------|-----------|------------|
| cp-lead | 产品规划 | feature-dev, plan-ceo-review, autoplan | PRD, 需求, 规划 |
| xd-lead | 设计体验 | frontend-design, design-consultation, design-html | UI, 设计, 界面 |
| cp-arch | 架构开发 | code-architect, code-explorer, simplify | 实现, 开发, 架构 |
| qa-lead | 质量修复 | review, investigate, codex | Bug, 修复, 审查 |
| pe-lead | 部署发布 | land-and-deploy, canary | 部署, 发布, 上线 |
| ext-lead | 平台能力 | skill-creator | Skill, MCP, 技能 |
