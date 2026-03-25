#!/usr/bin/env node
/**
 * English Page 4-1 Workflow Agent (Node.js版本)
 * 基于 Coze 工作流 english_page4_1-draft.yaml 转换的 Agent 可执行代码
 *
 * 功能：句子解析第四页（雅思备考）图像生成
 * - 使用 Kimi API 生成图片提示词
 * - 使用 gemini-image-generation skill 生成图像
 * - 生成4宫格雅思备考信息图（听力、口语、阅读、写作）
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
config({ path: '.env.local' });

// 配置
const KIMI_API_KEY = process.env.Kimi_API_KEY;
const KIMI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.moonshot.cn/v1';
const GEMINI_SKILL_PATH = '.claude/skills/gemini-image-generation/scripts/generate_image.py';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * English Page 4-1 工作流实现类
 */
class EnglishPage4Workflow {
  /**
   * @param {string} [apiKey] - Kimi API Key，可选，默认从环境变量读取
   */
  constructor(apiKey) {
    this.apiKey = apiKey || KIMI_API_KEY;
    if (!this.apiKey) {
      throw new Error('Kimi_API_KEY 未设置，请在 .env.local 中配置');
    }
    console.log(`[调试] API Key 已读取: ${this.apiKey.substring(0, 20)}...`);
  }

  /**
   * 节点 122936: 使用大模型根据提示词模板生成图片提示词
   *
   * @param {string} IELTStip - 雅思备考建议的文字版解析
   * @returns {Promise<string>} 图片生成提示词
   */
  async generatePicPrompt(IELTStip) {
    const systemPrompt = `## 角色：
你是一名提示词工程师

## 目标：
把这些雅思备考建议的文字版解析，用以下Prompt模板表示出来，放到nanobanana里可以直接生成图片版的雅思备考建议图。雅思备考建议的文字解析：${IELTStip}

## Prompt模板：

**整体设计风格要求：**

- 雅思备考教学信息图（IELTS Infographic）
- 扁平化插画风格，清晰、专业、教育感强
- 明亮高对比配色，适合学习分享
- 外围使用 **亮黄色粗边框**
- 背景为 **浅米色 / 浅黄色纸张质感**
- 版式整洁、信息密集但易读，适合小红书条漫风格

------

**四宫格内容与结构要求如下：**

左上｜听力

- 顶部为 **黑色标题栏**，白色大字「听力」，配 **耳朵图标**
- 内容使用 ✔️ 勾选符号，分析以下句子结构在雅思听力中的难点与应对策略
- 强调：
  - 长句、并列结构、插入成分带来的信息密集问题
  - 如何先抓 **主句主谓结构（Main Clause）**
  - 如何通过连接词（and / when / given / with）跟踪信息
  - 如何在 Section 3 / 4 中避免遗漏细节
- 可加入简洁箭头示意：MAIN CLAUSE → MODIFIERS → DETAILS

------

右上｜口语

- 顶部为 **黑色标题栏**，白色大字「口语」，配 **对话图标**
- 使用 ✔️ 勾选符号说明该句式在 IELTS Speaking 中的运用
- 强调：
  - 如何用句子开头进行模仿（如 I suppose that…, I can remember that…）
  - 如何使用并列结构和时间/目的状语丰富表达
  - 适合 Part 2 描述经历、场景、人物
  - 提升画面感，避免简单句堆砌
- 配合人物讲述、时间线或场景类插画

------

左下｜阅读

- 顶部为 **黑色标题栏**，白色大字「阅读」，配 **书本图标**
- 使用 ✔️ 勾选符号讲解长难句的阅读拆解方法
- 强调：
  - 快速定位 **主干（S + V）**
  - 拆分并列结构与从句
  - 用"括号化"方式暂时忽略插入语
  - 明确修饰对象，避免理解偏差
- 可视化展示：主干高亮，修饰成分虚线框标出

------

右下｜写作

- 顶部为 **黑色标题栏**，白色大字「写作」，配 **笔图标**
- 使用 ✔️ 勾选符号说明该句式在 IELTS Writing Task 2 中的价值
- 强调：
  - 用于举例、论证、描述现象
  - 通过并列 + 插入语提升句式复杂度
  - 有助于 Band 7+ 的句型多样性
  - 提醒控制长度，避免语法失误
- 可配层次分析结构图：观点 → 细节 → 结构`;

    const userPrompt = `雅思备考建议的文字版解析${IELTStip}，用Prompt模板表示出来，生成可以放到nanobanana里可以直接生成图片版的雅思备考建议图的prompt。`;

    const headers = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'claude-code/1.0.0',
      'X-API-Source': 'claude-code'
    };

