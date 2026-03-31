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


def build_parts(prompt, reference_image_path=None):
    parts = [{"text": prompt}]

    if reference_image_path:
        mime_type, _ = mimetypes.guess_type(reference_image_path)
        mime_type = mime_type or "image/png"

        with open(reference_image_path, "rb") as reference_file:
            reference_bytes = reference_file.read()

        parts.append(
            {
                "inlineData": {
                    "mimeType": mime_type,
                    "data": base64.b64encode(reference_bytes).decode("utf-8"),
                }
            }
        )

    return parts


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


def generate_image(prompt, output_file, aspect_ratio="1:1", image_size="1K", reference_image_path=None):
    # 获取脚本所在目录，并从中加载 .env.local
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(script_dir, "..", "..", "..", ".."))
    env_path = os.path.join(project_root, ".env.local")
    load_dotenv(env_path)
    api_key = os.getenv("AIFAST_API_KEY")
    base_url = os.getenv("AIFAST_BASE_URL", "https://aifast.site").rstrip("/")
    openai_base_url = os.getenv("OPENAI_BASE_URL", "").rstrip("/")

    if not api_key:
        print("Error: AIFAST_API_KEY not found in .env.local. Please ensure it is set.")
        sys.exit(1)

    candidate_urls = build_candidate_urls(base_url, openai_base_url)
    if not candidate_urls:
        print("Error: Could not derive a valid AIFAST endpoint from the configured base URLs.")
        sys.exit(1)

    headers = {
        "Accept": "application/json",
        "Authorization": api_key,
        "Content-Type": "application/json",
    }

    payload = {
        "contents": [{"parts": build_parts(prompt, reference_image_path)}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {
                "aspectRatio": aspect_ratio,
                "imageSize": image_size,
            },
        },
    }

    output_dir = os.path.dirname(output_file)
    if output_dir:
        os.makedirs(output_dir, exist_ok=True)

    print(f"Generating image with size {image_size} and ratio {aspect_ratio}...")

    attempt_errors = []
    for url in candidate_urls:
        response = None
        try:
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=300,
            )
            response.raise_for_status()
            data = response.json()

            image_bytes = extract_image_bytes(data)
            if not image_bytes:
                print("Error: Unexpected API response format.")
                print(data)
                sys.exit(1)

            with open(output_file, "wb") as output:
                output.write(image_bytes)

            print(f"Success: Image successfully saved to {output_file}")
            return
        except requests.exceptions.RequestException as error:
            details = response.text if response and hasattr(response, "text") else ""
            attempt_errors.append((url, error, details))

    failed_urls = ", ".join(url for url, _, _ in attempt_errors)
    print(f"API Request failed after trying: {failed_urls}")

    last_url, last_error, last_details = attempt_errors[-1]
    print(f"Last error: {last_error}")
    if "getaddrinfo failed" in str(last_error) or "NameResolutionError" in str(last_error):
        parsed = urlsplit(last_url)
        print(f"Resolved request host: {parsed.netloc}")
        print("Hint: AIFAST_BASE_URL should point to the reachable AIFAST host. This project can automatically fall back from api.aifast.site to aifast.site.")
    if last_details:
        print(f"Response details: {last_details}")
    sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate images using Gemini 3.1 Flash Image via AIFAST API")
    parser.add_argument("--prompt", required=True, help="Detailed image generation prompt")
    parser.add_argument("--output", required=True, help="Output file path (e.g., output.png)")
    parser.add_argument("--ratio", default="1:1", help="Aspect ratio (e.g., 16:9, 1:1)")
    parser.add_argument("--size", default="1K", help="Image size: 512px, 1K, 2K, 4K")
    parser.add_argument("--reference-image", default=None, help="Optional local reference image path")

    args = parser.parse_args()
    generate_image(args.prompt, args.output, args.ratio, args.size, args.reference_image)
