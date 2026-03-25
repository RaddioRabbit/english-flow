#!/usr/bin/env node
/**
 * English Page 3-1 Workflow Agent (Node.js版本)
 * 基于 Coze 工作流 english_page3_1-draft.yaml 转换的 Agent 可执行代码
 *
 * 功能：句子解析第三页（单词解析）图像生成
 * - 6宫格单词解析教学条漫
 * - 使用 gemini-image-generation skill 生成图像
 */

import { spawn } from 'child_process';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
config({ path: '.env.local' });

// 配置
const GEMINI_SKILL_PATH = '.claude/skills/gemini-image-generation/scripts/generate_image.py';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * English Page 3-1 工作流实现类
 */
class EnglishPage3Workflow {
  constructor() {
    // 此工作流不需要 LLM API Key
    console.log('[EnglishPage3Workflow] 初始化完成');
  }

  /**
   * 节点 118187: 组合完整图片提示词
   *
   * @param {string} word1 - 单词1解析
   * @param {string} word2 - 单词2解析
   * @param {string} word3 - 单词3解析
   * @param {string} word4 - 单词4解析
   * @param {string} word5 - 单词5解析
   * @param {string} word6 - 单词6解析
   * @returns {string} 完整的图像生成提示词
   */
  buildFinalPrompt(word1, word2, word3, word4, word5, word6) {
    const finalPrompt = `仿照图片的设计、排版、布局，垂直布局3:4画板，设计1张【6宫格竖版英语教学条漫】，整体风格严格参考高质量英语学习条漫，用于系统、清晰地讲解英语单词。

请生成一张【英语词汇解析教学信息图】，整体风格严格参考高质量英语学习条漫，用于系统、清晰地讲解英语单词。

【整体风格】

- 教育类信息图（Educational Infographic）
- 扁平化插画风格（flat illustration）
- 明亮柔和配色，高对比但不刺眼
- 浅黄色 / 米白色背景
- 圆角卡片设计，粗描边
- 干净、可爱、专业，适合长期连载
- 无真实人物照片，全部为卡通图标

【画面结构】

- 多宫格布局（根据单词数量自动排布）
- 每一个宫格 = 一个英语单词
- 宫格大小一致，间距均匀
- 建议 2×2 四宫格布局

【单个宫格固定结构（必须全部包含）】

1️⃣ 顶部模块标题
格式：
词汇解析 X + 对应语义 emoji

2️⃣ 单词本体（最大字号，加粗）

- 英文单词突出显示

3️⃣ 音标

- 使用国际音标

4️⃣ 词性标签

- 使用彩色圆角标签
- 标注词性：名词 / 动词 / 形容词

5️⃣ 中文释义

- 1–3 个核心义项
- 中文简洁、教学友好

6️⃣ 英文例句

- 自然、易理解
- 与释义高度匹配

7️⃣ 中文译文

- 与例句一一对应
- 表达自然

8️⃣ 语义插画图标

- 与单词意义强相关
- 用于辅助记忆

【内容变量区：请将以下文字版单词解析转化为宫格展示】

【单词解析内容开始】

词汇解析 1

${word1}

词汇解析 2

${word2}

词汇解析 3

${word3}

词汇解析 4

${word4}

词汇解析 5

${word5}

词汇解析 6

${word6}

【单词解析内容结束】

【排版要求】
- 页面上不要有大标题
- 信息层级清晰
- 单词字号最大，其余依次递减
- 所有文字清晰可读，适合手机端学习
- 整体风格统一，适合系列化发布

> **（视觉元素与图表）：**内容要求初中生能够看懂，除了单词和例句，其他都用中文
> **画面充满了信息图表元素：包含[替换：具体元素，例如：箭头流程图]。视觉符号简洁，类似UI图标设计。例句要用每个单词下方的例句，还要把例句的翻译也写上。

> **（艺术风格）：**扁平化矢量插画风格，粗黑色的轮廓线，极简主义，波普艺术感。色彩鲜艳且平整，高饱和度（主要是[替换：具体元素，例如：放大镜箭头流程图]），米黄色纸张背景。无噪点，清晰锐利。

> **（构图）**：
> 分格漫画布局，每张图都用6宫格展示，3:4画板展示，用1张图来展示内容，图片内容为"词汇解析"，要求详细阐释。

> **排除项（非常关键）**
> 页面最上方有大标题，与词汇解析无关的内容，图片模糊，除了词汇解析的其他内容，图片的每个宫格互相没有逻辑，字体太小，不按照图片一的排版和布局，非写实、非日漫、非水彩、非油画、非手绘涂鸦、非低幼儿童绘本风`;

    console.log(`[节点 118187] 已组合最终提示词 (长度: ${finalPrompt.length} 字符)`);
    return finalPrompt;
  }

