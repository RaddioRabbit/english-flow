#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
小红书英语原著句子雅思解析器
为小红书平台生成英语文学原著句子的专业解析内容
"""

import os
import argparse
import sys

# 设置 stdout 编码为 UTF-8（解决 Windows 乱码问题）
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

try:
    from openai import OpenAI
except ImportError:
    print("错误：未安装openai库，请运行: pip install openai")
    sys.exit(1)

# 调试：打印当前工作目录和脚本位置
print(f"[DEBUG] 当前工作目录: {os.getcwd()}", file=sys.stderr)
print(f"[DEBUG] 脚本位置: {os.path.dirname(os.path.abspath(__file__))}", file=sys.stderr)


def load_api_key():
    """
    从.env.local文件加载Kimi API Key

    Returns:
        str: API密钥，如果未找到则返回None
    """
    # 尝试从.env.local文件读取（先尝试当前目录，再尝试项目根目录）
    possible_paths = [".env.local", "../../../.env.local", "../../../../.env.local"]

    for env_path in possible_paths:
        abs_path = os.path.abspath(env_path)
        if os.path.exists(env_path):
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('Kimi_API_KEY='):
                            # 移除引号（如果有）并清理所有空白字符
                            api_key = line.split('=', 1)[1].strip()
                            api_key = api_key.strip('"\'')
                            # 移除所有空格、制表符、换行符
                            api_key = ''.join(api_key.split())
                            # 确保是有效的格式 (sk- 开头)
                            if not api_key.startswith('sk-'):
                                print(f"[警告] API Key 格式不正确，应以 'sk-' 开头", file=sys.stderr)
                            return api_key
            except Exception as e:
                print(f"读取.env.local文件时出错: {e}", file=sys.stderr)

    # 如果文件不存在或未找到，尝试从环境变量读取
    env_key = os.getenv('Kimi_API_KEY')
    if env_key:
        print(f"[DEBUG] 从环境变量加载 API Key: {env_key[:8]}...", file=sys.stderr)
    else:
        print("[DEBUG] 未找到 API Key", file=sys.stderr)
    return env_key


def analyze_for_xiaohongshu(sentence: str, book: str, author: str) -> str:
    """
    调用Kimi Moonshot API生成小红书英语句子解析内容

    Args:
        sentence: 要分析的英语句子
        book: 书名
        author: 作者名

    Returns:
        str: 生成的小红书内容
    """
    api_key = load_api_key()

    if not api_key:
        return """错误：未找到Kimi_API_KEY

请在项目根目录创建.env.local文件，并添加Kimi API Key：
Kimi_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

获取地址：https://platform.moonshot.cn/

或者设置环境变量：
export Kimi_API_KEY=your_api_key_here"""

    try:
        # 获取 API Base URL（支持 Kimi Code）
        api_base = os.getenv('OPENAI_API_BASE', 'https://api.moonshot.cn/v1')

        # 初始化OpenAI客户端
        client = OpenAI(
            api_key=api_key,
            base_url=api_base,
            default_headers={
                'User-Agent': 'claude-code/1.0.0',
                'X-API-Source': 'claude-code'
            }
        )

        # 构建提示词
        prompt = f"""请为小红书创作一篇英语原著句子的雅思解析内容，严格按照要求输出：

句子："{sentence}"
出处：{author}《{book}》

输出要求：
1. 首先生成5个适用于小红书的推荐标题，每个标题格式必须是：《{book}》的"[核心特点]"
   - 每个标题的核心特点要精准概括这个句子的独特之处
   - 5个标题要各有侧重，从不同角度切入（如修辞手法、情感表达、叙事技巧、哲理深度、对话艺术等）
   - 参考示例：《傲慢与偏见》的"预期违背"、《傲慢与偏见》的"无效沟通"、《傲慢与偏见》的"优雅反驳"、《鲁滨逊漂流记》的"孤独哲思"

2. 引言第一句必须突出这个句子自身的独特特点，吸引读者

3. 确保完整输出所有部分（核心修辞、词汇宝库、句式突破），不要截断任何内容

4. 纯文本格式，不使用任何markdown符号（如**、#、-等）

5. 使用以下emoji标记各部分

输出格式：
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
- 标题的"核心特点"要新颖、吸引人，能让读者一眼看出这个句子的独特价值
- 分析要专业、精准，突出雅思写作和口语的实用价值
- 词汇解析要包含高级副词、名词组合、动词、经典表达等
- 句式要提炼出可复用的模板结构
- 语言简洁有力，避免冗余
- 整体风格既要专业又要有小红书的亲和力
- 确保"句式突破：雅思高分表达模板"部分完整输出，不要省略
- 全部字数不超过900字，不超过900字，不超过900字！！！！！！！！"""

        # 调用API
        model_name = os.getenv('OPENAI_MODEL', 'kimi-latest')
        response = client.chat.completions.create(
            model=model_name,
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

        return response.choices[0].message.content

    except Exception as e:
        error_msg = str(e)
        # 过滤可能导致乱码的字符
        error_msg = error_msg.encode('utf-8', errors='ignore').decode('utf-8')
        return f"""错误：API调用失败

详细信息：{error_msg}

可能的原因：
1. API密钥无效或已过期
2. 网络连接问题
3. API服务暂时不可用

解决方案：
1. 访问 https://platform.moonshot.cn/ 获取新的API密钥
2. 检查网络连接是否正常
3. 确保账户有充足的API配额"""


def main():
    """主函数：解析命令行参数并执行分析"""
    parser = argparse.ArgumentParser(
        description='小红书英语原著句子雅思解析器',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例：
  python analyze_for_xiaohongshu.py -s "It was the best of times" -b "双城记" -a "狄更斯"

  python analyze_for_xiaohongshu.py \\
    --sentence "I was now in the twenty-third year of my residence" \\
    --book "鲁滨逊漂流记" \\
    --author "笛福"
        """
    )

    parser.add_argument(
        '--sentence', '-s',
        required=True,
        help='要分析的英语句子'
    )
    parser.add_argument(
        '--book', '-b',
        required=True,
        help='书名'
    )
    parser.add_argument(
        '--author', '-a',
        required=True,
        help='作者名'
    )

    args = parser.parse_args()

    # 执行分析
    result = analyze_for_xiaohongshu(args.sentence, args.book, args.author)

    # 输出结果
    print(result)


if __name__ == "__main__":
    main()
