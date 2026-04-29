# English Flow Agent

英语句子分析与教育内容生成工具。输入一句英语，自动解析并生成翻译对照、语法分析、词汇解析、雅思备考等模块化学习材料，以条漫风格图片呈现。

## 功能

- **句译对照图** — 句子翻译与对照，带中英文词汇标注
- **句式分析图** — 语法结构与详细解析
- **句式总结图** — 结构归纳总结
- **词汇解析图** — 重点词汇卡片（词性、释义、例句）
- **雅思备考图** — IELTS 写作/口语技巧
- **句子讲解文章** — 带 TTS 语音的完整讲解文章
- **视频合成** — 将讲解图片与语音合成为 MP4 视频
- **小红书分析** — 生成小红书风格的英语原著句子深度解析
- **文字风格迁移** — 将参考图上的文字风格迁移到目标图

## 技术栈

- Vite 5 + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- React Query (TanStack Query) + localStorage / IndexedDB
- React Router DOM
- Playwright + Vitest

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/RaddioRabbit/english-flow.git
cd english-flow
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# ============================================
# LLM API 配置（文本分析、句子讲解、小红书分析）
# 支持 Anthropic 兼容、OpenAI 兼容、Kimi 等多种格式
# ============================================

# 通用配置（推荐）
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.your-provider.com/v1
LLM_MODEL=your-model-name

# 或 Anthropic 格式
ANTHROPIC_API_KEY=your-api-key
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=claude-sonnet-4-6

# 或 OpenAI 格式
OPENAI_API_KEY=your-api-key
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o

# 或 Kimi
Kimi_API_KEY=your-api-key
Kimi_API_BASE=https://api.kimi.com/coding
Kimi_MODEL=kimi-for-coding

# 可选：超时与重试
LLM_TIMEOUT_MS=60000
LLM_MAX_RETRIES=2

# ============================================
# TTS 配置（句子讲解语音合成，使用 MiniMax）
# ============================================
MINIMAX_API_KEY=your-minimax-key
MINIMAX_BASE_URL=https://api.minimax.chat

# 可选：TTS 超时与并发
SENTENCE_EXPLANATION_TTS_TIMEOUT_MS=30000
SENTENCE_EXPLANATION_TTS_MAX_RETRIES=3
SENTENCE_EXPLANATION_TTS_CONCURRENCY=2

# ============================================
# Supabase 配置（可选，用于图片云存储）
# 不配置则使用本地 IndexedDB 存储
# ============================================
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. 启动开发服务器

```bash
npm run dev
```

打开浏览器访问 **http://localhost:8081**

### 5. 构建生产版本

```bash
npm run build
```

构建产物输出到 `dist/` 目录。

### 6. 本地预览生产构建

```bash
npm run preview
```

## 部署

本项目使用 Vite 自定义插件提供后端 API 路由（`/api/*`），**需要 Node.js 服务器运行**，不能作为纯静态站点部署。

### 推荐部署平台

| 平台 | 说明 |
|------|------|
| **Vercel** | 支持 Serverless Functions，可直接部署 |
| **Railway** | 原生支持 Node.js 应用 |
| **Render** | 原生支持 Node.js 应用 |
| **自有服务器** | 使用 PM2 / Docker 运行 |

### Docker 部署示例

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8081
CMD ["npx", "vite", "preview", "--port", "8081", "--host"]
```

### 环境变量清单

| 变量名 | 必填 | 说明 |
|--------|------|------|
| `LLM_API_KEY` | 是* | LLM API 密钥 |
| `LLM_BASE_URL` | 是* | LLM API 基础地址 |
| `LLM_MODEL` | 否 | 模型名称 |
| `ANTHROPIC_API_KEY` | 是* | Anthropic API 密钥 |
| `ANTHROPIC_BASE_URL` | 是* | Anthropic API 地址 |
| `OPENAI_API_KEY` | 是* | OpenAI API 密钥 |
| `OPENAI_API_BASE` | 是* | OpenAI API 地址 |
| `Kimi_API_KEY` | 是* | Kimi API 密钥 |
| `Kimi_API_BASE` | 是* | Kimi API 地址 |
| `MINIMAX_API_KEY` | 否 | TTS 语音合成密钥 |
| `MINIMAX_BASE_URL` | 否 | MiniMax API 地址 |
| `VITE_SUPABASE_URL` | 否 | Supabase 项目地址 |
| `VITE_SUPABASE_ANON_KEY` | 否 | Supabase 匿名密钥 |

> *只需配置一组 LLM 认证信息即可，优先级：`LLM_*` > `ANTHROPIC_*` > `OPENAI_*` > `Kimi_*`

## 使用指南

### 基础流程

1. **创建任务** — 在首页输入英语原句、书名、作者
2. **文本解析** — 系统自动调用 LLM 解析句子结构
3. **编辑内容** — 在编辑页调整解析结果（翻译、语法、词汇等）
4. **生成图片** — 为每个模块生成条漫风格图片
5. **查看结果** — 在结果页浏览所有生成的图片

### 句子讲解

1. 在任务页面点击「生成句子讲解」
2. 系统生成带语音的文章（需要配置 MiniMax API）
3. 在 `/explanation/:taskId` 页面查看文章并播放语音
4. 可导出为 MP4 视频（`/explanation/:taskId/video`）

### 小红书分析

在任务执行页面底部，输入书名和作者，生成小红书风格的英语原著句子解析文案。

## 开发命令

```bash
npm run dev          # 开发服务器（端口 8081）
npm run build        # 生产构建
npm run build:dev    # 开发模式构建
npm run preview      # 预览生产构建
npm run test         # 运行测试
npm run test:watch   # 测试监听模式
npm run lint         # ESLint 检查
```

## 项目结构

```
├── src/
│   ├── components/ui/     # shadcn/ui 组件库
│   ├── lib/               # 核心工具与业务逻辑
│   ├── pages/             # 页面组件
│   └── test/              # 测试文件
├── server/                # Vite 插件 API 路由
│   ├── agents/            # 图片生成子代理
│   └── *.ts               # 各功能插件
├── public/                # 静态资源
├── .claude/skills/        # Claude Code AI 技能
└── docs/                  # 文档
```

## License

MIT
