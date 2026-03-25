---
name: sentence-explanation-tts
description: >
  将英语句子讲解文章转换为带语音的JSON格式。
  当用户需要：
  1. 将english-sentence-explanation生成的讲解文章转为语音
  2. 为句子讲解的每个模块生成对应的语音文件
  3. 生成包含讲解文本和TTS语音的完整JSON输出
  4. 将逐字稿风格的讲解文章分段转为音频
  5. 为五张解析图片的讲解内容生成语音
  时，必须使用此skill。

  用户可能会说："把讲解文章转成语音"、"给讲解内容加配音"、"生成带音频的讲解JSON"、
  "将句子讲解转为TTS"、"为每个模块生成语音"等。
  只要涉及将english-sentence-explanation生成的讲解文章转换为语音的需求，都应触发此skill。
---

# 句子讲解文章转语音技能

## 快速开始（命令行使用）

本 skill 提供了一个可直接运行的 Python 脚本 `convert_to_tts.py`：

```bash
# 使用连贯模式（推荐）：确保所有段落语气一致
python .claude/skills/sentence-explanation-tts/scripts/convert_to_tts.py \
  --input article.json \
  --output-dir audio/ \
  --coherent-mode

# 指定语音和语速
python .claude/skills/sentence-explanation-tts/scripts/convert_to_tts.py \
  --input article.json \
  --output-dir audio/ \
  --voice nova \
  --speed 1.0

# 指定输出JSON路径
python .claude/skills/sentence-explanation-tts/scripts/convert_to_tts.py \
  --input article.json \
  --output result.json \
  --output-dir audio/ \
  --voice nova

# 不使用连贯模式（可能语气不一致）
python .claude/skills/sentence-explanation-tts/scripts/convert_to_tts.py \
  --input article.json \
  --output-dir audio/ \
  --no-coherent-mode
```

**参数说明：**
- `--input, -i`: 输入的文章JSON文件路径（必需）
- `--output, -o`: 输出的带音频JSON文件路径（可选，默认: output/result-with-audio.json）
- `--output-dir, -d`: 音频文件输出目录（可选，默认: output/）
- `--voice, -v`: 语音类型，可选 alloy/echo/fable/onyx/nova/shimmer（可选，默认: nova）
- `--speed, -s`: 语速 0.25-4.0（可选，默认: 1.0）
- `--coherent-mode`: 使用连贯模式，确保所有段落语气一致（默认开启，推荐）
- `--no-coherent-mode`: 禁用连贯模式，每个段落单独生成
- `--instructions`: 自定义语音风格指令（可选）

## 任务描述

将 `english-sentence-explanation` skill 生成的讲解文章转换为带有语音的JSON格式。为每个模块（句译对照、句式分析、句式总结、词汇解析、雅思备考）的讲解文本生成对应的TTS语音。

**核心要求**：
- 保留原始讲解文章的所有内容
- 为每个模块生成独立的语音文件
- **确保所有模块的语音风格、语气、语调一致**（连贯模式）
- 输出JSON格式，方便前端使用

## 输入格式

提供 `english-sentence-explanation` 生成的文章JSON：

```json
{
  "article": {
    "title": "文章标题",
    "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
    "introduction": "开篇介绍",
    "sections": [
      {
        "moduleId": "translation",
        "moduleName": "句译对照",
        "imageRef": "translation",
        "content": "对应图片的讲解文字"
      },
      {
        "moduleId": "grammar",
        "moduleName": "句式分析",
        "imageRef": "grammar",
        "content": "对应图片的讲解文字"
      },
      {
        "moduleId": "summary",
        "moduleName": "句式总结",
        "imageRef": "summary",
        "content": "对应图片的讲解文字"
      },
      {
        "moduleId": "vocabulary",
        "moduleName": "词汇解析",
        "imageRef": "vocabulary",
        "content": "对应图片的讲解文字"
      },
      {
        "moduleId": "ielts",
        "moduleName": "雅思备考",
        "imageRef": "ielts",
        "content": "对应图片的讲解文字"
      }
    ],
    "conclusion": "总结语",
    "fullScript": "完整的逐字稿文本"
  }
}
```

