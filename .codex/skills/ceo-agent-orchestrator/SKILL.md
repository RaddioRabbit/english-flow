---
name: ceo-agent-orchestrator
description: Use when the user explicitly invokes CEO or asks CEO to dispatch, coordinate, or sequence agents in this project's configured agent squad.
---

# CEO Agent Orchestrator

## Overview

This skill keeps CEO orchestration aligned with the actual project runtime.

Source of truth order:
1. `.codex/config.toml`
2. `.codex/agents/*.toml`
3. `.codex/hooks.json` and `.codex/hooks/*`
4. This skill

Do not invent agent names, skill names, alias syntax, or agent-to-agent chains that are not backed by those files.

## Runtime Contract

From `.codex/config.toml`:
- `max_threads = 6`
- `max_depth = 1`

Implications:
- CEO can dispatch specialist agents.
- Specialist agents should use their own skills, not dispatch more agents.
- Any handoff between specialists must come back to CEO first.
- Multi-stage work follows `CEO -> specialist -> CEO -> next specialist`.

## When CEO Activates

Activate CEO only when one of these is true:
- the user starts with `ceo,` or `CEO`
- the user explicitly asks CEO to coordinate, dispatch, or arrange work
- the user uses `调度` / `指派` / `安排` together with an agent name

Do not activate CEO when the user directly addresses a specialist and does not mention CEO.

## CEO: Stay Local Or Dispatch

CEO should stay local and use CEO's own skills when the task is mainly:
- strategy, scope, prioritization, or tradeoff review
- plan review or cross-functional alignment
- deciding the minimum agent set
- synthesizing outputs from multiple agents

CEO should dispatch specialists when specialist execution is required:
- `cp-lead`: PRD, product planning, requirement clarification
- `xd-lead`: UI, UX, design system, interaction design
- `cp-arch`: implementation, architecture, debugging, technical verification
- `qa-lead`: QA, bug triage, review, security, root cause analysis
- `pe-lead`: ship, deploy, release, canary, release docs
- `ext-lead`: skills, plugins, MCP, hooks, tooling, retros

Default routing must match `agents/ceo.toml`:
- feature implementation / develop a feature: `xd-lead`, `cp-arch`
- PRD / requirement doc / product planning: `cp-lead`
- build a whole product / from scratch: `cp-lead`, `xd-lead`, `cp-arch`
- bug / review / security / testing / root cause: `qa-lead`
- deploy / release / ship: `pe-lead`
- skills / MCP / hooks / plugins / tooling: `ext-lead`

Do not over-activate QA or deploy agents when the user did not ask for those phases.

## CEO's Own Skills

CEO may only claim or request the skills actually configured in `agents/ceo.toml`:

- default: `office-hours`, `plan-ceo-review`, `plan-design-review`, `plan-eng-review`, `autoplan`, `pua`, `learn`
- conditional: `web-access`

If CEO can solve the request with these skills alone, do that instead of dispatching.

## Specialist Skill Map

When CEO dispatches, name only skills that actually exist in the recipient agent's TOML.

### `cp-lead`

- default: `office-hours`, `plan-ceo-review`, `autoplan`
- conditional: `linear:linear`, `notion:notion-spec-to-implementation`, `plan-design-review`, `plan-eng-review`, `web-access`

### `xd-lead`

- default: `design-consultation`, `design-shotgun`, `design-review`, `plan-design-review`, `design-html`, `browse`, `qa-only`
- conditional: `build-web-apps:frontend-skill`, `build-web-apps:web-design-guidelines`, `figma:figma-implement-design`, `figma:figma-use`, `imagegen`

### `cp-arch`

- default: `browse`, `benchmark`, `codex`, `investigate`, `writing-plans`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `verification-before-completion`
- conditional: `openai-docs`, `build-web-apps:react-best-practices`, `build-web-apps:shadcn-best-practices`, `cloudflare:workers-best-practices`, `cloudflare:agents-sdk`, `vercel:nextjs`, `vercel:ai-sdk`

### `qa-lead`

- default: `qa`, `qa-only`, `browse`, `gstack`, `investigate`, `review`, `cso`, `setup-browser-cookies`, `connect-chrome`, `guard`, `systematic-debugging`, `receiving-code-review`, `verification-before-completion`
- conditional: `github:gh-fix-ci`, `sentry:sentry`, `codex`, `web-access`

### `pe-lead`

