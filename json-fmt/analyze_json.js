import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, 'public', 'test_50mb (1).json');

try {
  console.log('读取文件...');
  let content = readFileSync(filePath, 'utf8');
  
  // 先移除空字符，查看原始内容
  content = content.replace(/\x00/g, '');
  console.log(`清理后文件大小: ${content.length} 字节`);
  
  // 错误位置（清理后位置会变化，需要重新定位）
  const errorPosition = 56623056;
  
  // 由于移除了空字符，实际位置可能需要调整
  // 让我们检查清理后的错误位置附近
  const adjustedPosition = Math.min(errorPosition, content.length - 1);
  const contextSize = 150;
  const start = Math.max(0, adjustedPosition - contextSize);
  const end = Math.min(content.length, adjustedPosition + contextSize);
  
  console.log(`\n=== 分析错误位置 ${adjustedPosition} 附近的内容 ===`);
  console.log('\n1. 原始内容:');
  console.log('='.repeat(100));
  console.log(content.substring(start, end));
  console.log('='.repeat(100));
  
  // 分析引号匹配
  console.log('\n2. 引号匹配分析:');
  let quoteCount = 0;
  let inString = false;
  let lastColonIndex = -1;
  let lastCommaIndex = -1;
  
  for (let i = start; i < end; i++) {
    const char = content[i];
    if (char === '\\' && inString) {
      i++; // 跳过转义字符
      continue;
    }
    if (char === '"') {
      inString = !inString;
      quoteCount++;
    } else if (char === ':' && !inString) {
      lastColonIndex = i - start;
    } else if (char === ',' && !inString) {
      lastCommaIndex = i - start;
    }
  }
  
  console.log(`引号数量: ${quoteCount}`);
  console.log(`是否在字符串中: ${inString ? '是（可能有未闭合的引号）' : '否'}`);
  console.log(`最后一个冒号位置（相对于上下文）: ${lastColonIndex}`);
  console.log(`最后一个逗号位置（相对于上下文）: ${lastCommaIndex}`);
  
  // 检查上下文之前是否有未闭合的结构
  console.log('\n3. 结构分析:');
  let braceCount = 0;
  let bracketCount = 0;
  
  for (let i = start; i < end; i++) {
    const char = content[i];
    if (char === '\\' && inString) {
      i++;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
  }
  
  console.log(`花括号平衡: ${braceCount}`);
  console.log(`方括号平衡: ${bracketCount}`);
  
  // 尝试找到问题字段
  console.log('\n4. 尝试定位问题字段:');
  const beforeError = content.substring(0, adjustedPosition);
  const lastQuoteBefore = beforeError.lastIndexOf('"');
  const secondLastQuoteBefore = beforeError.lastIndexOf('"', lastQuoteBefore - 1);
  
  if (lastQuoteBefore !== -1 && secondLastQuoteBefore !== -1) {
    const potentialKey = beforeError.substring(secondLastQuoteBefore + 1, lastQuoteBefore);
    console.log(`错误位置前的最后一个引号对内容: "${potentialKey}"`);
  }
  
} catch (e) {
  console.error('分析失败:', e.message);
}