  /**
   * 节点 158348: 使用 gemini-image-generation skill 生成图像
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
      console.log(`[节点 158348] 参考图片: ${referenceImage} (将在后续版本支持)`);
    }

    console.log('[节点 158348] 开始生成图像...');
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
          console.log(`[节点 158348] 图像生成成功: ${outputPath}`);
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
   * 2. 118187 (Text) - 组合完整提示词
   * 3. 158348 (Subflow/Nano_Banana_2) - 生成图像
   * 4. 900001 (End) - 返回结果
   *
   * @param {Object} params - 参数对象
   * @param {string} params.word1 - 单词1解析
   * @param {string} params.word2 - 单词2解析
   * @param {string} params.word3 - 单词3解析
   * @param {string} params.word4 - 单词4解析
   * @param {string} params.word5 - 单词5解析
   * @param {string} params.word6 - 单词6解析
   * @param {string} [params.image] - 参考图片路径（可选）
   * @param {string} [params.outputPath] - 输出图片路径
   * @param {string} [params.ratio] - 图片比例，默认 3:4
   * @param {string} [params.size] - 图片分辨率，默认 2K
   * @returns {Promise<Object>} 执行结果对象
   */
  async run({
    word1,
    word2,
    word3,
    word4,
    word5,
    word6,
    image = null,
    outputPath = 'english_page3_1_output.png',
    ratio = '3:4',
    size = '2K'
  }) {
    console.log('='.repeat(60));
    console.log('English Page 3-1 Workflow Agent (Node.js)');
    console.log('句子解析第三页 - 6宫格单词解析图像生成');
    console.log('='.repeat(60));
    console.log('输入参数:');
    console.log(`  - 单词1: ${word1.substring(0, 30)}...`);
    console.log(`  - 单词2: ${word2.substring(0, 30)}...`);
    console.log(`  - 单词3: ${word3.substring(0, 30)}...`);
    console.log(`  - 单词4: ${word4.substring(0, 30)}...`);
    console.log(`  - 单词5: ${word5.substring(0, 30)}...`);
    console.log(`  - 单词6: ${word6.substring(0, 30)}...`);
    if (image) {
      console.log(`  - 参考图片: ${image}`);
    }
    console.log(`  - 宽高比: ${ratio}`);
    console.log(`  - 分辨率: ${size}`);
    console.log('-'.repeat(60));

    // 步骤 1: 组合最终提示词 (节点 118187)
    console.log('\n[步骤 1/2] 正在组合最终提示词...');
    const finalPrompt = this.buildFinalPrompt(word1, word2, word3, word4, word5, word6);

    // 步骤 2: 生成图像 (节点 158348)
    console.log('\n[步骤 2/2] 正在生成图像...');
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
      finalPrompt,
      word1, word2, word3, word4, word5, word6
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
用法: node english_page3_1_agent.js [选项]

选项:
  --word1 <单词1解析>      单词1解析 (必填)
  --word2 <单词2解析>      单词2解析 (必填)
  --word3 <单词3解析>      单词3解析 (必填)
  --word4 <单词4解析>      单词4解析 (必填)
  --word5 <单词5解析>      单词5解析 (必填)
  --word6 <单词6解析>      单词6解析 (必填)
  --image <图片路径>        参考图片路径 (可选)
  --output <输出路径>       输出图片路径 (默认: english_page3_1_output.png)
  --ratio <宽高比>          图片比例 (默认: 3:4)
  --size <分辨率>           图片分辨率 (默认: 2K)
  --help                    显示帮助信息

示例:
  node english_page3_1_agent.js \\
    --word1 "appalled /əˈpɔːld/ adj. 震惊的..." \\
    --word2 "unprecedented /ʌnˈpresɪdentɪd/ adj. 前所未有的..." \\
    --word3 "begotten /bɪˈɡɒtn/ v. 产生..." \\
    --word4 "vigour /ˈvɪɡə(r)/ n. 活力..." \\
    --word5 "obtrusive /əbˈtruːsɪv/ adj. 突兀的..." \\
    --word6 "herded /ˈhɜːdɪd/ v. 驱赶..." \\
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
  const required = ['word1', 'word2', 'word3', 'word4', 'word5', 'word6'];
  const missing = required.filter(key => !args[key]);

  if (missing.length > 0) {
    console.error(`[错误] 缺少必填参数: ${missing.join(', ')}`);
    printHelp();
    process.exit(1);
  }

  try {
    const workflow = new EnglishPage3Workflow();
    const result = await workflow.run({
      word1: args.word1,
      word2: args.word2,
      word3: args.word3,
      word4: args.word4,
      word5: args.word5,
      word6: args.word6,
      image: args.image,
      outputPath: args.output || 'english_page3_1_output.png',
      ratio: args.ratio || '3:4',
      size: args.size || '2K'
    });

    console.log('\n生成结果:');
    console.log(`  图片路径: ${result.output}`);

  } catch (error) {
    console.error('\n[错误] 工作流执行失败:', error.message);
    process.exit(1);
  }
}

// 导出模块
export { EnglishPage3Workflow };

// 如果是直接运行（不是被导入）
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
