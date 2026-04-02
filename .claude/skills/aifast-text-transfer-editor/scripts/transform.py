import argparse
import base64
import mimetypes
import os
import sys
from urllib.parse import urlsplit, urlunsplit

import requests
from dotenv import load_dotenv


MODEL_ENDPOINT_PATH = "/v1beta/models/gemini-3.1-flash-image-preview:generateContent"
LEGACY_MODEL_ENDPOINT_PATH = "/v1/v1beta/models/gemini-3.1-flash-image-preview:generateContent"


def encode_image(image_path):
    mime_type, _ = mimetypes.guess_type(image_path)
    mime_type = mime_type or "image/png"
    with open(image_path, "rb") as f:
        data = base64.b64encode(f.read()).decode("utf-8")
    return mime_type, data


def extract_image_bytes(payload):
    candidates = payload.get("candidates") or []
    if not candidates:
        return None
    parts = candidates[0].get("content", {}).get("parts", [])
    for part in parts:
        inline_data = part.get("inlineData")
        if inline_data and inline_data.get("data"):
            return base64.b64decode(inline_data["data"])
    return None


def add_candidate(urls, raw_url):
    normalized = (raw_url or "").strip()
    if not normalized:
        return
    parsed = urlsplit(normalized)
    if not parsed.scheme or not parsed.netloc:
        return
    final_url = urlunsplit((parsed.scheme, parsed.netloc, parsed.path.rstrip("/"), parsed.query, parsed.fragment))
    if final_url not in urls:
        urls.append(final_url)


def build_candidate_urls(base_url, openai_base_url=None):
    urls = []
    normalized_base_url = (base_url or "https://aifast.site").strip().rstrip("/")
    normalized_openai_base_url = (openai_base_url or "").strip().rstrip("/")

    def add_from_base(candidate_base_url):
        if not candidate_base_url:
            return
        if "generateContent" in candidate_base_url:
            add_candidate(urls, candidate_base_url)
        else:
            add_candidate(urls, f"{candidate_base_url}{MODEL_ENDPOINT_PATH}")
            add_candidate(urls, f"{candidate_base_url}{LEGACY_MODEL_ENDPOINT_PATH}")

    add_from_base(normalized_base_url)

    parsed_base = urlsplit(normalized_base_url)
    if parsed_base.netloc == "api.aifast.site":
        swapped_host = urlunsplit((parsed_base.scheme or "https", "aifast.site", parsed_base.path, parsed_base.query, parsed_base.fragment))
        add_from_base(swapped_host)

    for candidate in list(urls):
        if "/v1/v1beta/" in candidate:
            add_candidate(urls, candidate.replace("/v1/v1beta/", "/v1beta/"))
        elif "/v1beta/" in candidate:
            add_candidate(urls, candidate.replace("/v1beta/", "/v1/v1beta/"))

    if normalized_openai_base_url:
        parsed_openai = urlsplit(normalized_openai_base_url)
        openai_root_path = parsed_openai.path
        if openai_root_path.endswith("/v1"):
            openai_root_path = openai_root_path[: -len("/v1")]
        openai_root = urlunsplit((parsed_openai.scheme, parsed_openai.netloc, openai_root_path.rstrip("/"), "", ""))
        add_from_base(openai_root)

    def candidate_priority(candidate_url):
        parsed = urlsplit(candidate_url)
        host_priority = 2
        if parsed.netloc == "aifast.site":
            host_priority = 0
        elif parsed.netloc == "api.aifast.site":
            host_priority = 1
        path_priority = 2
        if "/v1beta/" in parsed.path and "/v1/v1beta/" not in parsed.path:
            path_priority = 0
        elif "/v1/v1beta/" in parsed.path:
            path_priority = 1
        return (host_priority, path_priority)

    return sorted(urls, key=candidate_priority)


def transform_image(ref_path, target_path, prompt, output_file, ratio="16:9", size="2K"):
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, "..", "..", "..", ".."))
    env_path = os.path.join(project_root, ".env.local")
    load_dotenv(env_path)

    api_key = os.getenv("AIFAST_API_KEY")
    base_url = os.getenv("AIFAST_BASE_URL", "https://aifast.site").rstrip("/")
    openai_base_url = os.getenv("OPENAI_BASE_URL", "").rstrip("/")

    if not api_key:
        print("Error: AIFAST_API_KEY not found in .env.local.")
        sys.exit(1)

    ref_mime, ref_data = encode_image(ref_path)
    target_mime, target_data = encode_image(target_path)

    payload = {
        "contents": [{
            "parts": [
                {"text": "Image 1 (Reference - source of text style and content): "},
                {"inlineData": {"mimeType": ref_mime, "data": ref_data}},
                {"text": "Image 2 (Target - background image to be preserved): "},
                {"inlineData": {"mimeType": target_mime, "data": target_data}},
                {"text": f"Instruction: {prompt}"}
            ]
        }],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": ratio,
                "imageSize": size
            }
        }
    }

    headers = {
        "Accept": "application/json",
        "Authorization": api_key,
        "Content-Type": "application/json",
    }

    candidate_urls = build_candidate_urls(base_url, openai_base_url)
    if not candidate_urls:
        print("Error: Could not derive a valid AIFAST endpoint.")
        sys.exit(1)

    output_dir = os.path.dirname(output_file)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    print(f"正在发送文字迁移请求 (size={size}, ratio={ratio})...")

    attempt_errors = []
    for url in candidate_urls:
        response = None
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=300)
            response.raise_for_status()
            data = response.json()

            image_bytes = extract_image_bytes(data)
            if not image_bytes:
                print("Error: Unexpected API response format.")
                print(data)
                sys.exit(1)

            with open(output_file, "wb") as f:
                f.write(image_bytes)

            print(f"成功！文字迁移后的图片已保存为 {output_file}")
            return
        except requests.exceptions.RequestException as error:
            details = response.text if response and hasattr(response, "text") else ""
            attempt_errors.append((url, error, details))

    failed_urls = ", ".join(url for url, _, _ in attempt_errors)
    print(f"API 请求失败，已尝试: {failed_urls}")
    last_url, last_error, last_details = attempt_errors[-1]
    print(f"最后一次错误: {last_error}")
    if last_details:
        print(f"响应详情: {last_details}")
    sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AIFAST Cross-Image Text Transfer Tool")
    parser.add_argument("--ref", required=True, help="参考图路径（文字风格来源）")
    parser.add_argument("--target", required=True, help="目标图路径（背景图，保持不变）")
    parser.add_argument("--prompt", required=True, help="详细的合成指令")
    parser.add_argument("--output", required=True, help="输出图片保存路径（如 output.png）")
    parser.add_argument("--ratio", default="16:9", help="宽高比（1:1, 3:4, 4:3, 9:16, 16:9, 2:3, 3:2）")
    parser.add_argument("--size", default="2K", help="图片分辨率（512px, 1K, 2K, 4K）")
    args = parser.parse_args()

    transform_image(args.ref, args.target, args.prompt, args.output, args.ratio, args.size)
