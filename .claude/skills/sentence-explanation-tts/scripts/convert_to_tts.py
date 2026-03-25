#!/usr/bin/env python3
"""
Sentence Explanation to TTS Converter
将 english-sentence-explanation 生成的文章转换为带语音的JSON

用法:
    python convert_to_tts.py --input article.json --output-dir audio/ --voice nova
    python convert_to_tts.py --input article.json --output-dir audio/ --coherent-mode
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Tuple
from io import BytesIO

# 添加 json-to-tts 脚本路径
JSON_TO_TTS_PATH = Path(__file__).parent.parent.parent / "json-to-tts" / "scripts"
sys.path.insert(0, str(JSON_TO_TTS_PATH))

try:
    from json_to_tts import generate_speech_from_json, TTSConfig, call_tts_api
except ImportError as e:
    print(f"错误: 无法导入 json_to_tts 模块: {e}")
    print(f"请确保 json-to-tts skill 已安装在: {JSON_TO_TTS_PATH}")
    sys.exit(1)


# 默认的语音风格指令，确保语气一致性
DEFAULT_VOICE_INSTRUCTIONS = """
请以一位专业、亲和的英语老师的身份朗读这段内容。
语气要求：
- 声音温暖、亲切，像在对学生一对一讲解
- 语速适中，重点内容稍微放慢
- 保持专业和耐心，不要过度夸张
- 同一篇文章的所有段落保持完全一致的语调和风格
- 在句子和段落之间有自然的停顿
""".strip()


def convert_article_to_tts_format(article_json: dict) -> dict:
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


def calculate_segment_boundaries(segments: List[dict], total_duration_ms: int) -> List[Tuple[int, int]]:
    """
    根据文本长度计算每个 segment 在完整音频中的时间边界

    Args:
        segments: segment 列表
        total_duration_ms: 完整音频的总时长（毫秒）

    Returns:
        每个 segment 的 (开始时间, 结束时间) 列表，单位毫秒
    """
    # 计算每个 segment 的文本长度
    lengths = [len(seg.get("narration", "")) for seg in segments]
    total_length = sum(lengths)

    if total_length == 0:
        return []

    boundaries = []
    current_time = 0

    for i, length in enumerate(lengths):
        # 根据字符比例计算时长
        segment_duration = int((length / total_length) * total_duration_ms)

        # 最后一段确保用完所有时间
        if i == len(lengths) - 1:
            segment_duration = total_duration_ms - current_time

        start_time = current_time
        end_time = current_time + segment_duration

        boundaries.append((start_time, end_time))
        current_time = end_time

    return boundaries


def split_audio_file(
    audio_data: bytes,
    boundaries: List[Tuple[int, int]],
    output_dir: Path,
    module_ids: List[str]
) -> dict:
    """
    将完整音频按时间边界分割成多个文件

    Args:
        audio_data: 完整音频的二进制数据
        boundaries: 每个 segment 的时间边界列表 [(start_ms, end_ms), ...]
        output_dir: 输出目录
        module_ids: 每个 segment 对应的模块ID列表

    Returns:
        模块ID到音频文件路径的映射
    """
    audio_files = {}

    try:
        # 尝试使用 pydub 进行精确分割
        from pydub import AudioSegment

        audio = AudioSegment.from_mp3(BytesIO(audio_data))

        for i, (module_id, (start_ms, end_ms)) in enumerate(zip(module_ids, boundaries)):
            audio_file = output_dir / f"{module_id}.mp3"

            # 提取片段
            segment_audio = audio[start_ms:end_ms]

            # 保存
            segment_audio.export(str(audio_file), format="mp3")
            audio_files[module_id] = str(audio_file)
            print(f"  ✓ {module_id}: {audio_file.name} ({start_ms}ms - {end_ms}ms)")

    except ImportError:
        # 如果没有 pydub，使用简单的时间估算方式，为每个 segment 单独生成
        # 但添加 instructions 确保语气一致
        print("  注意: 未安装 pydub，将使用 instructions 模式确保语气一致")
        return None

    return audio_files


async def generate_coherent_audios(
    tts_data: dict,
    output_dir: Path,
    voice: str = "nova",
    speed: float = 1.0,
    instructions: str = None
) -> dict:
    """
    使用连贯模式生成音频：先生成完整音频，再分割成多个文件
    确保所有段落的语气、风格完全一致

    Args:
        tts_data: 转换后的TTS格式数据
        output_dir: 音频输出目录
        voice: 语音类型
        speed: 语速
        instructions: 语音风格指令

    Returns:
        模块ID到音频文件路径的映射
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    audio_files = {}

    print(f"\n使用连贯模式生成音频 (voice={voice}, speed={speed})")
    print("=" * 60)
    print("模式说明：先生成完整音频，再分割成多个文件")
    print("优点：所有段落语气、风格完全一致，像同一个人连续朗读")
    print("=" * 60)

    segments = tts_data.get("segments", [])
    full_narration = tts_data.get("fullNarration", "")

    if not segments or not full_narration:
        print("错误: 没有需要生成语音的内容")
        return {}

    # 检查是否有 pydub 可用
    has_pydub = False
    try:
        from pydub import AudioSegment
        from io import BytesIO
        has_pydub = True
    except ImportError:
        pass

    if has_pydub:
        # 方法1: 生成完整音频并分割
        print("\n步骤 1/3: 生成完整音频...")

        try:
            # 生成完整音频
            full_audio_data = await call_tts_api(
                text=full_narration[:4096],  # API限制
                config=TTSConfig(
                    voice=voice,
                    speed=speed,
                    response_format="mp3",
                    instructions=instructions
                )
            )

            print(f"  ✓ 完整音频生成成功 ({len(full_audio_data)} bytes)")

            # 计算时间边界
            print("\n步骤 2/3: 计算分割点...")

            # 估算总时长（假设平均语速: 每分钟约 200-250 个中文字符）
            # 这里使用更精确的估算
            total_chars = len(full_narration)
            # 估算总时长（毫秒）: 字符数 * 每字符平均时长
            # 中文语速约 4-5 字符/秒，所以每字符约 200-250ms
            estimated_duration_ms = int(total_chars * 240 / speed)

            boundaries = calculate_segment_boundaries(segments, estimated_duration_ms)
            print(f"  ✓ 估算总时长: {estimated_duration_ms}ms ({estimated_duration_ms/1000:.1f}秒)")
            for i, (seg, (start, end)) in enumerate(zip(segments, boundaries)):
                print(f"     {seg['moduleId']}: {start}ms - {end}ms (时长: {end-start}ms)")

            # 分割音频
            print("\n步骤 3/3: 分割音频文件...")

            from pydub import AudioSegment
            from io import BytesIO

            audio = AudioSegment.from_mp3(BytesIO(full_audio_data))
            actual_duration_ms = len(audio)
            print(f"  实际音频时长: {actual_duration_ms}ms")

            # 根据实际时长重新计算边界
            boundaries = calculate_segment_boundaries(segments, actual_duration_ms)

            module_ids = [seg["moduleId"] for seg in segments]

            for module_id, (start_ms, end_ms) in zip(module_ids, boundaries):
                audio_file = output_dir / f"{module_id}.mp3"

                try:
                    # 提取片段
                    segment_audio = audio[start_ms:end_ms]

                    # 保存
                    segment_audio.export(str(audio_file), format="mp3")
                    audio_files[module_id] = str(audio_file)
                    print(f"  ✓ {module_id}: {audio_file.name}")
                except Exception as e:
                    print(f"  ✗ {module_id} 分割失败: {e}")
                    audio_files[module_id] = None

        except Exception as e:
            print(f"  ✗ 生成失败: {e}")
            print("  回退到 instructions 模式...")
            return await generate_module_audios_with_instructions(
                tts_data, output_dir, voice, speed, instructions
            )
    else:
        # 方法2: 使用 instructions 为每个 segment 单独生成，但保持一致的风格
        print("\n提示: 未安装 pydub，使用 instructions 模式确保语气一致")
        print("安装 pydub 可获得更精确的连贯效果: pip install pydub")
        return await generate_module_audios_with_instructions(
            tts_data, output_dir, voice, speed, instructions
        )

    print("=" * 60)
    success_count = sum(1 for v in audio_files.values() if v is not None)
    print(f"生成完成: {success_count}/{len(segments)} 成功")

    return audio_files


