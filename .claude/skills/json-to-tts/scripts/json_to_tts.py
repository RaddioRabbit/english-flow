#!/usr/bin/env python3
"""
JSON to TTS Script
将 JSON 格式的文本转换为语音，使用 OpenAI gpt-4o-mini-tts 模型
"""

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path
from typing import Optional

import aiohttp
from dotenv import load_dotenv

# 加载环境变量
def load_env():
    """加载 .env.local 文件中的环境变量"""
    env_paths = [
        Path(".env.local"),
        Path("../.env.local"),
        Path("../../.env.local"),
        Path("../../../.env.local"),
    ]

    for env_path in env_paths:
        if env_path.exists():
            load_dotenv(env_path, override=True)
            return

    # 如果没找到，尝试从当前工作目录向上查找
    current = Path.cwd()
    for parent in [current] + list(current.parents):
        env_file = parent / ".env.local"
        if env_file.exists():
            load_dotenv(env_file, override=True)
            return


load_env()

# API 配置
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
TTS_MODEL = "gpt-4o-mini-tts"


class TTSConfig:
    """TTS 配置类"""

    def __init__(
        self,
        voice: str = "alloy",
        speed: float = 1.0,
        response_format: str = "mp3",
        instructions: str = None,
    ):
        self.voice = voice
        self.speed = speed
        self.response_format = response_format
        self.instructions = instructions


async def call_tts_api(
    text: str,
    config: TTSConfig,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> bytes:
    """
    调用 OpenAI TTS API

    Args:
        text: 要转换为语音的文本
        config: TTS 配置
        api_key: OpenAI API Key（可选，默认从环境变量读取）
        base_url: API 基础 URL（可选，默认从环境变量读取）

    Returns:
        音频文件的二进制数据
    """
    key = api_key or OPENAI_API_KEY
    url = base_url or OPENAI_BASE_URL

    if not key:
        raise ValueError(
            "OpenAI API Key 未配置。请在 .env.local 中设置 OPENAI_API_KEY"
        )

    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": TTS_MODEL,
        "input": text,
        "voice": config.voice,
        "speed": config.speed,
        "response_format": config.response_format,
    }

    # 添加 instructions 参数（如果提供）
    if config.instructions:
        payload["instructions"] = config.instructions

    api_endpoint = f"{url.rstrip('/')}/audio/speech"

    async with aiohttp.ClientSession() as session:
        async with session.post(
            api_endpoint, headers=headers, json=payload
        ) as response:
            if response.status != 200:
                error_text = await response.text()
                raise RuntimeError(
                    f"TTS API 调用失败: HTTP {response.status}\n{error_text}"
                )

            return await response.read()


def parse_json_input(input_data: str) -> dict:
    """
    解析 JSON 输入

    Args:
        input_data: JSON 字符串或文件路径

    Returns:
        解析后的 JSON 字典
    """
    # 首先尝试作为文件路径解析
    input_path = Path(input_data)
    if input_path.exists() and input_path.suffix == ".json":
        with open(input_path, "r", encoding="utf-8") as f:
            return json.load(f)

    # 尝试直接解析 JSON 字符串
    try:
        return json.loads(input_data)
    except json.JSONDecodeError:
        raise ValueError(f"输入既不是有效的 JSON 文件路径，也不是有效的 JSON 字符串: {input_data}")


def extract_text_from_json(
    data: dict, use_full_narration: bool = False
) -> str:
    """
    从 JSON 数据中提取要转换为语音的文本

    Args:
        data: JSON 数据字典
        use_full_narration: 是否使用 fullNarration 字段

    Returns:
        提取的文本内容
    """
    if use_full_narration and "fullNarration" in data:
        return data["fullNarration"]

    segments = data.get("segments", [])
    if not segments:
        raise ValueError("JSON 中没有找到 segments 字段或该字段为空")

    # 拼接所有 segment 的 narration
    narrations = []
    for segment in segments:
        narration = segment.get("narration", "").strip()
        if narration:
            narrations.append(narration)

    if not narrations:
        raise ValueError("segments 中没有找到有效的 narration 内容")

    # 使用换行或空格连接各段
    return "\n\n".join(narrations)


