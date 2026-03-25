---
name: sentence-explanation-video
description: >
  将句子讲解的五张解析图片和对应的TTS语音合成为视频。
  当用户需要：
  1. 将图片和音频合成为讲解视频
  2. 按顺序播放"句译对照图"、"句式分析图"、"句式总结图"、"词汇解析图"、"雅思备考图"
  3. 每张图片播放时同时播放对应的讲解语音
  4. 开头介绍语音放在第一张图，结尾总结语音放在最后一张图
  5. 生成适合短视频平台的竖屏MP4视频
  时，必须使用此skill。

  用户可能会说："把图片和音频合成视频"、"生成讲解视频"、"制作视频"、
  "图片配音生成视频"、"把五张图转成视频"等。
  只要涉及将sentence-explanation-tts生成的音频和图片合成为视频的需求，都应触发此skill。
---

# 句子讲解视频生成技能

## 快速开始（命令行使用）

本 skill 提供了一个可直接运行的 Python 脚本 `generate_video.py`：

```bash
# 基本用法
python .claude/skills/sentence-explanation-video/scripts/generate_video.py \
  --input result-with-audio.json \
  --images images/ \
  --output video.mp4

# 指定分辨率
python .claude/skills/sentence-explanation-video/scripts/generate_video.py \
  --input result-with-audio.json \
  --images images/ \
  --output video.mp4 \
  --width 1080 \
  --height 1920
```

**参数说明：**
- `--input, -i`: sentence-explanation-tts 生成的带音频JSON文件路径（必需）
- `--images, -img`: 图片目录，包含5张解析图（必需）
- `--output, -o`: 输出视频文件路径（可选，默认: output/video.mp4）
- `--width, -w`: 视频宽度（可选，默认: 1080）
- `--height, -h`: 视频高度（可选，默认: 1920）
- `--fps`: 视频帧率（可选，默认: 30）

## 任务描述

将 `sentence-explanation-tts` skill 生成的带音频讲解内容和五张解析图片合成为视频。视频按顺序展示五张图片，每张图片播放时同时播放对应的讲解语音。

**核心要求**：
- 按顺序播放五张图片
- 每张图片的显示时长由其对应的音频长度决定
- 开头介绍语音和第一张图片的讲解语音拼接播放
- 结尾总结语音和最后一张图片的讲解语音拼接播放
- 输出竖屏MP4格式（默认1080x1920）

## 输入格式

### 1. 音频JSON文件（来自 sentence-explanation-tts）

本 skill 支持**两种音频格式**：

#### 格式A：文件路径（TTS Skill CLI输出）

```json
{
  "title": "《傲慢与偏见》开篇名句精讲",
  "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
  "introduction": {
    "text": "大家好，欢迎来到英语名著句子讲解小课堂...",
    "audio": "audio/introduction.mp3"
  },
  "sections": [
    {
      "moduleId": "translation",
      "moduleName": "句译对照",
      "imageRef": "translation",
      "content": {
        "text": "我们先来看这张句译对照图...",
        "audio": "audio/translation.mp3"
      }
    }
  ],
  "conclusion": {
    "text": "好了，今天关于这个句子的讲解就到这里...",
    "audio": "audio/conclusion.mp3"
  }
}
```

#### 格式B：Data URL（系统集成/API输出）

系统通过API返回的格式，音频以 base64 data URL 形式嵌入：

```json
{
  "title": "《傲慢与偏见》开篇名句精讲",
  "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
  "introduction": {
    "text": "大家好，欢迎来到英语名著句子讲解小课堂...",
    "audioDataUrl": "data:audio/mp3;base64,//uQxAAAAAA..."
  },
  "sections": [
    {
      "moduleId": "translation",
      "moduleName": "句译对照",
      "imageRef": "translation",
      "content": {
        "text": "我们先来看这张句译对照图...",
        "audioDataUrl": "data:audio/mp3;base64,//uQxAAAAAA..."
      }
    }
  ],
  "conclusion": {
    "text": "好了，今天关于这个句子的讲解就到这里...",
    "audioDataUrl": "data:audio/mp3;base64,//uQxAAAAAA..."
  }
}
```

**注意**：本 skill 会自动检测并处理这两种格式，优先使用 `audioDataUrl`（如果存在），否则查找 `audio` 文件路径。

### 2. 图片数据来源

本 skill 支持**两种图片提供方式**：

#### 方式A：图片目录（文件系统）

将图片放入目录：

```
images/
├── translation.png    # 句译对照图
├── grammar.png        # 句式分析图
├── summary.png        # 句式总结图
├── vocabulary.png     # 词汇解析图
└── ielts.png          # 雅思备考图
```

支持格式：png、jpg、jpeg、webp

#### 方式B：JSON数据嵌入（系统集成）

如果 JSON 中包含 `generatedImages` 字段（系统 Task 数据结构），会自动提取：

```json
{
  "generatedImages": {
    "translation": {
      "dataUrl": "data:image/png;base64,iVBORw0KGgo...",
      "publicUrl": "https://..."
    },
    "grammar": {
      "dataUrl": "data:image/png;base64,iVBORw0KGgo..."
    }
  }
}
```

