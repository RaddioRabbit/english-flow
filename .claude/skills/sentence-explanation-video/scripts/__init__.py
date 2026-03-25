"""
句子讲解视频生成脚本包

提供将音频和图片合成为视频的功能
"""

from .generate_video import generate_explanation_video, check_ffmpeg

__all__ = ["generate_explanation_video", "check_ffmpeg"]
