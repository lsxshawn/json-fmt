import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, 'public', 'test_50mb (1).json');

try {
  const content = readFileSync(filePath, 'utf8');
  console.log(`文件大小: ${content.length} 字节`);
  
  const errorPosition = 56623056;
  
  console.log(`\n=== 分析错误位置 ${errorPosition} 附近的内容 ===`);
  
  // 显示更大范围的上下文（前后各100字节）
  const contextSize = 100;
  const start = Math.max(0, errorPosition - contextSize);
  const end = Math.min(content.length, errorPosition + contextSize);
  const context = content.substring(start, end);
  
  console.log('\n1. 原始内容:');
  console.log('='.repeat(80));
  console.log(context);
  console.log('='.repeat(80));
  
  // 显示字符的ASCII码，查找隐藏字符
  console.log('\n2. 字符ASCII码分析（显示异常字符）:');
  console.log('位置偏移 | 字符 | ASCII码 | 说明');
  console.log('---------|------|---------|------');
  for (let i = 0; i < context.length; i++) {
    const char = context[i];
    const code = char.charCodeAt(0);
    let desc = '正常';
    if (code < 32 || code > 126) {
      desc = `控制字符 (${code})`;
    } else if (char === '"') {
      desc = '双引号';
    } else if (char === ':') {
      desc = '冒号';
    } else if (char === '\\') {
      desc = '反斜杠(转义)';
    }
    console.log(`${(i - contextSize).toString().padStart(9)} | '${char}' | ${code.toString().padStart(7)} | ${desc}`);
  }
  
  // 检查是否有未闭合的引号
  console.log('\n3. 引号匹配检查:');
  let quoteCount = 0;
  let inString = false;
  for (let i = 0; i < context.length; i++) {
    const char = context[i];
    if (char === '\\' && inString) {
      i++; // 跳过转义字符
      continue;
    }
    if (char === '"') {
      inString = !inString;
      quoteCount++;
    }
  }
  console.log(`上下文引号数量: ${quoteCount}`);
  console.log(`是否在字符串中: ${inString ? '是（可能有未闭合的引号）' : '否'}`);
  
  // 尝试解析这段上下文
  console.log('\n4. 尝试解析上下文片段:');
  try {
    // 找到完整的JSON结构进行测试
    const testStart = context.lastIndexOf('{');
    if (testStart !== -1) {
      const testEnd = context.indexOf('}', testStart);
      if (testEnd !== -1) {
        const testJson = context.substring(testStart, testEnd + 1);
        console.log(`测试片段: ${testJson.slice(0, 100)}...`);
        JSON.parse(testJson);
        console.log('✓ 片段解析成功');
      }
    }
  } catch (e) {
    console.log('✗ 片段解析失败:', e.message);
  }
  
} catch (e) {
  console.error('读取文件失败:', e.message);
}
