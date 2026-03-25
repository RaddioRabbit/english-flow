import argparse
import base64
import mimetypes
import os
import sys

import requests
from dotenv import load_dotenv


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


def generate_image(prompt, output_file, aspect_ratio="1:1", image_size="1K", reference_image_path=None):
    load_dotenv(".env.local")
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        print("Error: GEMINI_API_KEY not found in .env.local. Please ensure it is set.")
        sys.exit(1)

    url = f"https://cdn.12ai.org/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key={api_key}"
    headers = {"Content-Type": "application/json"}

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

    response = None
    try:
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            proxies={"http": None, "https": None},
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
    except requests.exceptions.RequestException as error:
        print(f"API Request failed: {error}")
        if response and hasattr(response, "text"):
            print(f"Response details: {response.text}")
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate images using Gemini 3.1 Flash Image via 12ai.org")
    parser.add_argument("--prompt", required=True, help="Detailed image generation prompt")
    parser.add_argument("--output", required=True, help="Output file path (e.g., output.png)")
    parser.add_argument("--ratio", default="1:1", help="Aspect ratio (e.g., 16:9, 1:1)")
    parser.add_argument("--size", default="1K", help="Image size: 512px, 1K, 2K, 4K")
    parser.add_argument("--reference-image", default=None, help="Optional local reference image path")

    args = parser.parse_args()
    generate_image(args.prompt, args.output, args.ratio, args.size, args.reference_image)
