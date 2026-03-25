#!/usr/bin/env python3
"""
句子讲解视频生成脚本

将 sentence-explanation-tts 生成的音频和五张解析图片合成为视频。

用法:
    python generate_video.py -i result-with-audio.json -img images/ -o video.mp4
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Dict, List, Optional, Tuple


def check_ffmpeg() -> bool:
    """检查FFmpeg是否已安装"""
    try:
        subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            check=True
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def get_audio_duration(audio_path: str) -> float:
    """获取音频文件的时长（秒）"""
    try:
        result = subprocess.run(
            [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                audio_path
            ],
            capture_output=True,
            text=True,
            check=True
        )
        return float(result.stdout.strip())
    except (subprocess.CalledProcessError, ValueError) as e:
        print(f"警告: 无法获取音频时长 {audio_path}: {e}")
        return 0.0


def find_image(images_dir: Path, image_ref: str) -> Optional[Path]:
    """在图片目录中查找指定引用的图片"""
    extensions = [".png", ".jpg", ".jpeg", ".webp"]

    # 尝试不同的命名方式
    names_to_try = [
        image_ref,
        image_ref.replace("_", "-"),
        image_ref.replace("-", "_"),
    ]

    for name in names_to_try:
        for ext in extensions:
            image_path = images_dir / f"{name}{ext}"
            if image_path.exists():
                return image_path

    return None


def concatenate_audios(audio_paths: List[str], output_path: str) -> bool:
    """
    使用FFmpeg concat拼接多个音频文件

    Args:
        audio_paths: 音频文件路径列表
        output_path: 输出音频路径

    Returns:
        是否成功
    """
    if not audio_paths:
        return False

    if len(audio_paths) == 1:
        # 只有一个音频，直接复制
        shutil.copy(audio_paths[0], output_path)
        return True

    # 创建concat列表文件
    concat_file = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    try:
        for audio_path in audio_paths:
            # 使用file协议，路径中的特殊字符需要转义
            escaped_path = audio_path.replace("'", "'\\''")
            concat_file.write(f"file '{escaped_path}'\n")
        concat_file.close()

        # 使用concat demuxer拼接音频
        cmd = [
            "ffmpeg",
            "-y",  # 覆盖输出文件
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file.name,
            "-acodec", "libmp3lame",
            "-q:a", "2",
            output_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True
        )

        return result.returncode == 0

    finally:
        os.unlink(concat_file.name)


def create_video_segment(
    image_path: str,
    audio_path: str,
    output_path: str,
    width: int = 1080,
    height: int = 1920,
    fps: int = 30
) -> bool:
    """
    创建单个视频片段（图片+音频）

    Args:
        image_path: 图片路径
        audio_path: 音频路径
        output_path: 输出视频路径
        width: 视频宽度
        height: 视频高度
        fps: 帧率

    Returns:
        是否成功
    """
    # 获取音频时长
    duration = get_audio_duration(audio_path)
    if duration <= 0:
        print(f"错误: 无法获取音频时长 {audio_path}")
        return False

    cmd = [
        "ffmpeg",
        "-y",  # 覆盖输出文件
        "-loop", "1",  # 循环图片
        "-i", image_path,  # 输入图片
        "-i", audio_path,  # 输入音频
        "-c:v", "libx264",  # 视频编码器
        "-tune", "stillimage",  # 针对静态图片优化
        "-c:a", "aac",  # 音频编码器
        "-b:a", "192k",  # 音频比特率
        "-pix_fmt", "yuv420p",  # 像素格式
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black",
        "-r", str(fps),  # 帧率
        "-t", str(duration),  # 视频时长（等于音频时长）
        "-shortest",  # 以最短输入为准
        "-movflags", "+faststart",  # 快速启动
        output_path
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode != 0:
        print(f"FFmpeg错误: {result.stderr}")
        return False

    return True


def merge_video_segments(segment_paths: List[str], output_path: str) -> bool:
    """
    合并多个视频片段

    Args:
        segment_paths: 视频片段路径列表
        output_path: 输出视频路径

    Returns:
        是否成功
    """
    if not segment_paths:
        return False

    if len(segment_paths) == 1:
        # 只有一个片段，直接移动
        shutil.move(segment_paths[0], output_path)
        return True

    # 创建concat列表文件
    concat_file = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False)
    try:
        for segment_path in segment_paths:
            escaped_path = segment_path.replace("'", "'\\''")
            concat_file.write(f"file '{escaped_path}'\n")
        concat_file.close()

        # 使用concat demuxer合并视频
        cmd = [
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file.name,
            "-c", "copy",  # 直接复制，不重新编码
            "-movflags", "+faststart",
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            print(f"合并视频错误: {result.stderr}")
            return False

        return True

    finally:
        os.unlink(concat_file.name)


def resolve_audio_path(audio_path: str, base_dir: Path) -> Optional[str]:
    """
    解析音频文件路径

    尝试多种路径解析方式：
    1. 绝对路径
    2. 相对于base_dir的路径
    3. 相对于当前工作目录的路径

    Args:
        audio_path: 音频路径（可能相对或绝对）
        base_dir: 基础目录（通常是JSON文件所在目录）

    Returns:
        解析后的绝对路径，或None如果找不到
    """
    # 已经是绝对路径
    if os.path.isabs(audio_path):
        return audio_path if os.path.exists(audio_path) else None

    # 尝试相对于base_dir
    path_from_base = base_dir / audio_path
    if path_from_base.exists():
        return str(path_from_base.absolute())

    # 尝试相对于当前工作目录
    path_from_cwd = Path(audio_path)
    if path_from_cwd.exists():
        return str(path_from_cwd.absolute())

    return None


def save_data_url_to_file(data_url: str, output_path: str) -> bool:
    """
    将 base64 data URL 保存为文件

    Args:
        data_url: data:audio/mp3;base64,... 或 data:image/png;base64,... 格式的URL
        output_path: 输出文件路径

    Returns:
        是否成功
    """
    try:
        # 解析 data URL
        if not data_url.startswith("data:"):
            return False

        # 格式: data:[<mediatype>][;base64],<data>
        header, _, data = data_url.partition(",")
        if not data:
            return False

        # 检查是否有base64标记
        if "base64" not in header:
            return False

        # 解码并保存
        import base64
        file_bytes = base64.b64decode(data)

        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "wb") as f:
            f.write(file_bytes)

        return True
    except Exception as e:
        print(f"保存data URL失败: {e}")
        return False


def extract_images_from_task(data: dict, output_dir: str) -> Dict[str, str]:
    """
    从 Task 数据中提取图片

    支持两种来源：
    1. generatedImages (系统生成): { moduleId: { dataUrl: "..." } }
    2. images (直接传入): { moduleId: "data:image/..." }

    Args:
        data: Task JSON 数据或包含 images 的数据
        output_dir: 图片输出目录

    Returns:
        模块ID到图片路径的映射
    """
    images = {}
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # 尝试从 generatedImages 提取（系统格式）
    generated_images = data.get("generatedImages", {})
    for module_id in ["translation", "grammar", "summary", "vocabulary", "ielts"]:
        if module_id in generated_images:
            img_data = generated_images[module_id]
            if isinstance(img_data, dict):
                # 系统格式: { dataUrl: "...", publicUrl: "..." }
                data_url = img_data.get("dataUrl")
                if data_url and data_url.startswith("data:"):
                    img_path = output_path / f"{module_id}.png"
                    if save_data_url_to_file(data_url, str(img_path)):
                        images[module_id] = str(img_path)
                        print(f"  ✓ {module_id}: 从 generatedImages.dataUrl 提取")
                    continue

                # 尝试 publicUrl
                public_url = img_data.get("publicUrl")
                if public_url:
                    # publicUrl 需要下载，这里只做记录
                    print(f"  ! {module_id}: 检测到 publicUrl，需要手动下载: {public_url}")

    # 尝试从 images 字段提取（直接传入格式）
    direct_images = data.get("images", {})
    for module_id in ["translation", "grammar", "summary", "vocabulary", "ielts"]:
        if module_id in direct_images and module_id not in images:
            img_value = direct_images[module_id]
            if isinstance(img_value, str):
                if img_value.startswith("data:"):
                    # 是 data URL
                    img_path = output_path / f"{module_id}.png"
                    if save_data_url_to_file(img_value, str(img_path)):
                        images[module_id] = str(img_path)
                        print(f"  ✓ {module_id}: 从 images 字段提取")
                elif os.path.exists(img_value):
                    # 是文件路径
                    images[module_id] = img_value
                    print(f"  ✓ {module_id}: 使用现有文件 {img_value}")

    return images


async def generate_explanation_video(
    audio_json_path: str,
    images_dir: str,
    output_path: str = "output/video.mp4",
    width: int = 1080,
    height: int = 1920,
    fps: int = 30
) -> Dict:
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
        包含视频信息的字典
    """
    # 检查FFmpeg
    if not check_ffmpeg():
        raise RuntimeError("FFmpeg未找到，请先安装FFmpeg")

    # 解析路径
    audio_json_path = Path(audio_json_path).resolve()
    images_dir = Path(images_dir).resolve()
    output_path = Path(output_path).resolve()

    # 确保输出目录存在
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 读取JSON
    with open(audio_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # 创建临时目录
    temp_dir = tempfile.mkdtemp(prefix="video_gen_")

    try:
        # 提取音频路径或data URL
        base_dir = audio_json_path.parent

        def get_audio(key: str) -> Optional[str]:
            """
            从数据中获取音频路径或处理 audioDataUrl

            支持两种格式：
            1. 文件路径: { "audio": "path/to/file.mp3" }
            2. Data URL: { "audioDataUrl": "data:audio/mp3;base64,..." }
            """
            audio_data = None

            if key == "introduction":
                intro_data = data.get("introduction", {})
                audio_path = intro_data.get("audio")
                audio_data_url = intro_data.get("audioDataUrl")
            elif key == "conclusion":
                conclusion_data = data.get("conclusion", {})
                audio_path = conclusion_data.get("audio")
                audio_data_url = conclusion_data.get("audioDataUrl")
            else:
                # 从sections中查找
                for section in data.get("sections", []):
                    if section.get("moduleId") == key:
                        content = section.get("content", {})
                        audio_path = content.get("audio")
                        audio_data_url = content.get("audioDataUrl")

                        # 优先处理 audioDataUrl (base64)
                        if audio_data_url and audio_data_url.startswith("data:"):
                            temp_audio_path = os.path.join(temp_dir, f"{key}_audio.mp3")
                            if save_data_url_to_file(audio_data_url, temp_audio_path):
                                return temp_audio_path
                            return None

                        # 否则尝试文件路径
                        if audio_path:
                            return resolve_audio_path(audio_path, base_dir)
                        return None
                return None

            # 处理 introduction 和 conclusion
            # 优先处理 audioDataUrl (base64)
            if audio_data_url and audio_data_url.startswith("data:"):
                temp_audio_path = os.path.join(temp_dir, f"{key}_audio.mp3")
                if save_data_url_to_file(audio_data_url, temp_audio_path):
                    return temp_audio_path
                return None

            # 否则尝试文件路径
            if audio_path:
                return resolve_audio_path(audio_path, base_dir)
            return None

        # 收集所有音频
        audios = {
            "introduction": get_audio("introduction"),
            "translation": get_audio("translation"),
            "grammar": get_audio("grammar"),
            "summary": get_audio("summary"),
            "vocabulary": get_audio("vocabulary"),
            "ielts": get_audio("ielts"),
            "conclusion": get_audio("conclusion"),
        }

        # 检查音频文件
        print("检查音频文件...")
        for key, path in audios.items():
            if path:
                print(f"  ✓ {key}: {path}")
            else:
                print(f"  ✗ {key}: 未找到")

        # 查找图片
        print("\n检查图片文件...")
        images = {}

        # 首先尝试从 JSON 数据中提取图片（系统生成的 dataUrl）
        print("  尝试从JSON数据中提取图片...")
        images = extract_images_from_task(data, temp_dir)

        # 如果JSON中没有找到，再从图片目录查找
        missing_modules = [k for k in ["translation", "grammar", "summary", "vocabulary", "ielts"] if k not in images]
        if missing_modules:
            print(f"  从目录查找剩余图片: {missing_modules}")
            for key in missing_modules:
                image_path = find_image(images_dir, key)
                if image_path:
                    images[key] = str(image_path)
                    print(f"  ✓ {key}: {image_path}")
                else:
                    # 尝试其他常见命名
                    alt_names = [f"{key}_image", f"{key}-image", key.capitalize(), key.upper()]
                    for alt in alt_names:
                        image_path = find_image(images_dir, alt)
                        if image_path:
                            images[key] = str(image_path)
                            print(f"  ✓ {key} (as {alt}): {image_path}")
                            break

        # 检查是否所有图片都有了
        for key in ["translation", "grammar", "summary", "vocabulary", "ielts"]:
            if key not in images:
                raise FileNotFoundError(f"找不到图片: {key} (在JSON数据或目录 {images_dir} 中)")

        # 定义视频片段配置
        # 第1张图: introduction + translation
        # 第2张图: grammar
        # 第3张图: summary
        # 第4张图: vocabulary
        # 第5张图: ielts + conclusion
        segment_configs = [
            {
                "name": "translation",
                "image": images["translation"],
                "audios": [a for a in [audios["introduction"], audios["translation"]] if a]
            },
            {
                "name": "grammar",
                "image": images["grammar"],
                "audios": [a for a in [audios["grammar"]] if a]
            },
            {
                "name": "summary",
                "image": images["summary"],
                "audios": [a for a in [audios["summary"]] if a]
            },
            {
                "name": "vocabulary",
                "image": images["vocabulary"],
                "audios": [a for a in [audios["vocabulary"]] if a]
            },
            {
                "name": "ielts",
                "image": images["ielts"],
                "audios": [a for a in [audios["ielts"], audios["conclusion"]] if a]
            },
        ]

        # 生成视频片段
        print("\n生成视频片段...")
        segment_paths = []
        segment_info = []

        for i, config in enumerate(segment_configs, 1):
            print(f"\n片段 {i}/5: {config['name']}")

            if not config["audios"]:
                print(f"  警告: 没有音频，跳过")
                continue

            # 拼接音频
            concat_audio_path = os.path.join(temp_dir, f"{config['name']}_audio.mp3")
            print(f"  拼接音频...")
            if not concatenate_audios(config["audios"], concat_audio_path):
                print(f"  错误: 音频拼接失败")
                continue

            # 获取音频时长
            duration = get_audio_duration(concat_audio_path)
            print(f"  音频时长: {duration:.2f}秒")

            # 生成视频片段
            segment_path = os.path.join(temp_dir, f"{config['name']}.mp4")
            print(f"  生成视频片段...")
            if not create_video_segment(
                config["image"],
                concat_audio_path,
                segment_path,
                width, height, fps
            ):
                print(f"  错误: 视频片段生成失败")
                continue

            segment_paths.append(segment_path)
            segment_info.append({
                "module": config["name"],
                "duration": duration,
                "audio": concat_audio_path
            })
            print(f"  ✓ 完成")

        if not segment_paths:
            raise RuntimeError("没有成功生成任何视频片段")

        # 合并所有片段
        print(f"\n合并 {len(segment_paths)} 个视频片段...")
        if not merge_video_segments(segment_paths, str(output_path)):
            raise RuntimeError("视频合并失败")

        # 计算总时长
        total_duration = sum(s["duration"] for s in segment_info)

        print(f"\n✓ 视频生成完成: {output_path}")
        print(f"  总时长: {total_duration:.2f}秒")
        print(f"  分辨率: {width}x{height}")
        print(f"  帧率: {fps}fps")

        return {
            "videoPath": str(output_path),
            "duration": total_duration,
            "width": width,
            "height": height,
            "fps": fps,
            "segments": segment_info
        }

    finally:
        # 清理临时目录
        shutil.rmtree(temp_dir, ignore_errors=True)


def main():
    parser = argparse.ArgumentParser(
        description="将句子讲解的音频和图片合成为视频"
    )
    parser.add_argument(
        "-i", "--input",
        required=True,
        help="sentence-explanation-tts 生成的带音频JSON文件路径"
    )
    parser.add_argument(
        "-img", "--images",
        required=True,
        help="图片目录路径（包含5张解析图）"
    )
    parser.add_argument(
        "-o", "--output",
        default="output/video.mp4",
        help="输出视频文件路径（默认: output/video.mp4）"
    )
    parser.add_argument(
        "-w", "--width",
        type=int,
        default=1080,
        help="视频宽度（默认: 1080）"
    )
    parser.add_argument(
        "-ht", "--height",
        type=int,
        default=1920,
        help="视频高度（默认: 1920）"
    )
    parser.add_argument(
        "--fps",
        type=int,
        default=30,
        help="视频帧率（默认: 30）"
    )

    args = parser.parse_args()

    # 检查FFmpeg
    if not check_ffmpeg():
        print("错误: FFmpeg未找到")
        print("请先安装FFmpeg:")
        print("  macOS: brew install ffmpeg")
        print("  Ubuntu: sudo apt install ffmpeg")
        print("  Windows: 从 https://ffmpeg.org/download.html 下载")
        sys.exit(1)

    # 运行生成
    try:
        result = asyncio.run(generate_explanation_video(
            audio_json_path=args.input,
            images_dir=args.images,
            output_path=args.output,
            width=args.width,
            height=args.height,
            fps=args.fps
        ))

        print("\n" + "=" * 50)
        print("视频生成成功！")
        print("=" * 50)
        print(f"输出文件: {result['videoPath']}")
        print(f"总时长: {result['duration']:.2f}秒")
        print(f"分辨率: {result['width']}x{result['height']}")

    except Exception as e:
        print(f"\n错误: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
