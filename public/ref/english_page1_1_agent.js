#!/usr/bin/env node
/**
 * English Page 1-1 Workflow Agent (Node.js版本)
 * 基于 Coze 工作流 english_page1_1-draft.yaml 转换的 Agent 可执行代码
 *
 * 功能：句子解析第一页（句译对照）图像生成
 * - 使用 Kimi API 生成图片提示词
 * - 使用 gemini-image-generation skill 生成图像
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
config({ path: '.env.local' });

// 配置
const KIMI_API_KEY = process.env.Kimi_API_KEY;
// 支持 OpenAI 兼容的 API，可以通过环境变量配置 base URL
const KIMI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.moonshot.cn/v1';
const GEMINI_SKILL_PATH = '.claude/skills/gemini-image-generation/scripts/generate_image.py';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * English Page 1-1 工作流实现类
 */
class EnglishPageWorkflow {
  /**
   * @param {string} [apiKey] - Kimi API Key，可选，默认从环境变量读取
   */
  constructor(apiKey) {
    this.apiKey = apiKey || KIMI_API_KEY;
    if (!this.apiKey) {
      throw new Error('Kimi_API_KEY 未设置，请在 .env.local 中配置');
    }
    // 调试：显示读取到的 Key 前缀（调试用，确认 Key 是否正确读取）
    console.log(`[调试] API Key 已读取: ${this.apiKey.substring(0, 20)}...`);
  }

  /**
   * 节点 122936: 使用大模型生成图片提示词
   *
   * @param {string} book - 书名
   * @param {string} origin - 原文句子
   * @returns {Promise<string>} 图片生成提示词
   */
  async generatePicPrompt(book, origin) {
    const systemPrompt = `你是一名会prompt的配图大师，如果你要给《${book}》的这句原文，结合这句原文的语境上下文：${origin}，配一张符合原文描述的图片，且不可怕的场景，在nano banana生成这张图片，你会怎么写提示词`;

    const userPrompt = `给《${book}》的这句原文，结合这句原文的语境上下文：${origin}，配一张符合原文描述的图片，且不可怕的场景，在nano banana生成这张图片，写生成这张图片的提示词`;

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code/1.0.0',
      'X-API-Source': 'claude-code'
    };