**优先级**：
1. 首先检查 JSON 中的 `generatedImages` 或 `images` 字段
2. 如果找不到，再从 `--images` 指定的目录查找
3. 支持 base64 data URL 和文件路径两种格式

### 3. 音频文件目录

如果使用文件路径格式的音频，路径可以是：
- 绝对路径：`/home/user/audio/introduction.mp3`
- 相对路径：`audio/introduction.mp3`（相对于JSON文件目录）

## 输出格式

输出为MP4视频文件，默认规格：
- **分辨率**：1080x1920（竖屏9:16）
- **帧率**：30fps
- **视频编码**：H.264
- **音频编码**：AAC
- **格式**：MP4

## 视频播放顺序

视频按以下顺序播放，每张图片的显示时长由其对应的音频时长决定：

| 顺序 | 图片 | 对应音频 |
|------|------|----------|
| 1 | 句译对照图 (translation.png) | introduction.mp3 + translation.mp3 |
| 2 | 句式分析图 (grammar.png) | grammar.mp3 |
| 3 | 句式总结图 (summary.png) | summary.mp3 |
| 4 | 词汇解析图 (vocabulary.png) | vocabulary.mp3 |
| 5 | 雅思备考图 (ielts.png) | ielts.mp3 + conclusion.mp3 |

**说明**：
- 第1张图片同时播放开头介绍和句译对照的讲解
- 第5张图片同时播放雅思备考讲解和结尾总结

## 执行步骤

### 步骤1：解析输入数据

读取音频JSON文件和图片目录，提取：
- 7个音频文件路径（introduction, translation, grammar, summary, vocabulary, ielts, conclusion）
- 5张图片路径

### 步骤2：音频拼接

使用FFmpeg concat功能拼接音频：
- 第1段：introduction + translation（用于第1张图）
- 第2段：grammar（用于第2张图）
- 第3段：summary（用于第3张图）
- 第4段：vocabulary（用于第4张图）
- 第5段：ielts + conclusion（用于第5张图）

### 步骤3：图片转视频

将每张图片转换为对应时长的视频片段：
- 使用FFmpeg的`loop`滤镜循环图片
- 时长等于对应拼接后的音频时长
- 分辨率调整为输出规格

### 步骤4：视频和音频合成

将图片视频片段和对应音频合成：
- 使用FFmpeg的`concat` demuxer合并所有片段
- 确保音画同步

### 步骤5：输出最终视频

生成最终的MP4视频文件。

## 环境依赖

### 必需安装

1. **FFmpeg**（必需）

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt update
sudo apt install ffmpeg

# Windows
# 下载地址：https://ffmpeg.org/download.html
# 或使用 chocolatey: choco install ffmpeg
```

2. **Python依赖**

```bash
pip install pydub
```

### 验证FFmpeg安装

```bash
ffmpeg -version
```

## Python编程使用

### 基本使用示例

```python
import asyncio
from pathlib import Path
import sys

# 添加脚本路径
sys.path.insert(0, ".claude/skills/sentence-explanation-video/scripts")
from generate_video import generate_explanation_video

async def main():
    result = await generate_explanation_video(
        audio_json_path="output/result-with-audio.json",
        images_dir="images/",
        output_path="output/final-video.mp4",
        width=1080,
        height=1920,
        fps=30
    )
    print(f"视频生成完成: {result['videoPath']}")
    print(f"视频时长: {result['duration']}秒")

asyncio.run(main())
```

### 函数签名

```python
async def generate_explanation_video(
    audio_json_path: str,
    images_dir: str,
    output_path: str = "output/video.mp4",
    width: int = 1080,
    height: int = 1920,
    fps: int = 30
) -> dict:
    """
    生成句子讲解视频

    Args:
        audio_json_path: sentence-explanation-tts 生成的JSON文件路径
        images_dir: 图片目录路径
        output_path: 输出视频路径
        width: 视频宽度
        height: 视频高度
        fps: 视频帧率

    Returns:
        包含视频信息的字典：
        {
            "videoPath": "视频文件路径",
            "duration": 总时长（秒）,
            "width": 宽度,
            "height": 高度,
            "fps": 帧率,
            "segments": [
                {"module": "translation", "duration": 时长, "audio": "音频路径"},
                ...
            ]
        }
    """
