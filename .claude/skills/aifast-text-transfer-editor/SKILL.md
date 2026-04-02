---
name: aifast-text-transfer-editor
description: 将参考图上的文字风格迁移到目标图上，并可按需修改文字内容。适用于制作系列海报、每日打卡图迁移等场景。当用户提供两张图片，要求"把图A的文字风格迁移到图B"、"把参考图的文字放到目标图上并修改部分内容"时触发。通过 AIFAST API 调用 gemini-3.1-flash-image-preview 模型实现。
---

# AIFAST 文字风格迁移编辑器

本 Skill 通过 AIFAST API 调用 `gemini-3.1-flash-image-preview` 模型，实现跨图片文字风格迁移与内容替换。

## 工作流程

1. **理解两张图的角色**：
   - **参考图 (Reference)**：文字风格的来源，识别其中需要迁移的文字块（字体风格、颜色、排版）。
   - **目标图 (Target)**：背景图，其视觉元素（人物、场景、构图）必须完整保留。

2. **确认要迁移的文字和需要修改的内容**：
   - 询问或从用户指令中提取：原文字内容是什么、哪些部分需要改动、改成什么。

3. **构建 Prompt**：
   - 明确说明：完整保留目标图的视觉元素，将参考图的文字风格（位置、字体、颜色、排版）迁移到目标图，最终渲染的文字是修改后的版本。

4. **执行合成**：调用 `scripts/transform.py`，传入两张图路径、合成指令、输出路径。

## 使用示例

**用户请求**：
"把第一张图片的文字放到第二张图片上，把 'Day 01' 改成 'Day 05'，其他文字不变"

**Claude 应执行的命令**：

```bash
# 脚本路径相对于项目根目录
python .claude/skills/aifast-text-transfer-editor/scripts/transform.py \
  --ref path/to/reference.jpg \
  --target path/to/target.jpg \
  --output text_transfer_output.png \
  --prompt "Based on the two input images, recreate Image 2 (the target image) in its entirety, preserving all original visual elements (people, scenery, background). Then overlay a precise text block inspired by Image 1's text style. The original text from Image 1 was: '读《鲁滨逊漂流记》学英语 每一次冒险都是一次表达升级 30天精读30个经典句子 Day 01'. Render the following modified text on Image 2: '读《鲁滨逊漂流记》学英语 每一次冒险都是一次表达升级 30天精读30个经典句子 Day 05'. Match the font style, color, and positioning from Image 1." \
  --ratio "16:9" \
  --size "2K"
```

## Prompt 构建要点

一个好的 Prompt 应包含以下四个要素，缺一不可：

1. **保留目标图**：`recreate Image 2 in its entirety, preserving all original visual elements`
2. **迁移文字风格**：`overlay a text block inspired by Image 1's text style`
3. **原始文字**：`The original text from Image 1 was: '...'`（帮助模型理解参考样式）
4. **最终文字**：`Render the following modified text: '...'`（明确最终输出内容）

## 脚本参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `--ref` | 是 | 参考图路径（文字风格来源） |
| `--target` | 是 | 目标图路径（背景图） |
| `--prompt` | 是 | 详细的合成指令（英文效果更佳） |
| `--output` | 是 | 输出图片保存路径 |
| `--ratio` | 否 | 宽高比，默认 `16:9`（支持 1:1, 3:4, 4:3, 9:16, 16:9, 2:3, 3:2） |
| `--size` | 否 | 分辨率，默认 `2K`（支持 512px, 1K, 2K, 4K） |

## 环境要求

`.env.local` 中需设置 `AIFAST_API_KEY`（可选 `AIFAST_BASE_URL`，默认 `https://aifast.site`）。