## 输出格式

输出包含讲解文本和语音的JSON：

```json
{
  "title": "文章标题",
  "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
  "introduction": {
    "text": "开篇介绍文本",
    "audio": "introduction.mp3"
  },
  "sections": [
    {
      "moduleId": "translation",
      "moduleName": "句译对照",
      "imageRef": "translation",
      "content": {
        "text": "讲解文字",
        "audio": "translation.mp3"
      }
    },
    {
      "moduleId": "grammar",
      "moduleName": "句式分析",
      "imageRef": "grammar",
      "content": {
        "text": "讲解文字",
        "audio": "grammar.mp3"
      }
    },
    {
      "moduleId": "summary",
      "moduleName": "句式总结",
      "imageRef": "summary",
      "content": {
        "text": "讲解文字",
        "audio": "summary.mp3"
      }
    },
    {
      "moduleId": "vocabulary",
      "moduleName": "词汇解析",
      "imageRef": "vocabulary",
      "content": {
        "text": "讲解文字",
        "audio": "vocabulary.mp3"
      }
    },
    {
      "moduleId": "ielts",
      "moduleName": "雅思备考",
      "imageRef": "ielts",
      "content": {
        "text": "讲解文字",
        "audio": "ielts.mp3"
      }
    }
  ],
  "conclusion": {
    "text": "总结语文本",
    "audio": "conclusion.mp3"
  },
  "fullScript": "完整的逐字稿文本",
  "metadata": {
    "totalDuration": "总时长（估算）",
    "voice": "使用的语音类型",
    "coherentMode": true,
    "instructions": "使用的语音风格指令",
    "generatedAt": "生成时间"
  }
}
```

## 执行步骤

### 步骤1：解析输入文章

读取 `english-sentence-explanation` 生成的文章JSON，提取以下信息：
- `title`：文章标题
- `welcomeMessage`：欢迎语
- `introduction`：开篇介绍
- `sections`：五个模块的讲解内容
- `conclusion`：总结语
- `fullScript`：完整逐字稿

### 步骤2：构建TTS输入

为每个需要生成语音的部分创建segment：

1. **introduction** - 开篇介绍语音
2. **translation** - 句译对照讲解语音
3. **grammar** - 句式分析讲解语音
4. **summary** - 句式总结讲解语音
5. **vocabulary** - 词汇解析讲解语音
6. **ielts** - 雅思备考讲解语音
7. **conclusion** - 总结语语音

构建 `json-to-tts` 需要的输入格式：

```json
{
  "segments": [
    {
      "id": "introduction",
      "moduleId": "introduction",
      "imageRefs": [],
      "narration": "开篇介绍文本"
    },
    {
      "id": "translation",
      "moduleId": "translation",
      "imageRefs": ["translation"],
      "narration": "句译对照讲解文字"
    }
    // ... 其他模块
  ],
  "fullNarration": "完整的逐字稿文本"
}
```

### 步骤3：调用 json-to-tts Skill（连贯模式）

使用 `json-to-tts` skill 生成语音，确保语气一致：

#### 连贯模式（推荐）

**方式A：精确分割模式**（需要安装 pydub）
1. 使用 `fullScript` 一次性生成完整音频
2. 根据各段落文本长度计算分割时间点
3. 使用 `pydub` 将完整音频精确分割成多个文件
4. 每个文件对应一个模块，但语气 100% 一致

**方式B：Instructions 模式**（无需额外依赖）
1. 为每个 segment 单独调用 TTS API
2. 使用统一的 `instructions` 参数指定语音风格
3. 添加位置上下文帮助 TTS 理解段落关系
4. 虽然不如方式A精确，但能显著改善连贯性

