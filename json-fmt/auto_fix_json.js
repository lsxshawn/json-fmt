import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, 'public', 'test_50mb_compact.json');
const outputPath = join(__dirname, 'public', 'test_50mb_fixed.json');

try {
  console.log('读取文件...');
  let content = readFileSync(inputPath, 'utf8');
  console.log(`原始文件大小: ${content.length} 字节`);
  
  // 步骤1: 移除所有空字符
  console.log('\n步骤1: 移除空字符...');
  const nullCharCount = (content.match(/\x00/g) || []).length;
  content = content.replace(/\x00/g, '');
  console.log(`移除了 ${nullCharCount} 个空字符`);
  console.log(`当前文件大小: ${content.length} 字节`);
  
  // 步骤2: 修复 memory_mb 字段的问题
  console.log('\n步骤2: 修复 memory_mb 字段...');
  // 找到 "memory_mb"后面直接跟非冒号字符的情况
  const pattern = /"memory_mb"([^:])/g;
  const matches = content.match(pattern);
  if (matches) {
    console.log(`找到 ${matches.length} 处需要修复的 memory_mb 字段`);
    content = content.replace(pattern, '"memory_mb":0,$1');
    console.log('修复完成');
  } else {
    console.log('未找到需要修复的 memory_mb 字段');
  }
  
  // 步骤3: 验证修复结果
  console.log('\n步骤3: 验证修复结果...');
  try {
    const parsed = JSON.parse(content);
    console.log('✓ JSON 解析成功！');
    
    // 检查结构
    if (parsed.logs && Array.isArray(parsed.logs)) {
      console.log(`日志条数: ${parsed.logs.length}`);
    }
    if (parsed.config) {
      console.log('配置信息: 存在');
    }
    
    // 保存修复后的文件
    writeFileSync(outputPath, content, 'utf8');
    console.log(`\n✓ 修复完成！文件已保存到: ${outputPath}`);
    console.log(`修复后文件大小: ${content.length} 字节`);
    
  } catch (e) {
    console.log('✗ 修复后仍然解析失败:', e.message);
    console.log('尝试定位剩余问题...');
    
    // 找到具体的错误位置
    let pos = 0;
    try {
      while (pos < content.length) {
        const chunk = content.substring(0, pos + 100000);
        JSON.parse(chunk);
        pos += 100000;
        console.log(`已验证: ${pos} 字节`);
      }
    } catch (chunkError) {
      console.log(`错误大致位置: ${pos} 字节附近`);
    }
  }
  
} catch (e) {
  console.error('处理失败:', e.message);
}
