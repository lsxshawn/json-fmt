import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, 'public', 'test_50mb (1).json');
const outputPath = join(__dirname, 'public', 'test_50mb_fixed.json');

try {
  console.log('读取文件...');
  const content = readFileSync(inputPath, 'utf8');
  console.log(`原始文件大小: ${content.length} 字节`);
  
  // 统计空字符数量
  const nullCharCount = (content.match(/\x00/g) || []).length;
  console.log(`空字符数量: ${nullCharCount}`);
  
  if (nullCharCount > 0) {
    console.log('清理空字符...');
    const cleanedContent = content.replace(/\x00/g, '');
    console.log(`清理后文件大小: ${cleanedContent.length} 字节`);
    console.log(`移除了 ${nullCharCount} 个空字符`);
    
    // 尝试解析验证
    try {
      JSON.parse(cleanedContent);
      console.log('✓ 清理后的文件解析成功！');
      
      // 写入修复后的文件
      writeFileSync(outputPath, cleanedContent, 'utf8');
      console.log(`✓ 修复后的文件已保存到: ${outputPath}`);
    } catch (e) {
      console.log('✗ 清理后仍然解析失败:', e.message);
    }
  } else {
    console.log('文件中没有空字符');
  }
} catch (e) {
  console.error('处理失败:', e.message);
}