async def generate_module_audios_with_instructions(
    tts_data: dict,
    output_dir: Path,
    voice: str = "nova",
    speed: float = 1.0,
    instructions: str = None
) -> dict:
    """
    为每个模块生成独立音频文件，使用 instructions 确保语气一致

    Args:
        tts_data: 转换后的TTS格式数据
        output_dir: 音频输出目录
        voice: 语音类型
        speed: 语速
        instructions: 语音风格指令

    Returns:
        模块ID到音频文件路径的映射
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    audio_files = {}

    print(f"\n开始生成音频 (voice={voice}, speed={speed})")
    print("=" * 60)

    segments = tts_data.get("segments", [])

    for i, segment in enumerate(segments, 1):
        module_id = segment["moduleId"]
        audio_file = output_dir / f"{module_id}.mp3"

        # 构建单个 segment 的 JSON
        single_segment = {
            "segments": [segment],
            "fullNarration": segment["narration"]
        }

        try:
            print(f"\n[{i}/{len(segments)}] 生成 {module_id}...")

            # 为每个 segment 添加上下文提示，帮助保持连贯性
            segment_instructions = instructions or DEFAULT_VOICE_INSTRUCTIONS

            # 添加位置信息，帮助 TTS 理解这是文章的一部分
            if i == 1:
                segment_instructions += "\n这是文章的开头部分，请用开场介绍的语气。"
            elif i == len(segments):
                segment_instructions += "\n这是文章的结尾部分，请用总结收尾的语气。"
            else:
                segment_instructions += f"\n这是文章的第{i}部分，共{len(segments)}部分，请保持与前后段一致的流畅语调。"

            audio_path = await generate_speech_from_json(
                json_data=single_segment,
                output_path=str(audio_file),
                voice=voice,
                speed=speed,
                response_format="mp3",
                instructions=segment_instructions
            )
            audio_files[module_id] = str(audio_path)
            print(f"  ✓ 成功: {audio_path}")
        except Exception as e:
            print(f"  ✗ 失败: {e}")
            audio_files[module_id] = None

    print("=" * 60)
    success_count = sum(1 for v in audio_files.values() if v is not None)
    print(f"\n生成完成: {success_count}/{len(segments)} 成功")

    return audio_files


async def generate_module_audios(
    tts_data: dict,
    output_dir: Path,
    voice: str = "nova",
    speed: float = 1.0
) -> dict:
    """
    为每个模块生成独立音频文件（传统模式，不带 instructions）

    Args:
        tts_data: 转换后的TTS格式数据
        output_dir: 音频输出目录
        voice: 语音类型
        speed: 语速

    Returns:
        模块ID到音频文件路径的映射
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    audio_files = {}

    print(f"\n开始生成音频 (voice={voice}, speed={speed})")
    print("=" * 60)
    print("注意：这是传统模式，不同段落可能语气不一致")
    print("建议使用 --coherent-mode 获得更一致的语音效果")
    print("=" * 60)

    segments = tts_data.get("segments", [])

    for i, segment in enumerate(segments, 1):
        module_id = segment["moduleId"]
        audio_file = output_dir / f"{module_id}.mp3"

        # 构建单个 segment 的 JSON
        single_segment = {
            "segments": [segment],
            "fullNarration": segment["narration"]
        }

        try:
            print(f"\n[{i}/{len(segments)}] 生成 {module_id}...")
            audio_path = await generate_speech_from_json(
                json_data=single_segment,
                output_path=str(audio_file),
                voice=voice,
                speed=speed,
                response_format="mp3"
            )
            audio_files[module_id] = str(audio_path)
            print(f"  ✓ 成功: {audio_path}")
        except Exception as e:
            print(f"  ✗ 失败: {e}")
            audio_files[module_id] = None

    print("=" * 60)
    success_count = sum(1 for v in audio_files.values() if v is not None)
    print(f"\n生成完成: {success_count}/{len(segments)} 成功")

    return audio_files