#### 推荐语音设置
- `voice`: "nova"（女性声音，清晰明亮，适合教学讲解）
- `speed`: 1.0（正常语速）
- `response-format`: "mp3"
- `instructions`: 默认语音风格指令（确保语气一致）

### 步骤4：整合输出

将原文和生成的音频文件路径整合为最终输出JSON：

```json
{
  "title": "...",
  "welcomeMessage": "...",
  "introduction": {
    "text": "...",
    "audio": "path/to/introduction.mp3"
  },
  "sections": [...],
  "conclusion": {
    "text": "...",
    "audio": "path/to/conclusion.mp3"
  },
  "metadata": {
    "totalDuration": "约5分钟",
    "voice": "nova",
    "generatedAt": "2026-03-18T10:30:00Z"
  }
}
```

## 语音生成细节

### 连贯模式（Coherent Mode）- 推荐

**连贯模式**是本 skill 的核心特性，用于解决多段落语音风格不一致的问题。

#### 问题背景

传统 TTS 方式中，每个段落独立调用 API 生成语音，导致：
- 同一篇文章的不同段落听起来像不同的人朗读
- 语气、停顿、情感表达不一致
- 整体听感断裂，不够专业

#### 连贯模式解决方案

**工作原理**：
1. 使用 `fullScript`（完整逐字稿）一次性生成完整音频
2. 根据各段落文本长度比例计算分割时间点
3. 使用 `pydub` 将完整音频精确分割成多个文件
4. 每个文件对应一个模块，但语气完全一致

**两种方式**：

1. **精确分割模式**（推荐，需要安装 pydub）
   ```bash
   pip install pydub
   ```
   - 生成完整音频后精确分割
   - 确保语气、停顿、语调完全一致
   - 像同一个人连续读完一篇文章

2. **Instructions 模式**（无需额外依赖）
   - 使用 OpenAI TTS 的 `instructions` 参数
   - 为每个段落提供统一的风格指令
   - 虽然不能 100% 一致，但能大幅改善连贯性

### 分段策略

每个部分独立生成语音文件，便于：
- 前端按需加载播放
- 用户选择性收听
- 错误时只需重试部分
- 与不同图片配合播放

### 语音选择建议

根据 OpenAI 官方推荐：
- **marin** / **cedar**（最佳质量）：OpenAI 官方推荐的最佳质量语音
- **nova**（推荐）：清晰明亮的女声，适合教学场景
- **alloy**：中性声音，通用场景
- **echo**：温暖友好的男声
- **coral**：活泼自然的女性声音
- **sage**：稳重专业的男性声音

全部可用语音：alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse, marin, cedar

### 语速设置

- 默认 `1.0`（正常语速）
- 如内容较复杂，可降至 `0.9`
- 如内容较简单，可升至 `1.1`

### 语音风格指令（Instructions）

默认的风格指令确保语音风格一致：

```
请以一位专业、亲和的英语老师的身份朗读这段内容。
语气要求：
- 声音温暖、亲切，像在对学生一对一讲解
- 语速适中，重点内容稍微放慢
- 保持专业和耐心，不要过度夸张
- 同一篇文章的所有段落保持完全一致的语调和风格
- 在句子和段落之间有自然的停顿
```

可以通过 `--instructions` 参数自定义风格指令。

## 使用示例

### 输入示例

```json
{
  "article": {
    "title": "《双城记》悬疑句式精讲",
    "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
    "introduction": "大家好，欢迎来到英语名著句子讲解小课堂...",
    "sections": [
      {
        "moduleId": "translation",
        "moduleName": "句译对照",
        "imageRef": "translation",
        "content": "我们先来看这张句译对照图..."
      }
      // ... 其他模块
    ],
    "conclusion": "好了，今天关于这个句子的讲解就到这里...",
    "fullScript": "完整的逐字稿..."
  }
}
```

### 输出示例

