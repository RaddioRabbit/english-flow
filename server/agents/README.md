# 图像生成 Subagent 架构

## 概述

本项目包含五个图像生成 Subagent，分别负责生成五种类型的英语教学条漫图片。

## Subagent 列表

| 文件 | 模块 | 功能 | 宫格数 | 输入数据 |
|------|------|------|--------|----------|
| `page11-image-agent.ts` | translation | 句译对照图 | 6宫格 | prompt1-4 + 书名 + 原句 |
| `page221-image-agent.ts` | grammar | 句式分析图 | 4宫格 | grammarAnalysis + 原句 |
| `page222-image-agent.ts` | summary | 句式总结图 | 2宫格 | grammarAnalysis + 原句 |
| `page31-image-agent.ts` | vocabulary | 词汇解析图 | 6宫格 | vocabulary[6] |
| `page41-image-agent.ts` | ielts | 雅思备考图 | 4宫格 | ieltsTips |

## 架构流程

```
前端页面
    |
    v
useImageGeneration Hook
    |
    v
image-generation-client.ts
    |
    v
Vite Dev Server API
    |
    v
image-generation-plugin.ts
    |
    v
image-generation-service.ts (路由分发)
    |
    +---> page11-image-agent.ts (句译对照)
    +---> page221-image-agent.ts (句式分析)
    +---> page222-image-agent.ts (句式总结)
    +---> page31-image-agent.ts (词汇解析)
    +---> page41-image-agent.ts (雅思备考)
    |
    v
skill:aifast-image-generation
    |
    v
AIFAST Gemini 3.1 Flash Image API
```

## 提示词结构

每个 Subagent 的提示词构建分为两个阶段：

1. **提示词准备阶段**：根据输入数据构建专门的图像生成提示词
2. **最终提示词组装**：将专用提示词与格式要求、排除项等组合

### 提示词模板来源

所有提示词模板均来自参考文件：
- `public/ref/english_page1_1_agent.js`
- `public/ref/english_page2_2_1_agent.js`
- `public/ref/english_page2_2_2_agent.js`
- `public/ref/english_page3_1_agent.js`
- `public/ref/english_page4_1_agent.js`

## 使用方式

### 方式 1: 使用 React Hook

```typescript
import { useImageGeneration } from "@/lib/use-image-generation";

function MyComponent({ task }) {
  const { state, generateImages } = useImageGeneration();

  const handleGenerate = async () => {
    await generateImages(task);
  };

  return (
    <button onClick={handleGenerate} disabled={state.isGenerating}>
      生成图片
    </button>
  );
}
```

### 方式 2: 直接调用客户端 API

```typescript
import { generateImagesBatch } from "@/lib/image-generation-client";

const response = await generateImagesBatch({
  taskId: task.id,
  modules: ["translation", "grammar", "vocabulary"],
  textContent: task.textContent,
  bookName: task.bookName,
  originSentence: task.sentence,
  referenceImages: task.referenceImages,
});
```

## API 端点

### 单张图片生成
- **POST** `/api/image-generation/generate`
- 请求体：`

{

  "taskId": "...",
  "moduleId": "translation",
  "textContent": { ... },
  "bookName": "...",
  "originSentence": "...",
  "referenceImage": "data:image/..."
}

`

### 批量图片生成
- **POST** `/api/image-generation/batch`
- 请求体：`

{
  "taskId": "...",
  "modules": ["translation", "grammar"],
  "textContent": { ... },
  "bookName": "...",
  "originSentence": "...",
  "referenceImages": { ... }
}

`

## 数据流

1. 用户在编辑页面确认文本内容
2. 点击"生成图片"按钮触发图像生成流程
3. 前端通过 API 将任务数据发送到服务端
4. 服务端根据模块类型分发到对应的 Subagent
5. Subagent 构建专门的图像生成提示词
6. 调用 `skill:aifast-image-generation` 生成图片
7. 返回生成的图片数据 URL
8. 前端更新任务状态并显示生成的图片

## 扩展说明

### 添加新的图片类型

1. 在 `server/agents/` 创建新的 agent 文件
2. 在 `image-generation-service.ts` 添加路由逻辑
3. 在 `task-store.ts` 添加新的 ModuleId（如需要）

### 修改提示词

直接编辑对应 agent 文件中的 `buildFinalPrompt` 函数，保持与参考文件的一致性。
