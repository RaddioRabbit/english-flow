import os
import base64
import json
import requests
import argparse
from dotenv import load_dotenv

# 加载 .env.local
load_dotenv(".env.local")

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

def transform_image(ref_path, target_path, prompt, ratio="16:9", size="2K"):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("错误: 未在 .env.local 中找到 GEMINI_API_KEY")
        return False

    # 使用推荐的 gemini-3.1-flash-image-preview 模型接口
    # 注意：根据参考文档，编辑场景建议使用官方 SDK，cURL 示例用的是 inline_data。
    # 这里我们保持 REST API 调用方式。
    url = f"https://cdn.12ai.org/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key={api_key}"

    # 构建请求负载
    # 我们按照高级合成的思路，提供两张图作为上下文，利用 Prompt 区分角色
    payload = {
        "contents": [{
            "parts": [
                {"text": "Image 1 (Source of text style and content): "},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": encode_image(ref_path)
                    }
                },
                {"text": "Image 2 (Target background image to be preserved): "},
                {
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": encode_image(target_path)
                    }
                },
                {"text": f"Instruction: {prompt}"}
            ]
        }],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                # 使用传入的宽高比和分辨率参数
                "aspectRatio": ratio,
                "imageSize": size
            }
        }
    }

    headers = {"Content-Type": "application/json"}

    print("正在向 12ai.org 发送高精度文字合成请求...")
    try:
        response = requests.post(url, headers=headers, data=json.dumps(payload), timeout=300, proxies={'http': None, 'https': None})
        response.raise_for_status() # 检查 HTTP 错误
        result = response.json()

        # 提取 Base64 数据并保存
        if 'candidates' in result and result['candidates']:
            image_data = result['candidates'][0]['content']['parts'][0]['inlineData']['data']
            output_filename = "text_transfer_output.png"
            with open(output_filename, "wb") as f:
                f.write(base64.b64decode(image_data))
            print(f"成功！文字迁移后的图片已保存为 {output_filename}")
            return True
        else:
            error_msg = f"API 返回异常，未找到图片数据: {result}"
            print(error_msg)
            raise Exception(error_msg)

    except requests.exceptions.Timeout:
        error_msg = "错误: 请求超时。高分辨率生成可能需要更长时间。"
        print(error_msg)
        raise Exception(error_msg)
    except requests.exceptions.RequestException as e:
        error_msg = f"请求失败: {str(e)}"
        print(error_msg)
        raise Exception(error_msg)
    except Exception as e:
        error_msg = f"处理响应时发生未知错误: {str(e)}"
        print(error_msg)
        raise Exception(error_msg)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gemini Cross-Image Text Transfer Tool")
    parser.add_argument("--ref", required=True, help="Path to reference image (text source)")
    parser.add_argument("--target", required=True, help="Path to target image (background source)")
    parser.add_argument("--prompt", required=True, help="Detailed generation prompt")
    parser.add_argument("--ratio", default="16:9", help="Aspect ratio (1:1, 3:4, 4:3, 9:16, 16:9, 2:3, 3:2)")
    parser.add_argument("--size", default="2K", help="Image size (512px, 1K, 2K, 4K)")
    args = parser.parse_args()

    try:
        success = transform_image(args.ref, args.target, args.prompt, args.ratio, args.size)
        if not success:
            exit(1)
    except Exception as e:
        print(f"错误: {e}")
        exit(1)