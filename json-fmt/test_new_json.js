import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, 'public', 'test_50mb_compact.json');

try {
  console.log('读取文件...');
  const content = readFileSync(filePath, 'utf8');
  console.log(`文件大小: ${content.length} 字节`);
  
  // 检查是否为空
  if (!content || content.trim() === '') {
    console.log('错误: 文件为空');
    process.exit(1);
  }
  
  // 检查 BOM
  if (content.charCodeAt(0) === 0xFEFF) {
    console.log('警告: 文件包含 BOM 字符');
  }
  
  console.log('\n尝试解析 JSON...');
  const start = Date.now();
  
  try {
    const parsed = JSON.parse(content);
    const parseTime = Date.now() - start;
    
    console.log(`✓ 解析成功！耗时: ${parseTime}ms`);
    console.log(`数据类型: ${typeof parsed}`);
    
    if (parsed && typeof parsed === 'object') {
      console.log(`对象键数量: ${Object.keys(parsed).length}`);
      console.log(`键名: ${Object.keys(parsed).join(', ')}`);
      
      if (parsed.logs && Array.isArray(parsed.logs)) {
        console.log(`日志条数: ${parsed.logs.length}`);
      }
    }
    
  } catch (e) {
    console.log(`✗ 解析失败: ${e.message}`);
    
    // 定位错误位置
    const errorMatch = e.message.match(/position (\d+)/);
    if (errorMatch) {
      const errorPos = parseInt(errorMatch[1]);
      console.log(`\n错误位置: 第 ${errorPos} 字节`);
      
      const contextSize = 50;
      const startPos = Math.max(0, errorPos - contextSize);
      const endPos = Math.min(content.length, errorPos + contextSize);
      const context = content.substring(startPos, endPos);
      
      console.log('错误附近内容:');
      console.log('='.repeat(80));
      console.log(context);
      console.log('='.repeat(80));
    }
  }
  
} catch (e) {
  console.error('读取文件失败:', e.message);
}