    const modelName = process.env.OPENAI_MODEL || 'kimi-latest';

    const payload = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 4096
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
   * 节点 118187: 组合完整图片提示词
   *
   * @param {string} picPrompt1 - LLM生成的图片提示词
   * @returns {string} 最终完整的图像生成提示词
   */
  buildFinalPrompt(picPrompt1) {
    const finalPrompt = `仿照图片的设计、排版、布局，垂直布局3:4画板，设计1张【4宫格竖版英语教学条漫】，整体风格严格参考高质量英语学习条漫，用于系统讲解**同一句英语长难句在雅思听力、口语、阅读、写作中的应对策略**。

------

【整体风格】

- 教育类信息图（IELTS Educational Infographic）
- 扁平化插画风格（flat illustration）
- 明亮但不刺眼的高对比配色
- 浅米色 / 浅黄色纸张质感背景
- 整体外框为**亮黄色粗边框**
- 黑色标题栏 + 白色大字，强对比
- 干净、专业、条理清晰，适合长期连载的雅思学习内容
- 无真实人物照片，仅使用卡通人物与功能性图标

------

【画面结构】

- **2×2 四宫格布局（竖版 3:4）**
- 每一个宫格对应一个雅思能力维度：
  - 左上：听力
  - 右上：口语
  - 左下：阅读
  - 右下：写作
- 四个宫格大小一致，间距均匀
- 每个宫格内部使用 ✔️ 勾选列表呈现要点

------

【单个宫格统一结构（必须遵循）】

1️⃣ 顶部标题栏

- 黑色背景
- 白色大字标题（听力 / 口语 / 阅读 / 写作）
- 每个标题搭配对应功能图标
  - 听力：耳朵
  - 口语：对话
  - 阅读：书本
  - 写作： 笔

2️⃣ 内容呈现方式

- 使用 ✔️ 勾选符号分点说明
- 语言为**中文为主，关键语法术语保留英文**
- 表达清晰、教学导向强、适合"扫一眼就懂"

3️⃣ 辅助视觉元素

- 使用箭头、结构框、简单示意图强化理解
- 不添加多余装饰，避免干扰阅读
【内容变量区｜请将以下文字转化为四宫格展示】
${picPrompt1}
【整体效果目标】
- 页面最上方不要有大标题
- 一张**结构清晰、信息密集但易读**的雅思备考四宫格信息图
- 适合用于英语教学、小红书条漫、课程配图或系列化内容输出
- 让学习者一眼理解：**"同一句话，听说读写该怎么用"**

> **注意**：**除了这4个宫格，不要展示其他宫格、标题以及其他内容。**
> **（视觉元素与图表）：**内容要求初中生能够看懂，除了单词和例句，其他都用中文
> **画面充满了信息图表元素：包含[替换：具体元素，例如：箭头流程图]。视觉符号简洁，类似UI图标设计。例句要用每个单词下方的例句，还要把例句的翻译也写上。

> **（艺术风格）：**扁平化矢量插画风格，粗黑色的轮廓线，极简主义，波普艺术感。色彩鲜艳且平整，高饱和度（主要是[替换：具体元素，例如：放大镜箭头流程图]），米黄色纸张背景。无噪点，清晰锐利。

> **（构图）**：
> 分格漫画布局，每张图都用4宫格展示，3:4画板展示，用1张图来展示内容，图片内容为"雅思备考策略"，要求详细阐释。除了这4个宫格，不要展示其他宫格、标题以及其他内容。

> **排除项（非常关键）**
> 页面最上方有大标题，与雅思备考无关的内容，图片模糊，图片的每个宫格互相没有逻辑，字体太小，不按照图片一的排版和布局，非写实、非日漫、非水彩、非油画、非手绘涂鸦、非低幼儿童绘本风。`;

    console.log(`[节点 118187] 已组合最终提示词 (长度: ${finalPrompt.length} 字符)`);
    return finalPrompt;
  }

