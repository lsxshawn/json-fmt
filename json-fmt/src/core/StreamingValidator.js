// src/core/StreamingValidator.js

export class StreamingValidator {
  constructor() {
    this.MAX_LINES = 5000000;
    this.MAX_KEYS = 1000000;
    
    this.lineStarts = new Uint32Array(this.MAX_LINES);
    this.keys = new Uint32Array(this.MAX_KEYS);
    this.keyPos = new Uint32Array(this.MAX_KEYS);
    this.keyLen = new Uint16Array(this.MAX_KEYS);
    
    this.lineCount = 0;
    this.keyCount = 0;
    
    this.depth = 0;
    this.maxDepth = 0;
    this.inString = false;
    this.escape = false;
    this.line = 0;
    this.col = 0;
    this.errors = [];
  }

  process(text) {
    const len = text.length;
    
    this.lineStarts[0] = 0;
    
    for (let i = 0; i < len; i++) {
      const char = text[i];
      
      if (char === '\n') {
        this.line++;
        this.col = 0;
        this.lineStarts[++this.lineCount] = i + 1;
        continue;
      }
      this.col++;
      
      if (this.inString) {
        if (this.escape) {
          this.escape = false;
        } else if (char === '\\') {
          this.escape = true;
        } else if (char === '"') {
          this.inString = false;
        }
        continue;
      }
      
      if (char === '"') {
        const keyStart = i + 1;
        let keyEnd = keyStart;
        
        while (keyEnd < len && text[keyEnd] !== '"') {
          if (text[keyEnd] === '\\') keyEnd += 2;
          else keyEnd++;
        }
        
        let after = keyEnd + 1;
        while (after < len && (text[after] === ' ' || text[after] === '\t' || text[after] === '\n' || text[after] === '\r')) after++;
        
        if (after < len && text[after] === ':') {
          const kIdx = this.keyCount++;
          this.keys[kIdx] = (this.line << 8) | (this.depth & 0xFF);
          this.keyPos[kIdx] = keyStart;
          this.keyLen[kIdx] = Math.min(keyEnd - keyStart, 65535);
          
          if (this.depth > this.maxDepth) this.maxDepth = this.depth;
        }
        
        i = keyEnd;
        this.inString = true;
        continue;
      }
      
      if (char === '{' || char === '[') {
        this.depth++;
      } else if (char === '}' || char === ']') {
        this.depth--;
        if (this.depth < 0) {
          this.errors.push({
            line: this.line,
            col: this.col,
            message: '多余的闭合符号 "' + char + '"',
            pos: i
          });
        }
      }
    }
    
    if (this.depth !== 0) {
      this.errors.push({
        line: this.line,
        col: this.col,
        message: 'JSON 未正确闭合，缺少 ' + this.depth + ' 个闭合符号',
        pos: len - 1
      });
    }
    
    return {
      index: {
        lineStarts: this.lineStarts.slice(0, this.lineCount + 1),
        keys: this.keys.slice(0, this.keyCount),
        keyPos: this.keyPos.slice(0, this.keyCount),
        keyLen: this.keyLen.slice(0, this.keyCount),
        lineCount: this.lineCount,
        keyCount: this.keyCount,
        maxDepth: this.maxDepth
      },
      errors: this.errors,
      meta: {
        totalChars: len,
        totalLines: this.lineCount,
        totalKeys: this.keyCount,
        maxDepth: this.maxDepth
      }
    };
  }

  static getKeyName(text, index, keyIdx) {
    const start = index.keyPos[keyIdx];
    const len = index.keyLen[keyIdx];
    return text.substring(start, start + len);
  }

  static getLine(text, index, lineNum) {
    const start = index.lineStarts[lineNum];
    const end = index.lineStarts[lineNum + 1] || text.length;
    return text.slice(start, end).trim();
  }
}

export class ValidationError extends Error {
  constructor(message, line, col, pos) {
    super(message);
    this.name = 'ValidationError';
    this.line = line;
    this.col = col;
    this.pos = pos;
  }
}