```json
{
  "title": "《双城记》悬疑句式精讲",
  "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
  "introduction": {
    "text": "大家好，欢迎来到英语名著句子讲解小课堂...",
    "audio": "output/introduction.mp3"
  },
  "sections": [
    {
      "moduleId": "translation",
      "moduleName": "句译对照",
      "imageRef": "translation",
      "content": {
        "text": "我们先来看这张句译对照图...",
        "audio": "output/translation.mp3"
      }
    }
    // ... 其他模块
  ],
  "conclusion": {
    "text": "好了，今天关于这个句子的讲解就到这里...",
    "audio": "output/conclusion.mp3"
  },
  "metadata": {
    "totalDuration": "约4分30秒",
    "voice": "nova",
    "generatedAt": "2026-03-18T10:30:00Z"
  }
}
```

## 完整执行流程

### 连贯模式（推荐）

```
┌─────────────────────────────────────────────────────────────┐
│  1. 接收 english-sentence-explanation 生成的文章JSON          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 解析文章结构，提取各个模块的讲解文本                        │
│     - introduction                                          │
│     - sections (translation, grammar, summary, vocabulary,    │
│       ielts)                                                │
│     - conclusion                                            │
│     - fullScript (完整逐字稿，用于连贯生成)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 【连贯模式】生成完整音频                                   │
│     - 使用 fullScript 一次性生成完整音频                       │
│     - 应用统一的语音风格 instructions                         │
│     - 确保整篇文章语气完全一致                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 【连贯模式】分割音频文件                                   │
│     - 根据各段落文本长度计算分割时间点                          │
│     - 使用 pydub 精确分割完整音频                              │
│     - 每个模块获得独立但语气一致的音频文件                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. 整合输出JSON                                             │
│     - 保留原文内容                                            │
│     - 添加 audio 字段指向生成的音频文件                        │
│     - 添加 metadata (包含 coherentMode: true)                │
└─────────────────────────────────────────────────────────────┘
```

### 传统模式（不推荐）

```
┌─────────────────────────────────────────────────────────────┐
│  3. 【传统模式】为每个段落单独生成音频                          │
│     - 分别调用 TTS API 生成每个 segment                        │
│     - 各段落语气可能不一致                                     │
└─────────────────────────────────────────────────────────────┘
```

## 注意事项

1. **文件路径管理**：确保音频文件保存在合适的目录，建议使用 `output/` 或 `audio/` 目录
2. **错误处理**：如果某个模块的语音生成失败，记录错误但继续处理其他模块
3. **文本完整性**：确保传递给TTS的文本与原文完全一致，不添加或删除内容
4. **语音连贯性**：**强烈建议使用 `--coherent-mode`（默认开启）**，确保同一篇文章的所有模块语气、风格完全一致
5. **输出验证**：生成完成后检查音频文件是否存在且非空
6. **pydub 依赖**：安装 `pydub` 可以获得更精确的音频分割效果，但不安装也能正常工作

## 环境变量配置

### 必需的配置

在 `.env.local` 文件中添加以下配置：

```bash
# OpenAI TTS Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://aifast.site/v1
```

**重要**：`OPENAI_BASE_URL` 必须以 `/v1` 结尾，不要包含 `/audio/speech` 路径。脚本会自动添加 API 端点路径。

### 配置检查清单

- [ ] `OPENAI_API_KEY` - 有效的 OpenAI API Key
- [ ] `OPENAI_BASE_URL` - 正确的 API 基础 URL（如 `https://aifast.site/v1`）
- [ ] `json-to-tts` skill 已安装在 `.claude/skills/` 目录

## 数据格式转换

### 输入输出格式对照

| 来源 | 格式 |
|------|------|
| `english-sentence-explanation` 输出 | `{"article": {"sections": [{"content": "..."}], "fullScript": "..."}}` |
| `json-to-tts` 期望输入 | `{"segments": [{"narration": "..."}], "fullNarration": "..."}` |

### 转换函数