  /**
   * 节点 177023: 使用 gemini-image-generation skill 生成图像
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
      console.log(`[节点 177023] 参考图片: ${referenceImage} (将在后续版本支持)`);
    }

    console.log('[节点 177023] 开始生成图像...');
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
          console.log(`[节点 177023] 图像生成成功: ${outputPath}`);
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
   * 3. 118187 (Text) - 组合完整提示词
   * 4. 177023 (Subflow/Nano_Banana_2) - 生成图像
   * 5. 900001 (End) - 返回结果
   *
   * @param {Object} params - 参数对象
   * @param {string} params.IELTStip - 雅思备考建议的文字版解析
   * @param {string} [params.image] - 参考图片路径（可选）
   * @param {string} [params.outputPath] - 输出图片路径
   * @param {string} [params.ratio] - 图片比例，默认 3:4
   * @param {string} [params.size] - 图片分辨率，默认 2K
   * @returns {Promise<Object>} 执行结果对象
   */
  async run({
    IELTStip,
    image = null,
    outputPath = 'english_page4_1_output.png',
    ratio = '3:4',
    size = '2K'
  }) {
    console.log('='.repeat(60));
    console.log('English Page 4-1 Workflow Agent (Node.js)');
    console.log('句子解析第四页 - 雅思备考图像生成');
    console.log('='.repeat(60));
    console.log('输入参数:');
    console.log(`  - 雅思备考提示: ${IELTStip.substring(0, 50)}...`);
    if (image) {
      console.log(`  - 参考图片: ${image}`);
    }
    console.log(`  - 宽高比: ${ratio}`);
    console.log(`  - 分辨率: ${size}`);
    console.log('-'.repeat(60));

    // 步骤 1: 生成图片提示词 (节点 122936)
    console.log('\n[步骤 1/3] 正在生成雅思备考图片提示词...');
    const generatedPrompt = await this.generatePicPrompt(IELTStip);

    // 步骤 2: 组合最终提示词 (节点 118187)
    console.log('\n[步骤 2/3] 正在组合最终提示词...');
    const finalPrompt = this.buildFinalPrompt(generatedPrompt);

    // 步骤 3: 生成图像 (节点 177023)
    console.log('\n[步骤 3/3] 正在生成图像...');
    const generatedImage = await this.generateImage(
      finalPrompt,
      image,
      outputPath,
      ratio,
      size
    );

    console.log('\n' + '='.repeat(60));
    console.log('工作流执行完成!');
    console.log('='.repeat(60));

    return {
      output: generatedImage,
      generatedPrompt,
      finalPrompt,
      IELTStip
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
用法: node english_page4_1_agent.js [选项]

选项:
  --ieltstip <雅思备考提示>  雅思备考建议的文字版解析 (必填)
  --image <图片路径>          参考图片路径 (可选)
  --output <输出路径>         输出图片路径 (默认: english_page4_1_output.png)
  --ratio <宽高比>            图片比例 (默认: 3:4)
  --size <分辨率>             图片分辨率 (默认: 2K)
  --help                      显示帮助信息

示例:
  node english_page4_1_agent.js \\
    --ieltstip "长难句解析：在雅思听力中，复杂句式常常包含多个信息点..." \\
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
  const required = ['ieltstip'];
  const missing = required.filter(key => !args[key]);

  if (missing.length > 0) {
    console.error(`[错误] 缺少必填参数: ${missing.join(', ')}`);
    printHelp();
    process.exit(1);
  }

  try {
    const workflow = new EnglishPage4Workflow();
    const result = await workflow.run({
      IELTStip: args.ieltstip,
      image: args.image,
      outputPath: args.output || 'english_page4_1_output.png',
      ratio: args.ratio || '3:4',
      size: args.size || '2K'
    });

    console.log('\n生成结果:');
    console.log(`  图片路径: ${result.output}`);
    console.log(`  提示词: ${result.generatedPrompt.substring(0, 100)}...`);

  } catch (error) {
    console.error('\n[错误] 工作流执行失败:', error.message);
    process.exit(1);
  }
}

// 导出模块
export { EnglishPage4Workflow };

// 如果是直接运行（不是被导入）
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