    // 支持自定义模型名称，默认为 kimi 兼容模型
    const modelName = process.env.OPENAI_MODEL || 'kimi-latest';

    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 32768
    };

    try {
      console.log('[调试] 发送请求到:', `${KIMI_API_BASE}/chat/completions`);
      console.log('[调试] 请求头 Authorization:', headers.Authorization.substring(0, 50) + '...');

      const response = await axios.post(
        `${KIMI_API_BASE}/chat/completions`,
        payload,
        { headers, timeout: 180000 }
      );

      const picPrompt = response.data.choices[0].message.content.trim();
      console.log(`[节点 122936] 已生成图片提示词: ${picPrompt.substring(0, 100)}...`);
      return picPrompt;
    } catch (error) {
      console.error('[错误] 生成图片提示词失败:', error.message);
      if (error.response) {
        console.error('[错误] 响应状态:', error.response.status);
        console.error('[错误] 响应数据:', JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }

  /**
   * 节点 141932: 组合最终的图像生成提示词
   *
   * @param {string} prompt1 - 英文原句 1
   * @param {string} prompt2 - 中文翻译 1
   * @param {string} prompt3 - 英文原句 2
   * @param {string} prompt4 - 中文翻译 2
   * @param {string} picPrompt - 大模型生成的图片提示词
   * @returns {string} 最终的图像生成提示词
   */
  buildFinalPrompt(prompt1, prompt2, prompt3, prompt4, picPrompt) {
    const finalPrompt = `仿照图片，生成一张垂直布局3:4画板的，设计1张【6宫格竖版英语教学条漫】，整体风格为：
教育型条漫插画、扁平化卡通风格、柔和低饱和配色、复古课堂黑板风、暖色仿旧纸张纹理背景，线条干净，适合小红书英语学习内容。
画面比例：竖版，3行2列，共6格。
【第1格】
西式羊皮卷轴样式展示英文原句（清晰可读）：
"可选：${prompt1}"
【第2格】
西式羊皮卷轴样式展示对应的中文翻译：
"${prompt2}"
【第3格】
继续西式羊皮卷轴形式，展示下一句或补充说明英文句子（清晰可读）：
"可选：${prompt3}"
【第4格】以西式羊皮卷轴的形式，展示对应的中文翻译：
"${prompt4}"【第5、6格合为一整格】以同样的画风展现文字所描绘的内容：${picPrompt}
整体画面风格统一、清晰、适合英语原著长难句讲解条漫。分格漫画布局，每张图都用5宫格展示，3:4画板展示，用1张图来展示内容，第1张图为："句译对照"，内容包括部分"原句"和"原句翻译"，只有原句和原句翻译对照，其他什么都不需要。图文结合紧密，就像专业的信息图设计，构图平衡。>**排除项（非常关键）**
文字遮挡人物，同一个人物的服装不一致，图片模糊，文字遮挡人物，对句子的语法、单词讲解等除了原句和原句翻译的其他内容，图片的每个宫格互相没有逻辑，人物的对话和句子讲解没关系，要讲解的句子字体太小，不按照图片一的排版和布局，人物没有讲解，非写实、非日漫、非水彩、非油画、非手绘涂鸦、非低幼儿童绘本风`;

    console.log(`[节点 141932] 已组合最终提示词 (长度: ${finalPrompt.length} 字符)`);
    return finalPrompt;
  }

  /**
   * 节点 117995: 使用 gemini-image-generation skill 生成图像
   *
   * @param {string} prompt - 图像生成提示词
   * @param {string} [referenceImage] - 参考图片路径（可选）
   * @param {string} [outputPath] - 输出图片路径
   * @param {string} [ratio] - 图片比例，默认 3:4
   * @param {string} [size] - 图片分辨率，默认 2K
   * @returns {Promise<string>} 生成的图片路径
   */
  async generateImage(
    prompt,
    referenceImage = null,
    outputPath = 'output.png',
    ratio = '3:4',
    size = '2K'
  ) {
    // 构建命令参数
    const args = [
      GEMINI_SKILL_PATH,
      '--prompt', prompt,
      '--output', outputPath,
      '--ratio', ratio,
      '--size', size
    ];

    // 如果有参考图片，记录（暂不支持直接传递）
    if (referenceImage) {
      console.log(`[节点 117995] 参考图片: ${referenceImage} (将在后续版本支持)`);
    }

    console.log('[节点 117995] 开始生成图像...');
    console.log(`  - 比例: ${ratio}`);
    console.log(`  - 分辨率: ${size}`);
    console.log(`  - 输出: ${outputPath}`);

    return new Promise((resolve, reject) => {
      const pythonProcess = spawn('python', args, {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        process.stdout.write(data);
      });

      pythonProcess.stderr.on('data', (data) => {
        stderr += data.toString();
        process.stderr.write(data);
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`[错误] 图像生成失败，退出码: ${code}`);
          reject(new Error(`图像生成失败: ${stderr}`));
        } else {
          console.log(`[节点 117995] 图像生成成功: ${outputPath}`);
          resolve(outputPath);
        }
      });

      pythonProcess.on('error', (error) => {
        console.error('[错误] 执行图像生成时出错:', error.message);
        reject(error);
      });

      // 超时处理 (5分钟)
      setTimeout(() => {
        pythonProcess.kill();
        reject(new Error('图像生成超时'));
      }, 300000);
    });
  }

  /**
   * 执行完整工作流
   *
   * 工作流执行顺序：
   * 1. 100001 (Start) - 接收输入
   * 2. 122936 (LLM) - 生成图片提示词
   * 3. 141932 (Text) - 组合最终提示词
   * 4. 117995 (Subflow/Nano_Banana_2) - 生成图像
   * 5. 900001 (End) - 返回结果
   *
   * @param {Object} params - 参数对象
   * @param {string} params.book - 书名
   * @param {string} params.origin - 原文语境
   * @param {string} params.prompt1 - 提示词参数1
   * @param {string} params.prompt2 - 提示词参数2
   * @param {string} params.prompt3 - 提示词参数3
   * @param {string} params.prompt4 - 提示词参数4
   * @param {string} [params.image] - 参考图片路径（可选）
   * @param {string} [params.outputPath] - 输出图片路径
   * @returns {Promise<Object>} 执行结果对象
   */
  async run({
    book,
    origin,
    prompt1,
    prompt2,
    prompt3,
    prompt4,
    image = null,
    outputPath = 'english_page1_1_output.png'
  }) {
    console.log('='.repeat(60));
    console.log('English Page 1-1 Workflow Agent (Node.js)');
    console.log('='.repeat(60));
    console.log('输入参数:');
    console.log(`  - 书名: ${book}`);
    console.log(`  - 原文: ${origin.substring(0, 50)}...`);
    console.log(`  - Prompt1: ${prompt1}`);
    console.log(`  - Prompt2: ${prompt2}`);
    console.log(`  - Prompt3: ${prompt3}`);
    console.log(`  - Prompt4: ${prompt4}`);
    if (image) {
      console.log(`  - 参考图片: ${image}`);
    }
    console.log('-'.repeat(60));

    // 步骤 1: 生成图片提示词 (节点 122936)
    console.log('\n[步骤 1/3] 正在生成图片提示词...');
    const picPrompt = await this.generatePicPrompt(book, origin);

    // 步骤 2: 组合最终提示词 (节点 141932)
    console.log('\n[步骤 2/3] 正在组合最终提示词...');
    const finalPrompt = this.buildFinalPrompt(prompt1, prompt2, prompt3, prompt4, picPrompt);

    // 步骤 3: 生成图像 (节点 117995)
    console.log('\n[步骤 3/3] 正在生成图像...');
    const generatedImage = await this.generateImage(
      finalPrompt,
      image,
      outputPath,
      '3:4',
      '2K'
    );

    console.log('\n' + '='.repeat(60));
    console.log('工作流执行完成!');
    console.log('='.repeat(60));

    return {
      output: generatedImage,
      picPrompt,
      finalPrompt,
      book,
      origin
    };
  }
}