使用以下 Python 代码将 `english-sentence-explanation` 输出转换为 `json-to-tts` 输入格式：

```python
def convert_article_to_tts_format(article_json):
    """
    将 english-sentence-explanation 输出转为 json-to-tts 输入格式

    Args:
        article_json: english-sentence-explanation 生成的文章JSON

    Returns:
        符合 json-to-tts 格式的字典
    """
    article = article_json.get("article", {})

    segments = []

    # 1. introduction
    if article.get("introduction"):
        segments.append({
            "id": "introduction",
            "moduleId": "introduction",
            "imageRefs": [],
            "narration": article["introduction"]
        })

    # 2. 五个模块
    for section in article.get("sections", []):
        segments.append({
            "id": section["moduleId"],
            "moduleId": section["moduleId"],
            "moduleName": section.get("moduleName", ""),
            "imageRefs": [section.get("imageRef", "")],
            "narration": section["content"]
        })

    # 3. conclusion
    if article.get("conclusion"):
        segments.append({
            "id": "conclusion",
            "moduleId": "conclusion",
            "imageRefs": [],
            "narration": article["conclusion"]
        })

    return {
        "segments": segments,
        "fullNarration": article.get("fullScript", "")
    }
```

## 调用 json-to-tts 的具体步骤

### 方式一：为每个模块单独生成语音（推荐）

为每个 section 生成独立的音频文件，便于前端按需加载：

```python
import asyncio
import json
from pathlib import Path
import sys

# 添加 json-to-tts 脚本路径
sys.path.insert(0, ".claude/skills/json-to-tts/scripts")
from json_to_tts import generate_speech_from_json, TTSConfig

async def generate_module_audios(article_json, output_dir="output"):
    """为每个模块生成独立音频"""

    # 转换格式
    tts_data = convert_article_to_tts_format(article_json)

    results = {}
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 为每个 segment 生成音频
    for segment in tts_data["segments"]:
        module_id = segment["moduleId"]
        audio_file = output_path / f"{module_id}.mp3"

        # 构建单个 segment 的 JSON
        single_segment = {
            "segments": [segment],
            "fullNarration": segment["narration"]
        }

        try:
            audio_path = await generate_speech_from_json(
                json_data=single_segment,
                output_path=str(audio_file),
                voice="nova",      # 推荐：清晰明亮的女声
                speed=1.0,         # 正常语速
                response_format="mp3"
            )
            results[module_id] = audio_path
            print(f"✓ {module_id}: {audio_path}")
        except Exception as e:
            print(f"✗ {module_id} 生成失败: {e}")
            results[module_id] = None

    return results
```

### 方式二：批量生成所有语音

如果需要完整音频，可以一次性生成：

```python
async def generate_full_audio(article_json, output_path="output/full.mp3"):
    """生成完整讲解音频"""

    tts_data = convert_article_to_tts_format(article_json)

    audio_path = await generate_speech_from_json(
        json_data=tts_data,
        output_path=output_path,
        voice="nova",
        speed=1.0,
        response_format="mp3",
        use_full_narration=True  # 使用 fullNarration
    )

    return audio_path
```

## 完整执行代码示例

