#!/usr/bin/env node
/**
 * English Page 2-2-2 Workflow Agent (Node.js版本)
 * 基于 Coze 工作流 english_page2_2_2-draft.yaml 转换的 Agent 可执行代码
 *
 * 功能：句子解析第二页的第二页（2宫格句式总结）图像生成
 * - 使用 Kimi API 生成图片提示词
 * - 使用 gemini-image-generation skill 生成图像
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
// 支持 OpenAI 兼容的 API，可以通过环境变量配置 base URL
const KIMI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.moonshot.cn/v1';
const GEMINI_SKILL_PATH = '.claude/skills/gemini-image-generation/scripts/generate_image.py';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * English Page 2-2-2 工作流实现类
 */
class EnglishPage2_2_2Workflow {
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
   * 节点 1584154: 使用大模型生成2宫格总结图片提示词
   *
   * @param {string} originPart - 原句
   * @param {string} analysis - 句式分析
   * @returns {Promise<string>} 图片生成提示词
   */
  async generatePicPrompt(originPart, analysis) {
    const systemPrompt = `## 角色
提示词工程师
## 目标
把这个句子结构的文字版分析，仿照**提示词示例**，写出这个句子完整的Prompt放到nanobanana里可以直接生成图片版的句子结构分析图。原句子：${originPart}
句子结构的文字版分析：
${analysis}

## 提示词示例：

**核心要求**：匹配示例的排版/布局/风格，初中生易懂，全中文解释（除原句及单词翻译），扁平化矢量风，米黄色背景，高饱和度色块+简洁图标 --- 【整体风格】 - 类型：英语语法教学条漫 - 设计：扁平化矢量风，粗黑轮廓线，高饱和度色块，极简UI图标 - 背景：浅米黄色纸张质感 - 布局：1列×2行2宫格，每宫格独立带浅灰边框，标题栏+成分拆分区+解释区 【颜色规则（必须严格遵守）】 - 红色：主句/主干结构（高亮文字+红色标题栏） - 绿色：定语从句/同位语从句（高亮文字） - 黄色：修饰成分（定语、状语、同位语等，高亮文字） - 黑色箭头：标注修饰/逻辑关系 --- 【第1格（第3行第1列）】 - 标题栏：红色块+白色大字「整体句子逻辑图」，右侧加**流程图图标** - 成分拆分区（框图+箭头展示，附翻译）：

[主句：She was appalled by West Egg（她被西卵震撼）]

↓（同位语补充）

→ this unprecedented "place"（前所未有的 "地方"）

↓（定语从句解释）

→ that Broadway had begotten...（百老汇催生的）

↓（破折号引出并列状语）

→ appalled by its raw vigour（被原始活力震撼）

↓（定语从句细化）

→ that chafed...（与旧观念冲突）

→ and by the too obtrusive fate（并被突兀命运震撼）

↓（定语从句细化）

→ that herded...（驱赶居民从无到无）

\- 解释区：浅黄底色框+**齿轮图标**，文字： "句子逻辑：先点明核心感受→定义对象→解释对象起源→展开具体震撼原因→细化原因细节，层层递进讲清批判态度。" --- 【第2格（第3行第2列）】 - 标题栏：红色块+白色大字「关键语法特征」，右侧加**灯泡图标** - 成分拆分区（列表展示）： 1. **系表结构**（was appalled）：直接表情感 2. **同位语+定语从句**：定义对象+补充背景 3. **并列方式状语**：细化动作原因 4. **嵌套定语从句**：深化修饰内容 5. **省略谓语**：简化句子（and后省略was appalled） - 解释区：浅黄底色框+**灯泡图标**，文字： "这些语法点让句子既简洁又有层次，既说清'感受'，又讲透'为什么有这感受'，适合学习长难句的逻辑展开。"`;

    const userPrompt = `按照提示词示例，写出能将句子${originPart}的文字版句式分析${analysis}转化为能在nano banana生成图片版句子分析的prompt。`;

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
      console.log(`[节点 1584154] 已生成图片提示词: ${picPrompt.substring(0, 100)}...`);
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
   * 节点 1108492: 组合最终的2宫格图像生成提示词
   *
   * @param {string} generatedPrompt - LLM生成的提示词
   * @returns {string} 最终的图像生成提示词
   */
  buildFinalPrompt(generatedPrompt) {
    const finalPrompt = `${generatedPrompt}

> **（注意）：**把图片中的大标题"英语句子结构分析"这几个字去掉

>**要求：**
>用中文解释英语句子结构，仿照图片的句子的解析设计的布局、方式，对句子进行解析。

> **（视觉元素与图表）：**内容要求初中生能够看懂，除了单词和例句，其他都用中文**画面充满了信息图表元素：包含[替换：具体元素，例如：箭头流程图]。视觉符号简洁，类似UI图标设计。例句要用每个单词下方的例句，还要把例句的翻译也写上。**
>
> **（艺术风格）：**扁平化矢量插画风格，粗黑色的轮廓线，极简主义，波普艺术感。色彩鲜艳且平整，高饱和度（主要是[替换：具体元素，例如：放大镜箭头流程图]），米黄色纸张背景。无噪点，清晰锐利。

> **（构图）**：
> 分格漫画布局，每张图都用2宫格展示，3:4画板展示，用1张图来展示内容，图片内容为句子的"句式分析"，要求详细阐释。除了那两个对英语句子进行解析的宫格外，其他的比如文字标题、宫格等内容不要出现。

>**排除项（非常关键）**
>文字遮挡人物，同一个人物的服装不一致，图片模糊，文字遮挡人物，对句子的语法、单词讲解等除了原句和原句翻译的其他内容，图片的每个宫格互相没有逻辑，人物的对话和句子讲解没关系，要讲解的句子字体太小，不按照图片一的排版和布局，人物没有讲解，非写实、非日漫、非水彩、非油画、非手绘涂鸦、非低幼儿童绘本风。`;

    console.log(`[节点 1108492] 已组合最终提示词 (长度: ${finalPrompt.length} 字符)`);
    return finalPrompt;
  }

  /**
   * 节点 110587: 使用 gemini-image-generation skill 生成图像
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
      console.log(`[节点 110587] 参考图片: ${referenceImage} (将在后续版本支持)`);
    }

    console.log('[节点 110587] 开始生成图像...');
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
          console.log(`[节点 110587] 图像生成成功: ${outputPath}`);
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
   * 2. 1584154 (LLM) - 生成2宫格总结图片提示词
   * 3. 1108492 (Text) - 组合最终提示词
   * 4. 110587 (Subflow/Nano_Banana_2) - 生成图像
   * 5. 900001 (End) - 返回结果
   *
   * @param {Object} params - 参数对象
   * @param {string} params.originPart - 原句
   * @param {string} params.analysis - 句式分析
   * @param {string} [params.image] - 参考图片路径（可选）
   * @param {string} [params.outputPath] - 输出图片路径
   * @param {string} [params.ratio] - 图片比例，默认 3:4
   * @param {string} [params.size] - 图片分辨率，默认 2K
   * @returns {Promise<Object>} 执行结果对象
   */
  async run({
    originPart,
    analysis,
    image = null,
    outputPath = 'english_page2_2_2_output.png',
    ratio = '3:4',
    size = '2K'
  }) {
    console.log('='.repeat(60));
    console.log('English Page 2-2-2 Workflow Agent (Node.js)');
    console.log('句子解析第二页第二页 - 2宫格句式总结图像生成');
    console.log('='.repeat(60));
    console.log('输入参数:');
    console.log(`  - 原句: ${originPart.substring(0, 50)}...`);
    console.log(`  - 句式分析: ${analysis.substring(0, 50)}...`);
    if (image) {
      console.log(`  - 参考图片: ${image}`);
    }
    console.log(`  - 宽高比: ${ratio}`);
    console.log(`  - 分辨率: ${size}`);
    console.log('-'.repeat(60));

    // 步骤 1: 生成图片提示词 (节点 1584154)
    console.log('\n[步骤 1/3] 正在生成2宫格总结图片提示词...');
    const generatedPrompt = await this.generatePicPrompt(originPart, analysis);

    // 步骤 2: 组合最终提示词 (节点 1108492)
    console.log('\n[步骤 2/3] 正在组合最终提示词...');
    const finalPrompt = this.buildFinalPrompt(generatedPrompt);

    // 步骤 3: 生成图像 (节点 110587)
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
      originPart,
      analysis
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
用法: node english_page2_2_2_agent.js [选项]

选项:
  --origin-part <原句>      英语原句 (必填)
  --analysis <句式分析>     句式分析文本 (必填)
  --image <图片路径>        参考图片路径 (可选)
  --output <输出路径>       输出图片路径 (默认: english_page2_2_2_output.png)
  --ratio <宽高比>          图片比例 (默认: 3:4)
  --size <分辨率>           图片分辨率 (默认: 2K)
  --help                    显示帮助信息

示例:
  node english_page2_2_2_agent.js \
    --origin-part "She was appalled by West Egg..." \
    --analysis "主句: She was appalled..." \
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
  const required = ['origin-part', 'analysis'];
  const missing = required.filter(key => !args[key]);

  if (missing.length > 0) {
    console.error(`[错误] 缺少必填参数: ${missing.join(', ')}`);
    printHelp();
    process.exit(1);
  }

  try {
    const workflow = new EnglishPage2_2_2Workflow();
    const result = await workflow.run({
      originPart: args['origin-part'],
      analysis: args.analysis,
      image: args.image,
      outputPath: args.output || 'english_page2_2_2_output.png',
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
export { EnglishPage2_2_2Workflow };

// 如果是直接运行（不是被导入）
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