/**
 * 命令行入口
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      options[key] = value;
      if (value !== true) i++;
    }
  }

  return options;

}

function printHelp() {
  console.log(`
用法: node english_page1_1_agent.js [选项]

选项:
  --book <书名>           书名 (必填)
  --origin <原文>         原文语境 (必填)
  --prompt1 <提示词1>     英文原句 1 (必填)
  --prompt2 <提示词2>     中文翻译 1 (必填)
  --prompt3 <提示词3>     英文原句 2 (必填)
  --prompt4 <提示词4>     中文翻译 2 (必填)
  --image <图片路径>      参考图片路径 (可选)
  --output <输出路径>     输出图片路径 (默认: english_page1_1_output.png)
  --help                  显示帮助信息

示例:
  node english_page1_1_agent.js \\
    --book "Harry Potter" \\
    --origin "The boy who lived." \\
    --prompt1 "The boy who lived." \\
    --prompt2 "那个活下来的男孩。" \\
    --prompt3 "Harry Potter." \\
    --prompt4 "哈利波特。" \\
    --output output.png
`);
}

// 主函数
async function main() {
  const args = parseArgs();

  if (args.help || Object.keys(args).length === 0) {
    printHelp();
    process.exit(0);
  }

  // 验证必填参数
  const required = ['book', 'origin', 'prompt1', 'prompt2', 'prompt3', 'prompt4'];
  const missing = required.filter(key => !args[key]);

  if (missing.length > 0) {
    console.error(`[错误] 缺少必填参数: ${missing.join(', ')}`);
    printHelp();
    process.exit(1);
  }

  try {
    const workflow = new EnglishPageWorkflow();
    const result = await workflow.run({
      book: args.book,
      origin: args.origin,
      prompt1: args.prompt1,
      prompt2: args.prompt2,
      prompt3: args.prompt3,
      prompt4: args.prompt4,
      image: args.image,
      outputPath: args.output || 'english_page1_1_output.png'
    });

    console.log('\n生成结果:');
    console.log(`  图片路径: ${result.output}`);
    console.log(`  图片提示词: ${result.picPrompt.substring(0, 100)}...`);

  } catch (error) {
    console.error('\n[错误] 工作流执行失败:', error.message);
    process.exit(1);
  }
}

// 导出模块
export { EnglishPageWorkflow };

// 如果是直接运行（不是被导入）
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