```python
import asyncio
import json
from pathlib import Path
from datetime import datetime
import sys

# 添加 json-to-tts 路径
sys.path.insert(0, ".claude/skills/json-to-tts/scripts")
from json_to_tts import generate_speech_from_json

async def process_article_to_tts(article_json, output_dir="output", voice="nova"):
    """
    完整的文章转TTS处理流程

    Args:
        article_json: english-sentence-explanation 生成的文章JSON
        output_dir: 音频输出目录
        voice: 语音类型

    Returns:
        带音频路径的完整JSON
    """
    article = article_json.get("article", {})
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 1. 转换格式
    tts_data = convert_article_to_tts_format(article_json)

    # 2. 生成各部分音频
    audio_files = {}

    for segment in tts_data["segments"]:
        module_id = segment["moduleId"]
        audio_file = output_path / f"{module_id}.mp3"

        single_segment = {
            "segments": [segment],
            "fullNarration": segment["narration"]
        }

        try:
            audio_path = await generate_speech_from_json(
                json_data=single_segment,
                output_path=str(audio_file),
                voice=voice,
                speed=1.0,
                response_format="mp3"
            )
            audio_files[module_id] = str(audio_path)
        except Exception as e:
            print(f"生成 {module_id} 音频失败: {e}")
            audio_files[module_id] = None

    # 3. 构建输出JSON
    result = {
        "title": article.get("title", ""),
        "welcomeMessage": article.get("welcomeMessage", ""),
        "introduction": {
            "text": article.get("introduction", ""),
            "audio": audio_files.get("introduction")
        },
        "sections": [],
        "conclusion": {
            "text": article.get("conclusion", ""),
            "audio": audio_files.get("conclusion")
        },
        "fullScript": article.get("fullScript", ""),
        "metadata": {
            "voice": voice,
            "speed": 1.0,
            "generatedAt": datetime.now().isoformat(),
            "totalSegments": len(tts_data["segments"])
        }
    }

    # 填充 sections
    for section in article.get("sections", []):
        module_id = section["moduleId"]
        result["sections"].append({
            "moduleId": module_id,
            "moduleName": section.get("moduleName", ""),
            "imageRef": section.get("imageRef", ""),
            "content": {
                "text": section["content"],
                "audio": audio_files.get(module_id)
            }
        })

    return result

# 使用示例
async def main():
    # 读取 english-sentence-explanation 生成的文章
    with open("article.json", "r", encoding="utf-8") as f:
        article_json = json.load(f)

    # 处理并生成TTS
    result = await process_article_to_tts(
        article_json=article_json,
        output_dir="audio/lesson-001",
        voice="nova"
    )

    # 保存结果
    with open("output/result-with-audio.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    print("处理完成！")

if __name__ == "__main__":
    asyncio.run(main())
```

## 依赖安装

### 1. 确保 json-to-tts skill 已安装

```bash
# 检查是否存在
ls .claude/skills/json-to-tts/scripts/json_to_tts.py
```

### 2. 安装 Python 依赖

```bash
# 安装必需的包
pip install aiohttp python-dotenv

# 或使用 requirements.txt
echo "aiohttp>=3.8.0
python-dotenv>=1.0.0" > requirements.txt
pip install -r requirements.txt
```

### 3. 安装可选依赖（推荐）

```bash
# 安装 pydub 以获得最佳的连贯语音效果
pip install pydub
```

`pydub` 用于在连贯模式下精确分割音频，确保所有段落语气 100% 一致。如不安装，会自动回退到 instructions 模式。

### 4. 配置环境变量

创建或编辑 `.env.local`：

```bash
# OpenAI TTS Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://aifast.site/v1
```

### 依赖检查清单

- [ ] Python 3.8+
- [ ] `aiohttp` 包 (`pip install aiohttp`)
- [ ] `python-dotenv` 包 (`pip install python-dotenv`)
- [ ] `pydub` 包 (`pip install pydub`) - 可选，推荐安装以获得最佳连贯效果
- [ ] `json-to-tts` skill 在 `.claude/skills/json-to-tts/`
- [ ] `sentence-explanation-tts` skill 在 `.claude/skills/sentence-explanation-tts/`
- [ ] `OPENAI_API_KEY` 在 `.env.local`
- [ ] `OPENAI_BASE_URL` 以 `/v1` 结尾

## 编程方式使用

除了命令行，你也可以在 Python 代码中导入和使用：

