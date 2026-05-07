export class ErrorHandler {
  handleValidationError(error, text) {
    const context = this._extractContext(text, error.pos);
    const suggestion = this._getSuggestion(error);
    
    return {
      type: 'validation',
      line: error.line,
      col: error.col,
      message: error.message,
      context,
      suggestion
    };
  }

  _extractContext(text, pos, contextLines = 3) {
    const start = Math.max(0, pos - 100);
    const end = Math.min(text.length, pos + 100);
    
    const before = text.substring(start, pos);
    const after = text.substring(pos, end);
    
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    
    const context = [];
    const startLine = beforeLines.length - contextLines;
    
    for (let i = Math.max(0, startLine); i < beforeLines.length; i++) {
      context.push({
        text: beforeLines[i],
        isError: false
      });
    }
    
    if (beforeLines.length > 0 && afterLines.length > 0) {
      context.push({
        text: beforeLines[beforeLines.length - 1] + afterLines[0],
        isError: true,
        errorPos: beforeLines[beforeLines.length - 1].length
      });
    }
    
    for (let i = 1; i < Math.min(contextLines, afterLines.length); i++) {
      context.push({
        text: afterLines[i],
        isError: false
      });
    }
    
    return context;
  }

  _getSuggestion(error) {
    if (error.message.includes('Unexpected end of input')) {
      return '检查是否缺少闭合括号 `}` 或 `]`';
    }
    
    if (error.message.includes('Unterminated string')) {
      return '检查字符串是否正确闭合，确保所有引号都成对出现';
    }
    
    if (error.message.includes('Unexpected comma')) {
      return '检查逗号位置，确保在值后面使用，而不是在键名前或对象/数组末尾';
    }
    
    if (error.message.includes('Unexpected colon')) {
      return '检查冒号位置，应该在键名后面';
    }
    
    if (error.message.includes('Unexpected token')) {
      return '检查 JSON 语法，确保使用正确的 JSON 格式';
    }
    
    if (error.message.includes('Empty JSON')) {
      return '文件内容为空，请提供有效的 JSON 数据';
    }
    
    return '检查 JSON 语法是否正确';
  }

  formatErrorForDisplay(errorInfo) {
    return {
      title: `第 ${errorInfo.line} 行，第 ${errorInfo.col} 列`,
      message: errorInfo.message,
      suggestion: errorInfo.suggestion,
      context: errorInfo.context.map((line, index) => ({
        text: line.text,
        isError: line.isError,
        lineNumber: errorInfo.line - (errorInfo.context.length - 1 - index)
      }))
    };
  }
}