```

## 完整执行流程

```
┌─────────────────────────────────────────────────────────────┐
│  1. 读取 sentence-explanation-tts 生成的音频JSON文件          │
│     提取所有音频路径和图片引用关系                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. 检查图片目录，确认5张图片存在                             │
│     - translation.png                                        │
│     - grammar.png                                            │
│     - summary.png                                            │
│     - vocabulary.png                                         │
│     - ielts.png                                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. 拼接音频                                                │
│     - segment1: introduction + translation                   │
│     - segment2: grammar                                      │
│     - segment3: summary                                      │
│     - segment4: vocabulary                                   │
│     - segment5: ielts + conclusion                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. 生成视频片段                                             │
│     每张图片 → 对应时长的视频片段                              │
│     使用FFmpeg loop滤镜循环显示图片                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. 合并所有片段                                             │
│     使用FFmpeg concat合并视频和音频                           │
│     输出最终MP4文件                                          │
└─────────────────────────────────────────────────────────────┘
```

## 注意事项

1. **FFmpeg必须安装**：本skill依赖FFmpeg，请确保已正确安装并添加到PATH
2. **音频时长**：视频片段时长严格等于音频时长，确保音画同步
3. **图片尺寸**：图片会被缩放适应输出分辨率，保持比例或拉伸取决于图片比例
4. **文件路径**：建议使用绝对路径或相对于当前工作目录的相对路径
5. **临时文件**：中间生成的临时文件会自动清理

## 常见问题

### 1. FFmpeg未找到

**错误**：`FFmpeg not found`

**解决**：
```bash
# macOS
brew install ffmpeg

# 验证
which ffmpeg
ffmpeg -version
```

### 2. 音频文件不存在

**错误**：`Audio file not found: xxx.mp3`

**解决**：
- 检查JSON中的音频路径是否正确
- 确保音频文件相对于JSON文件的路径正确
- 或使用绝对路径

### 3. 图片文件不存在

**错误**：`Image not found: translation.png`

**解决**：
- 确保图片目录中包含所有5张图片
- 检查文件名是否正确（区分大小写）
- 支持的格式：.png, .jpg, .jpeg, .webp

### 4. 视频生成失败

**错误**：`FFmpeg command failed`

**解决**：
- 检查FFmpeg版本（建议4.0+）
- 检查磁盘空间是否充足
- 查看详细错误输出

## 系统集成指南

### 与 English Flow Agent 系统集成

本 skill 已针对 English Flow Agent 系统的数据结构进行适配：

#### 完整数据流

```
┌─────────────────────────────────────────────────────────────┐
│ 1. 系统生成图片                                              │
│    Task.generatedImages[moduleId].dataUrl (base64)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. english-sentence-explanation skill                       │
│    输出: SentenceExplanationArticle                          │
│    { title, introduction, sections[], conclusion }          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. sentence-explanation-tts skill                           │
│    输出: SentenceExplanationTtsResponse                      │
│    { introduction: { audioDataUrl: "..." }, ... }           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. sentence-explanation-video skill (本skill)               │
│    支持直接从系统数据生成视频                                 │
│    - 识别 generatedImages 中的 dataUrl                      │
│    - 识别 audioDataUrl base64 音频                          │
└─────────────────────────────────────────────────────────────┘
```

#### 系统数据格式示例

```json
{
  "title": "句子讲解",
  "welcomeMessage": "欢迎来到英语名著句子讲解小课堂",
  "introduction": {
    "text": "大家好...",
    "audioDataUrl": "data:audio/mp3;base64,//uQx..."
  },
  "sections": [
    {
      "moduleId": "translation",
      "moduleName": "句译对照",
      "imageRef": "translation",
      "content": {
        "text": "我们先来看...",
        "audioDataUrl": "data:audio/mp3;base64,//uQx..."
      }
    }
  ],
  "conclusion": {
    "text": "好了，今天...",
    "audioDataUrl": "data:audio/mp3;base64,//uQx..."
  },
  "generatedImages": {
    "translation": { "dataUrl": "data:image/png;base64,iVBORw0KGgo..." },
    "grammar": { "dataUrl": "data:image/png;base64,iVBORw0KGgo..." },
    "summary": { "dataUrl": "data:image/png;base64,iVBORw0KGgo..." },
    "vocabulary": { "dataUrl": "data:image/png;base64,iVBORw0KGgo..." },
    "ielts": { "dataUrl": "data:image/png;base64,iVBORw0KGgo..." }
  }
}
```

#### 从前端直接生成视频

如果已将 Task 数据和 TTS 结果保存为JSON文件：

```bash
python .claude/skills/sentence-explanation-video/scripts/generate_video.py \
  -i task-with-tts-result.json \
  -img ./images \
  -o output/final-video.mp4
```

**注意**：即使JSON中包含 `generatedImages` 的 dataUrl，也建议提供 `--images` 目录作为备选。如果JSON中没有图片数据，skill 会从目录加载。

## 技术细节

### FFmpeg命令详解

本skill使用以下FFmpeg技术：

1. **音频拼接**（使用concat demuxer）：
```bash
ffmpeg -f concat -safe 0 -i audio_list.txt -acodec libmp3lame output.mp3
```

2. **图片转视频**（使用loop滤镜）：
```bash
ffmpeg -loop 1 -i image.png -i audio.mp3 -c:v libx264 -tune stillimage
       -c:a aac -b:a 192k -pix_fmt yuv420p -shortest output.mp4
```

3. **视频片段合并**（使用concat demuxer）：
```bash
ffmpeg -f concat -safe 0 -i video_list.txt -c copy output.mp4
```

### 性能优化

- 使用`libx264`编码器，平衡质量和速度
- 使用`-preset medium`（默认）或`-preset fast`加速
- 图片提前缩放到目标分辨率可减少处理时间
