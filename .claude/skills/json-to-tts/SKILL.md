---
name: json-to-tts
description: Convert JSON-formatted text to speech using gpt-4o-mini-tts model via OpenAI API. Use this when the user wants to generate audio from structured narration JSON.
---

# JSON to TTS Skill

## 简介
这个 Skill 允许你将 JSON 格式的文本内容转换为语音音频文件，使用 OpenAI 的 gpt-4o-mini-tts 模型。

## JSON 输入格式

```json
{
  "segments": [
    {
      "id": "intro",
      "moduleId": "translation",
      "imageRefs": ["translation"],
      "narration": "要转换为语音的文本内容"
    }
  ],
  "fullNarration": "完整的叙述文本（可选）",
  "source": "anthropic-compatible-api",
  "model": "..."
}
```

## 使用说明

当你需要将 JSON 文本转换为语音时，请使用 bash 工具执行 `scripts/json_to_tts.py` 脚本。

### 可用参数：
* `--input` (必填): 输入 JSON 文件路径，或直接使用 JSON 字符串
* `--output` (必填): 输出音频文件路径（支持 .mp3, .opus, .aac, .flac 格式，默认为 mp3）
* `--voice` (可选): 语音类型，可选值：alloy, echo, fable, onyx, nova, shimmer。默认为 alloy
* `--speed` (可选): 语速，范围 0.25 到 4.0，默认为 1.0
* `--response-format` (可选): 音频格式，可选值：mp3, opus, aac, flac。默认为 mp3
* `--use-full-narration` (可选): 如果设置，使用 fullNarration 字段而不是拼接所有 segments 的 narration

### 环境变量配置 (.env.local)

确保 .env.local 中包含以下配置：

```bash
# OpenAI API Configuration for TTS
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，默认为 OpenAI 官方 API
```

### Bash 执行示例：

```bash
# 使用 JSON 文件生成音频
python json-to-tts/scripts/json_to_tts.py \
  --input "narration.json" \
  --output "output.mp3" \
  --voice "alloy" \
  --speed "1.0"

# 使用完整叙述生成音频
python json-to-tts/scripts/json_to_tts.py \
  --input "narration.json" \
  --output "output.mp3" \
  --voice "nova" \
  --use-full-narration
```

### 编程方式调用：

```python
from json_to_tts import generate_speech

# 从 JSON 文件生成
await generate_speech(
    input_path="narration.json",
    output_path="output.mp3",
    voice="alloy",
    speed=1.0,
    use_full_narration=False
)

# 或直接传入 JSON 数据
json_data = {
    "segments": [{"narration": "Hello world"}],
    "fullNarration": "Hello world"
}
await generate_speech_from_json(
    json_data=json_data,
    output_path="output.mp3",
    voice="alloy"
)
```

## 支持的语音类型

- **alloy**: 中性声音，适合一般用途
- **echo**: 男性声音，温暖友好
- **fable**: 女性声音，富有表现力
- **onyx**: 男性声音，专业稳重
- **nova**: 女性声音，清晰明亮
- **shimmer**: 女性声音，柔和细腻