async def process_article_to_tts(
    article_json: dict,
    output_dir: str = "output",
    voice: str = "nova",
    speed: float = 1.0,
    coherent_mode: bool = True,
    instructions: str = None
) -> dict:
    """
    完整的文章转TTS处理流程

    Args:
        article_json: english-sentence-explanation 生成的文章JSON
        output_dir: 音频输出目录
        voice: 语音类型
        speed: 语速
        coherent_mode: 是否使用连贯模式（推荐）
        instructions: 语音风格指令（可选，使用默认指令）

    Returns:
        带音频路径的完整JSON
    """
    article = article_json.get("article", {})
    output_path = Path(output_dir)

    # 1. 转换格式
    print("步骤 1/3: 转换文章格式...")
    tts_data = convert_article_to_tts_format(article_json)
    print(f"  ✓ 转换完成: {len(tts_data['segments'])} 个片段")

    # 2. 生成各部分音频
    print("\n步骤 2/3: 生成音频文件...")

    if coherent_mode:
        # 连贯模式：先生成完整音频再分割
        audio_files = await generate_coherent_audios(
            tts_data=tts_data,
            output_dir=output_path,
            voice=voice,
            speed=speed,
            instructions=instructions or DEFAULT_VOICE_INSTRUCTIONS
        )
    else:
        # 传统模式：每个 segment 单独生成
        audio_files = await generate_module_audios(
            tts_data=tts_data,
            output_dir=output_path,
            voice=voice,
            speed=speed
        )

    # 3. 构建输出JSON
    print("\n步骤 3/3: 构建输出JSON...")
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
            "speed": speed,
            "coherentMode": coherent_mode,
            "instructions": instructions or (DEFAULT_VOICE_INSTRUCTIONS if coherent_mode else None),
            "generatedAt": datetime.now().isoformat(),
            "totalSegments": len(tts_data["segments"]),
            "successfulSegments": sum(1 for v in audio_files.values() if v is not None)
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

    print("  ✓ 构建完成")
    return result