async def generate_speech(
    input_path: str,
    output_path: str,
    voice: str = "alloy",
    speed: float = 1.0,
    response_format: str = "mp3",
    use_full_narration: bool = False,
    instructions: str = None,
) -> str:
    """
    生成语音文件

    Args:
        input_path: 输入 JSON 文件路径
        output_path: 输出音频文件路径
        voice: 语音类型
        speed: 语速
        response_format: 音频格式
        use_full_narration: 是否使用 fullNarration
        instructions: 语音风格指令（如语气、情感等）

    Returns:
        生成的音频文件路径
    """
    # 解析 JSON
    data = parse_json_input(input_path)

    # 提取文本
    text = extract_text_from_json(data, use_full_narration)

    if len(text) > 4096:
        print(f"警告: 文本长度 ({len(text)} 字符) 超过 4096 字符限制，将被截断")
        text = text[:4096]

    print(f"提取的文本内容 ({len(text)} 字符):")
    print("-" * 50)
    print(text[:200] + "..." if len(text) > 200 else text)
    print("-" * 50)

    # 创建配置
    config = TTSConfig(
        voice=voice,
        speed=speed,
        response_format=response_format,
        instructions=instructions,
    )

    # 调用 API
    instruction_info = f", instructions={instructions[:30]}..." if instructions else ""
    print(f"\n正在生成语音 (voice={voice}, speed={speed}, format={response_format}{instruction_info})...")
    audio_data = await call_tts_api(text, config)

    # 确保输出目录存在
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # 保存音频文件
    with open(output_file, "wb") as f:
        f.write(audio_data)

    file_size = len(audio_data) / 1024  # KB
    print(f"✓ 语音生成成功!")
    print(f"  文件: {output_file.absolute()}")
    print(f"  大小: {file_size:.1f} KB")

    return str(output_file.absolute())


async def generate_speech_from_json(
    json_data: dict,
    output_path: str,
    voice: str = "alloy",
    speed: float = 1.0,
    response_format: str = "mp3",
    use_full_narration: bool = False,
    instructions: str = None,
) -> str:
    """
    直接从 JSON 字典生成语音

    Args:
        json_data: JSON 数据字典
        output_path: 输出音频文件路径
        voice: 语音类型
        speed: 语速
        response_format: 音频格式
        use_full_narration: 是否使用 fullNarration
        instructions: 语音风格指令（如语气、情感等）

    Returns:
        生成的音频文件路径
    """
    # 提取文本
    text = extract_text_from_json(json_data, use_full_narration)

    if len(text) > 4096:
        print(f"警告: 文本长度 ({len(text)} 字符) 超过 4096 字符限制，将被截断")
        text = text[:4096]

    # 创建配置
    config = TTSConfig(
        voice=voice,
        speed=speed,
        response_format=response_format,
        instructions=instructions,
    )

    # 调用 API
    instruction_info = f", instructions={instructions[:30]}..." if instructions else ""
    print(f"正在生成语音 (voice={voice}, speed={speed}, format={response_format}{instruction_info})...")
    audio_data = await call_tts_api(text, config)

    # 确保输出目录存在
    output_file = Path(output_path)
    output_file.parent.mkdir(parents=True, exist_ok=True)

    # 保存音频文件
    with open(output_file, "wb") as f:
        f.write(audio_data)

    file_size = len(audio_data) / 1024  # KB
    print(f"✓ 语音生成成功!")
    print(f"  文件: {output_file.absolute()}")
    print(f"  大小: {file_size:.1f} KB")

    return str(output_file.absolute())


def main():
    parser = argparse.ArgumentParser(
        description="将 JSON 格式的文本转换为语音 (TTS)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  %(prog)s --input narration.json --output audio.mp3
  %(prog)s --input narration.json --output audio.mp3 --voice nova --speed 1.2
  %(prog)s --input narration.json --output audio.mp3 --use-full-narration
        """,
    )

    parser.add_argument(
        "--input",
        "-i",
        required=True,
        help="输入 JSON 文件路径或 JSON 字符串",
    )
    parser.add_argument(
        "--output",
        "-o",
        required=True,
        help="输出音频文件路径 (支持 .mp3, .opus, .aac, .flac)",
    )
    parser.add_argument(
        "--voice",
        "-v",
        choices=["alloy", "ash", "ballad", "coral", "echo", "fable", "nova",
                 "onyx", "sage", "shimmer", "verse", "marin", "cedar"],
        default="alloy",
        help="语音类型 (默认: alloy，推荐: marin 或 cedar 获得最佳质量)",
    )
    parser.add_argument(
        "--speed",
        "-s",
        type=float,
        default=1.0,
        help="语速，范围 0.25-4.0 (默认: 1.0)",
    )
    parser.add_argument(
        "--response-format",
        "-f",
        choices=["mp3", "opus", "aac", "flac"],
        default="mp3",
        help="音频格式 (默认: mp3)",
    )
    parser.add_argument(
        "--use-full-narration",
        "-F",
        action="store_true",
        help="使用 fullNarration 字段而不是拼接所有 segments",
    )
    parser.add_argument(
        "--instructions",
        help="语音风格指令，用于控制语气、情感、语调等 (gpt-4o-mini-tts 支持)",
    )

    args = parser.parse_args()

    # 验证参数
    if args.speed < 0.25 or args.speed > 4.0:
        parser.error("语速必须在 0.25 到 4.0 之间")

    # 运行异步任务
    try:
        result = asyncio.run(
            generate_speech(
                input_path=args.input,
                output_path=args.output,
                voice=args.voice,
                speed=args.speed,
                response_format=args.response_format,
                use_full_narration=args.use_full_narration,
                instructions=args.instructions,
            )
        )
        print(f"\n输出文件: {result}")
    except Exception as e:
        print(f"错误: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