- default: `ship`, `review`, `land-and-deploy`, `setup-deploy`, `canary`, `document-release`, `benchmark`, `careful`, `guard`, `freeze`, `unfreeze`, `finishing-a-development-branch`, `verification-before-completion`
- conditional: `vercel-deploy`, `render-deploy`, `netlify-deploy`, `cloudflare-deploy`, `github:gh-address-comments`, `github:gh-fix-ci`, `web-access`

### `ext-lead`

- default: `skill-creator`, `plugin-creator`, `skill-installer`, `find-skills`, `gstack-upgrade`, `learn`, `retro`, `web-access`, `using-superpowers`, `writing-skills`
- conditional: `openai-docs`, `cloudflare:building-mcp-server-on-cloudflare`, `cloudflare:agents-sdk`, `codex`, `claude-code`

Never output stale or unsupported names such as `feature-dev`, `frontend-design`, `code-architect`, `code-explorer`, `simplify`, `claude-md-management`, or alias forms like `feature-dev:feature-dev`.

## Hook Awareness

Shared hooks apply to the whole project:
- `.codex/hooks/session-start.py` injects the `using-superpowers` reminder at session start
- `.codex/hooks.json` wires the shared hooks
- `.codex/hooks/figma-post-tool-use.sh` adds a Figma parity reminder after UI-related `Write` or `Edit`

CEO does not need to restate hook internals, but should require a parity recheck when `xd-lead` or `cp-arch` changes UI.

## Dispatch Rules

Every CEO dispatch message should contain:
- selected agent
- why that agent was selected
- concrete task description
- input artifacts from the user or previous stage
- acceptance criteria
- exact existing skills to use
- any conditional skill triggers
- an explicit instruction to report back to CEO instead of dispatching another agent

Use exact skill names from `agents/*.toml`. Do not tell an agent to "use all skills"; name the relevant subset.

## Dispatch Template

```markdown
## CEO Dispatch

Agent: {agent}
Why: {why this agent is the minimum valid choice}
Task: {concrete deliverable}

Inputs:
- {user request}
- {upstream artifacts}

Use these existing skills:
- {default skill}
- {default skill}

Conditional skills if triggered:
- {conditional skill}: {trigger}

Acceptance:
- {observable output}
- {risks or decisions called out explicitly}

Constraint:
- Do not dispatch other agents.
- Because `max_depth = 1`, report back to CEO for the next handoff.
```

## Failure Modes

- CEO activates on a direct specialist request that did not mention CEO
- CEO tells an agent to use a skill name that is not in that agent's TOML
- a specialist tries to dispatch another specialist directly
- CEO routes a simple feature through `cp-lead` even though `agents/ceo.toml` says the default path is `xd-lead` plus `cp-arch`
- UI work finishes without acknowledging the Figma parity reminder

## Examples

### CEO Handles The Work Locally

User:
```text
ceo,帮我判断这个 AI SaaS 方向值不值得做
```

CEO:
```text
我先留在 CEO 角色本地处理，使用 `office-hours` 和 `plan-ceo-review` 做方向判断；当前不派遣其他 agent。
```

### CEO Dispatches Product Planning

User:
```text
ceo,帮我写一个登录功能的 PRD
```

CEO:
```text
我会派遣 `cp-lead`，因为这是产品规划任务。

Use these existing skills:
- `office-hours`
- `plan-ceo-review`
- `autoplan`（如果需求范围扩大）

Constraint:
- 不要继续派遣其他 agent，先把结果汇报给 CEO。
```

### CEO Runs A Multi-Stage Feature Flow

User:
```text
ceo,实现一个带表单校验的登录页
```

CEO phase 1:
```text
派遣 `xd-lead` 完成结构和交互说明。
Use these existing skills:
- `design-consultation`
- `plan-design-review`（如果需要设计复核）
```

CEO phase 2:
```text
收到设计结果后，我再派遣 `cp-arch` 进入实现。
Use these existing skills:
- `writing-plans`
- `test-driven-development`
- `systematic-debugging`
- `verification-before-completion`
Conditional:
- `vercel:nextjs`（如果这是 Next.js App Router 项目）
```

## Success Criteria

- CEO only activates on explicit CEO-style triggers
- CEO uses its own skills when local handling is enough
- CEO dispatches only configured agents
- dispatched agents are told to use only skills that exist in their TOML
- all specialist-to-specialist handoffs go back through CEO
- hook-driven UI verification is not forgotten
