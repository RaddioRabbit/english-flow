---
name: gemini-text-transfer-editor
description: 用于将一张图片（参考图）上的特定文字块提取、编辑（例如更改日期、数字）并精准合成为另一张图片（目标图）的浮层。适用于制作系列海报、每日打卡图迁移等场景。当用户要求“把图 A 的文字放到图 B，并修改其中部分文字”时触发。
---

# Gemini 文字迁移与编辑器

本 Skill 调用 `gemini-3.1-flash-image-preview` 模型，实现高精度的跨图片文字迁移和指定内容替换。

## 工作流程

1. **角色定义与文字提取**：
   - **参考图 (Reference)**：作为文字来源。智能体需识别用户指定的文字内容。
   - **目标图 (Target)**：作为视觉背景。智能体需确保该图的原有元素（人物、场景）完全保留。
2. **文字编辑**：
   - 根据用户指令，修改提取出的文字中的特定部分（例如将“Day 01”改为“Day 05”）。
3. **环境准备**：确认 `.env.local` 中存有 `API_KEY`。
4. **执行合成**：调用 `scripts/transform.py` 脚本，传入两张图的路径、精确的合成指令和修改后的最终文字。

## 使用示例

**用户请求**：
“将第一张图片的“读《鲁滨逊漂流记》学英语 每一次冒险都是一次表达升级 30天精读30个经典句子 Day 01”放到第二张图片，只是把“ Day 01”变为“Day 05”，其他都不变，再生成一次第二张图片”

**Claude 应执行的 bash 命令**：

```bash
# 注意：Prompt 中明确了原图文字、修改点、最终合成文字，以及保持底图不变的指令
python3 image-text-transfer-skill/scripts/transform.py \
  --ref path/to/image_1.jpg \
  --target path/to/image_2.jpg \
  --prompt "Based on the input images, recreate Image 2 (the target image with people/scenery) in its entirety, making sure all original visual elements are preserved. Overlaid on Image 2, add the precise Chinese text block inspired by Image 1. The original text on Image 1 was '读《鲁滨逊漂流记》学英语 每一次冒险都是一次表达升级 30天精读30个经典句子 Day 01'. You must modify this text and render the following final text on Image 2: '读《鲁滨逊漂流记》学英语 每一次冒险都是一次表达升级 30天精读30个经典句子 Day 05'. The font style, color, and positioning should be logical for a poster overlay, similar to the text placement style in Image 1."