async def main():
    parser = argparse.ArgumentParser(
        description="将 english-sentence-explanation 文章转换为带语音的JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  # 使用连贯模式（推荐）：所有段落语气一致
  %(prog)s --input article.json --output-dir audio/ --coherent-mode

  # 指定语音和语速
  %(prog)s --input article.json --output-dir audio/ --voice nova --speed 1.0

  # 不使用连贯模式（传统方式）
  %(prog)s --input article.json --output-dir audio/ --no-coherent-mode

  # 自定义语音风格指令
  %(prog)s --input article.json --output-dir audio/ --instructions "以新闻主播的风格朗读"
        """,
    )

    parser.add_argument(
        "--input", "-i",
        required=True,
        help="输入的文章JSON文件路径 (english-sentence-explanation 输出)"
    )
    parser.add_argument(
        "--output", "-o",
        help="输出JSON文件路径 (默认: output/result-with-audio.json)"
    )
    parser.add_argument(
        "--output-dir", "-d",
        default="output",
        help="音频文件输出目录 (默认: output/)"
    )
    parser.add_argument(
        "--voice", "-v",
        choices=["alloy", "ash", "ballad", "coral", "echo", "fable", "nova",
                 "onyx", "sage", "shimmer", "verse", "marin", "cedar"],
        default="nova",
        help="语音类型 (默认: nova，推荐: marin 或 cedar 获得最佳质量)"
    )
    parser.add_argument(
        "--speed", "-s",
        type=float,
        default=1.0,
        help="语速，范围 0.25-4.0 (默认: 1.0)"
    )
    parser.add_argument(
        "--coherent-mode",
        action="store_true",
        default=True,
        help="使用连贯模式，确保所有段落语气一致 (默认开启)"
    )
    parser.add_argument(
        "--no-coherent-mode",
        action="store_true",
        help="禁用连贯模式，每个段落单独生成（可能语气不一致）"
    )
    parser.add_argument(
        "--instructions",
        help="自定义语音风格指令（覆盖默认指令）"
    )

    args = parser.parse_args()

    # 处理 --no-coherent-mode
    coherent_mode = not args.no_coherent_mode if args.no_coherent_mode else args.coherent_mode

    # 验证参数
    if args.speed < 0.25 or args.speed > 4.0:
        parser.error("语速必须在 0.25 到 4.0 之间")

    # 读取输入文件
    input_path = Path(args.input)
    if not input_path.exists():
        print(f"错误: 输入文件不存在: {input_path}")
        sys.exit(1)

    try:
        with open(input_path, "r", encoding="utf-8") as f:
            article_json = json.load(f)
    except json.JSONDecodeError as e:
        print(f"错误: 无效的JSON文件: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"错误: 读取文件失败: {e}")
        sys.exit(1)

    # 处理文章
    try:
        result = await process_article_to_tts(
            article_json=article_json,
            output_dir=args.output_dir,
            voice=args.voice,
            speed=args.speed,
            coherent_mode=coherent_mode,
            instructions=args.instructions
        )
    except Exception as e:
        print(f"\n错误: 处理失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    # 保存结果
    output_file = Path(args.output) if args.output else Path(args.output_dir) / "result-with-audio.json"
    output_file.parent.mkdir(parents=True, exist_ok=True)

    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)
        print(f"\n✓ 结果已保存: {output_file.absolute()}")
    except Exception as e:
        print(f"\n错误: 保存结果失败: {e}")
        sys.exit(1)

    # 打印摘要
    print("\n" + "=" * 60)
    print("处理摘要:")
    print(f"  标题: {result['title']}")
    print(f"  语音: {result['metadata']['voice']}")
    print(f"  语速: {result['metadata']['speed']}")
    print(f"  连贯模式: {'开启' if result['metadata']['coherentMode'] else '关闭'}")
    print(f"  生成时间: {result['metadata']['generatedAt']}")
    print(f"  成功: {result['metadata']['successfulSegments']}/{result['metadata']['totalSegments']}")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
