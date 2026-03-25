---
name: aifast-image-generation
description: Generate images using the gemini-3.1-flash-image-preview (Nano Banana 2) model via the AIFAST API. Use this when the user asks to create, draw, generate, or visualize an image.
---

# AIFAST Image Generation Skill

## 简介
这个 Skill 允许你通过调用本地 Python 脚本，使用 Gemini 3.1 Flash Image (Nano Banana 2) 模型生成图片。该模型在性能和图像质量上表现优异。通过 AIFAST API 进行调用。

## 使用说明

当你需要生成图片时，请使用 bash 工具执行 `scripts/generate_image.py` 脚本。

### 可用参数：
* `--prompt` (必填): 详细的英文图像描述提示词。如果用户提供中文，请先将其翻译为详细的英文摄影/插画级别提示词。
* `--output` (必填): 图片保存的文件路径（例如 `output.png`）。
* `--ratio` (可选): 图片宽高比。支持 `1:1`, `16:9`, `9:16`, `4:3`, `3:4`, `3:2`, `2:3` 等。默认为 `1:1`。
* `--size` (可选): 图片分辨率。支持 `512px`, `1K`, `2K`, `4K`（注意必须是大写 K）。默认为 `1K`。

### Bash 执行示例：

```bash
python aifast-image-generation/scripts/generate_image.py \
  --prompt "A photorealistic close-up portrait of a cute cat playing in the sunshine, 85mm lens, soft bokeh" \
  --output "cute_cat.png" \
  --ratio "16:9" \
  --size "1K"
```

### 使用参考图：

如果需要使用参考图进行风格迁移，添加 `--reference-image` 参数：

```bash
python aifast-image-generation/scripts/generate_image.py \
  --prompt "A portrait of a dog in the same artistic style" \
  --output "dog_portrait.png" \
  --ratio "1:1" \
  --size "1K" \
  --reference-image "path/to/reference.png"
```

### 提示词最佳实践：

1. **详细描述**：包含主体、环境、光线、风格、摄影/绘画技术
2. **艺术风格**：可以指定 "digital art", "oil painting", "watercolor", "3D render", "anime style" 等
3. **摄影参数**：可以指定 "85mm lens", "f/1.4", "soft bokeh", "golden hour lighting" 等
4. **质量修饰词**：添加 "high quality", "detailed", "professional", "masterpiece" 等提升质量

## 输出

脚本成功执行后，生成的图片将保存到指定的 `--output` 路径。支持 PNG、JPEG 格式（根据文件扩展名自动决定）。
