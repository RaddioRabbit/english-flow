#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小红书英语原著句子解析内容生成器
为小红书平台生成英语原著句子的标题和专业分析内容
"""

import os
import argparse
import sys
import json

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    from openai import OpenAI
except ImportError:
    print("错误：未安装openai库，请运行: pip install openai", file=sys.stderr)
    sys.exit(1)


def load_config():
    """
    从 .env.local 或环境变量加载 API 配置。
    优先使用 .env.local 中的 ANTHROPIC_API_KEY（项目级 Kimi Key），
    兼容参考 skill 的 Kimi_API_KEY 格式。
    """
    config = {
        "api_key": None,
        "base_url": "https://api.moonshot.cn/v1",
        "model": "kimi-latest",
    }

    # 搜索 .env.local 文件路径（从脚本位置向上查找）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    possible_paths = []
    current = script_dir
    for _ in range(6):
        possible_paths.append(os.path.join(current, ".env.local"))
        current = os.path.dirname(current)

    for env_path in possible_paths:
        if os.path.exists(env_path):
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith('#'):
                            continue
                        if '=' not in line:
                            continue
                        key, _, value = line.partition('=')
                        key = key.strip()
                        value = value.strip().strip('"\'').strip()

                        if key == 'ANTHROPIC_API_KEY' and not config["api_key"]:
                            config["api_key"] = value
                        elif key == 'Kimi_API_KEY' and not config["api_key"]:
                            config["api_key"] = value
                            # Kimi_API_KEY 明确对应 moonshot.cn 端点
                            config["base_url"] = "https://api.moonshot.cn/v1"
                        elif key == 'OPENAI_API_BASE':
                            config["base_url"] = value
                        elif key == 'OPENAI_MODEL':
                            config["model"] = value
            except Exception as e:
                print(f"[WARN] 读取 {env_path} 失败: {e}", file=sys.stderr)
            break  # 找到第一个 .env.local 就停止

    # 环境变量兜底
    if not config["api_key"]:
        config["api_key"] = (
            os.getenv('ANTHROPIC_API_KEY')
            or os.getenv('Kimi_API_KEY')
        )

    return config


def build_prompt(sentence: str, book: str, author: str) -> str:
    return f"""请为小红书创作一篇英语原著句子的专业解析内容，严格按照要求输出：

句子："{sentence}"
出处：{author}《{book}》

输出要求：
1. 首先生成5个适用于小红书的推荐标题，每个标题格式必须是：《{book}》的"[核心特点]"
   - 核心特点要精准概括这个句子的独特之处
   - 5个标题各有侧重，从不同角度切入（修辞手法、情感表达、叙事技巧、哲理深度、对话艺术等）
   - 参考示例：《傲慢与偏见》的"预期违背"、《双城记》的"孤独哲思"

2. 引言第一句必须突出这个句子自身的独特特点，吸引读者

3. 确保完整输出所有部分（核心修辞、词汇宝库、句式突破），不要截断任何内容

4. 纯文本格式，不使用任何markdown符号（如**、#、-等）

5. 使用以下emoji标记各部分

输出格式（严格遵循）：
推荐标题（5个）：
1. 《{book}》的"[核心特点1]"
2. 《{book}》的"[核心特点2]"
3. 《{book}》的"[核心特点3]"
4. 《{book}》的"[核心特点4]"
5. 《{book}》的"[核心特点5]"

✨{author}《{book}》的[句子特点]！雅思[相关主题]的范本！

核心修辞：[修辞艺术主题]
✔️ [修辞手法名称]："[原文引用]"[效果分析]
✔️ [修辞手法名称]："[原文引用]"[效果分析]
✔️ [修辞手法名称]："[原文引用]"[效果分析]

词汇宝库：[词汇主题]
💡 [词汇类别]：
[英文词汇]（中文释义）
[英文词汇]（中文释义）
💡 [词汇类别]：
[英文词汇]（中文释义）
[英文词汇]（中文释义）

句式突破：雅思高分表达模板
🌟 [句式类型]："[原文句式结构]"[应用说明]
🌟 [句式类型]："[原文句式结构]"[应用说明]
🌟 [句式类型]："[原文句式结构]"[应用说明]

注意事项：
- 标题的核心特点要新颖、吸引人
- 分析专业精准，突出雅思写作和口语的实用价值
- 语言既专业又有小红书亲和力
- 全部字数不超过900字"""


def generate_xiaohongshu_content(sentence: str, book: str, author: str) -> dict:
    """
    调用 Kimi API 生成小红书内容，返回包含 titles 和 content 的字典。
    """
    config = load_config()

    if not config["api_key"]:
        return {
            "error": "未找到 API Key。请在 .env.local 中设置 ANTHROPIC_API_KEY 或 Kimi_API_KEY。",
            "titles": [],
            "content": ""
        }

    try:
        client = OpenAI(
            api_key=config["api_key"],
            base_url=config["base_url"],
        )

        prompt = build_prompt(sentence, book, author)

        response = client.chat.completions.create(
            model=config["model"],
            messages=[
                {
                    "role": "system",
                    "content": "你是一位精通英语文学和雅思考试的专家，擅长为小红书创作吸引人的英语学习内容。你能准确把握句子的核心特点，并用简洁有力的语言进行专业解析。"
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=4000
        )

        raw_text = response.choices[0].message.content

        # 解析标题和正文
        titles = []
        content_lines = []
        in_titles = False
        titles_done = False

        for line in raw_text.split('\n'):
            stripped = line.strip()

            if not titles_done:
                if stripped.startswith('推荐标题'):
                    in_titles = True
                    continue
                if in_titles:
                    # 标题行：1. 《...》的"..."
                    import re
                    m = re.match(r'^\d+\.\s*(.+)', stripped)
                    if m:
                        titles.append(m.group(1).strip())
                    elif stripped == '' and titles:
                        titles_done = True
                        in_titles = False
                    continue

            if titles_done or not in_titles:
                content_lines.append(line)

        content = '\n'.join(content_lines).strip()

        return {
            "titles": titles,
            "content": content,
            "raw": raw_text
        }

    except Exception as e:
        err = str(e).encode('utf-8', errors='ignore').decode('utf-8')
        return {
            "error": f"API 调用失败: {err}",
            "titles": [],
            "content": ""
        }


def main():
    parser = argparse.ArgumentParser(
        description='小红书英语原著句子解析内容生成器',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例：
  python generate_xiaohongshu.py -s "It was the best of times" -b "双城记" -a "狄更斯"
        """
    )
    parser.add_argument('--sentence', '-s', required=True, help='英语句子')
    parser.add_argument('--book', '-b', required=True, help='书名')
    parser.add_argument('--author', '-a', required=True, help='作者名')
    parser.add_argument('--json', action='store_true', help='以 JSON 格式输出')

    args = parser.parse_args()

    result = generate_xiaohongshu_content(args.sentence, args.book, args.author)

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        if result.get("error"):
            print(f"错误：{result['error']}", file=sys.stderr)
            sys.exit(1)

        if result.get("raw"):
            print(result["raw"])
        else:
            if result["titles"]:
                print("推荐标题（5个）：")
                for i, t in enumerate(result["titles"], 1):
                    print(f"{i}. {t}")
                print()
            print(result["content"])


if __name__ == "__main__":
    main()