```python
import asyncio
import sys

# 添加脚本路径
sys.path.insert(0, ".claude/skills/sentence-explanation-tts/scripts")

from convert_to_tts import (
    convert_article_to_tts_format,
    process_article_to_tts
)

async def main():
    article_json = {
        "article": {
            "title": "示例讲解",
            "introduction": "大家好...",
            "sections": [
                {"moduleId": "translation", "moduleName": "句译对照",
                 "imageRef": "translation", "content": "讲解内容..."}
            ],
            "conclusion": "总结...",
            "fullScript": "完整逐字稿..."
        }
    }

    result = await process_article_to_tts(
        article_json=article_json,
        output_dir="audio/lesson-001",
        voice="nova",
        speed=1.0
    )

    print(f"成功生成 {result['metadata']['successfulSegments']} 个音频")

asyncio.run(main())
```

## 如何确保语音风格一致

### 核心原理

要确保同一篇文章不同段落的语音风格完全一致，本 skill 使用以下策略：

#### 方法一：完整音频分割（推荐，最精确）

1. **生成完整音频**：使用 `fullScript`（完整逐字稿）一次性生成整篇文章的音频
2. **统一风格指令**：使用 `instructions` 参数指定语音风格（如语气、情感）
3. **时间边界计算**：根据各段落文本长度比例计算在完整音频中的时间边界
4. **精确分割**：使用 `pydub` 按时间边界将完整音频分割成多个独立文件

**优点**：
- 所有段落来自同一个音频源，语气 100% 一致
- 自然停顿、语调变化与文本内容完全匹配
- 听起来就像同一个人连续朗读完整篇文章

#### 方法二：统一 Instructions（无需额外依赖）

1. **统一风格指令**：为每个段落提供完全相同的 `instructions` 参数
2. **位置上下文**：添加段落位置信息（开头/中间/结尾）帮助 TTS 理解语境
3. **单独生成**：每个段落独立调用 TTS API

**优点**：
- 无需安装额外依赖
- 仍能显著改善语气一致性

**缺点**：
- 每次 API 调用仍有微小随机性
- 不如方法一精确

### 使用建议

| 场景 | 推荐模式 | 说明 |
|------|---------|------|
| 追求最佳一致性 | 连贯模式 + pydub | 安装 `pydub` 后使用 `--coherent-mode` |
| 快速部署 | 连贯模式（无 pydub） | 自动使用 instructions 模式 |
| 特殊需求 | 传统模式 | 使用 `--no-coherent-mode` 禁用连贯模式 |

### 关键配置

```python
# 默认语音风格指令 - 确保语气一致
DEFAULT_VOICE_INSTRUCTIONS = """
请以一位专业、亲和的英语老师的身份朗读这段内容。
语气要求：
- 声音温暖、亲切，像在对学生一对一讲解
- 语速适中，重点内容稍微放慢
- 保持专业和耐心，不要过度夸张
- 同一篇文章的所有段落保持完全一致的语调和风格
- 在句子和段落之间有自然的停顿
"""
```

## 常见问题

### 1. API 返回 404 错误
**原因**：`OPENAI_BASE_URL` 配置错误，包含了多余的 `/audio/speech` 路径
**解决**：确保 URL 以 `/v1` 结尾，如 `https://aifast.site/v1`

### 2. 音频生成不完整
**原因**：文本超过 4096 字符限制
**解决**：`json_to_tts.py` 会自动截断超长文本，建议分段生成

### 3. 找不到 json_to_tts 模块
**原因**：Python 路径未正确设置
**解决**：使用 `sys.path.insert(0, ".claude/skills/json-to-tts/scripts")` 添加路径

### 4. 不同段落语气不一致
**原因**：未使用连贯模式，每个段落独立生成导致随机差异
**解决**：
- 确保使用 `--coherent-mode`（默认开启）
- 安装 `pydub` 获得最佳效果：`pip install pydub`
- 检查输出 JSON 中的 `metadata.coherentMode` 是否为 `true`

### 5. pydub 导入错误
**原因**：未安装 pydub 或安装失败
**解决**：
```bash
pip install pydub
```
即使不安装 pydub，脚本也会自动回退到 instructions 模式，仍能改善一致性。
