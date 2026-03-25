# 图像生成功能集成完成

## 已完成的工作

### 1. 五个 Subagent 文件 (server/agents/)

| 文件 | 说明 |
|------|------|
| `page11-image-agent.ts` | 句译对照图生成 (6宫格) |
| `page221-image-agent.ts` | 句式分析图生成 (4宫格) |
| `page222-image-agent.ts` | 句式总结图生成 (2宫格) |
| `page31-image-agent.ts` | 词汇解析图生成 (6宫格) |
| `page41-image-agent.ts` | 雅思备考图生成 (4宫格) |
| `index.ts` | Subagent 统一导出 |

### 2. 服务端集成

- `image-generation-service.ts` - 图像生成服务，整合所有 Subagent
- `image-generation-plugin.ts` - Vite 插件，提供 API 端点
- 更新 `vite.config.ts` - 注册图像生成插件

### 3. 前端客户端

- `src/lib/image-generation-client.ts` - API 客户端
- `src/lib/use-image-generation.ts` - React Hook
- `src/lib/image-generation-example.ts` - 使用示例

### 4. 更新 task-store.ts

添加了 `updateTaskGeneratedImages` 函数用于更新生成后的图片

## 提示词来源

所有 Subagent 的提示词模板都基于参考文件：
- `public/ref/english_page1_1_agent.js` → `page11-image-agent.ts`
- `public/ref/english_page2_2_1_agent.js` → `page221-image-agent.ts`
- `public/ref/english_page2_2_2_agent.js` → `page222-image-agent.ts`
- `public/ref/english_page3_1_agent.js` → `page31-image-agent.ts`
- `public/ref/english_page4_1_agent.js` → `page41-image-agent.ts`

## API 端点

- `POST /api/image-generation/generate` - 单张图片生成
- `POST /api/image-generation/batch` - 批量图片生成

## 数据流

```
用户确认文本 → 前端调用 API → Vite 插件路由 → Image Generation Service
                                                           |
        +--------------------------------------------------+
        |
        v
+-------------------+  +-------------------+  +-------------------+
| page11-agent      |  | page221-agent     |  | page222-agent     |
| (句译对照)         |  | (句式分析)         |  | (句式总结)         |
+-------------------+  +-------------------+  +-------------------+
        |                       |                       |
        v                       v                       v
+-------------------+  +-------------------+  +-------------------+
| page31-agent      |  | page41-agent      |  | skill:aifast-...  |
| (词汇解析)         |  | (雅思备考)         |  | (图像生成)         |
+-------------------+  +-------------------+  +-------------------+
```

## 下一步工作

### 1. Skill 配置

需要在 `.claude/skills/aifast-image-generation/` 目录下配置 Skill：

```
.claude/skills/aifast-image-generation/
├── SKILL.md
└── scripts/
    └── generate_image.py
```

### 2. 前端页面集成

在 `TaskExecution.tsx` 页面中使用 `useImageGeneration` Hook：

```typescript
import { useImageGeneration } from "@/lib/use-image-generation";

function TaskExecution() {
  const task = useTask(taskId);
  const { state, generateImages } = useImageGeneration();

  const handleGenerate = async () => {
    if (task) await generateImages(task);
  };

  // ...
}
```

### 3. 测试

1. 确保文本解析正常工作
2. 在编辑页面确认文本内容
3. 点击生成图片按钮
4. 验证五张图片是否成功生成

## 文件清单

### 新建文件
- `server/agents/page11-image-agent.ts`
- `server/agents/page221-image-agent.ts`
- `server/agents/page222-image-agent.ts`
- `server/agents/page31-image-agent.ts`
- `server/agents/page41-image-agent.ts`
- `server/agents/index.ts`
- `server/agents/README.md`
- `server/image-generation-service.ts`
- `server/image-generation-plugin.ts`
- `src/lib/image-generation-client.ts`
- `src/lib/use-image-generation.ts`
- `src/lib/image-generation-example.ts`
- `IMAGE_GENERATION_SETUP.md`

### 修改文件
- `vite.config.ts` - 添加 imageGenerationApiPlugin
- `src/lib/task-store.ts` - 添加 updateTaskGeneratedImages 函数

## 技术栈

- **框架**: React 18 + Vite 5 + TypeScript
- **图像生成**: AIFAST Gemini 3.1 Flash Image (via Skill)
- **状态管理**: localStorage + React Hooks
- **API**: Vite Dev Server Middleware
