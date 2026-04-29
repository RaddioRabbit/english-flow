# English Flow Agent

英语句子分析与教育内容生成工具。输入一句英语，自动解析并生成翻译对照、语法分析、词汇解析、雅思备考等模块化学习材料，以条漫风格图片呈现。

## 功能

- **句译对照图** — 句子翻译与对照
- **句式分析图** — 语法结构与解析
- **句式总结图** — 结构归纳总结
- **词汇解析图** — 重点词汇卡片
- **雅思备考图** — IELTS 相关技巧
- **句子讲解文章** — 带 TTS 语音的完整讲解
- **视频合成** — 将讲解图片与语音合成为视频

## 技术栈

- Vite 5 + React 18 + TypeScript
- Tailwind CSS + shadcn/ui
- React Query + localStorage
- Playwright + Vitest

## 开发

```bash
npm i
npm run dev    # http://localhost:8080
npm run build
npm run test
```

## 环境变量

创建 `.env.local`：

```
ANTHROPIC_API_KEY=sk-...
ANTHROPIC_BASE_URL=https://...
```
