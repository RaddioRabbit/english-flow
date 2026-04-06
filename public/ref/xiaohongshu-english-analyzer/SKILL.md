---
name: xiaohongshu-english-analyzer
description: 为小红书创建英语原著句子的雅思解析内容，包括吸引人的标题和深度分析。当用户要求分析英语原著句子、创建小红书内容或进行雅思学习解析时使用此skill。
---

# 小红书英语原著雅思解析器

## 功能说明
为小红书平台创建英语文学原著句子的深度解析内容，包括：
1. 吸引人的标题（格式：《书名》的"[核心特点]"）
2. 从雅思考试角度的专业分析
3. 修辞、词汇、句式三大板块解析

## 使用方法

当用户提供英语原著句子并要求分析或创建小红书内容时，执行以下步骤：

### 步骤1：识别用户请求
用户请求通常包含：
- 英语原著句子
- 书名和作者信息
- 明确或隐含的小红书发布意图

### 步骤2：运行分析脚本
使用bash执行Python脚本：

```bash
python .claude/skills/xiaohongshu-english-analyzer/scripts/analyze_for_xiaohongshu.py --sentence "用户提供的英语句子" --book "书名" --author "作者名"