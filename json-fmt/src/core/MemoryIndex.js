export class MemoryIndex {
  constructor(maxLines = 1000000) {
    this.lineStarts = new Uint32Array(maxLines);
    this.lineCount = 0;
    
    this.keys = new Uint32Array(500000);
    this.keyPositions = new Uint32Array(500000);
    this.keyLengths = new Uint16Array(500000);
    this.keyCount = 0;
    
    this.structures = new Uint32Array(100000);
    this.structureCount = 0;
    
    this.rootType = 'object';
    this.size = 0;
  }

  loadFromStreamingIndex(index, text) {
    this.lineCount = Math.min(index.lines.length, this.lineStarts.length);
    for (let i = 0; i < this.lineCount; i++) {
      this.lineStarts[i] = index.lines[i];
    }
    
    this.keyCount = Math.min(index.keys.length, this.keys.length);
    for (let i = 0; i < this.keyCount; i++) {
      this.keys[i] = index.keys[i];
      this.keyPositions[i] = index.keyPositions[i];
      this.keyLengths[i] = index.keyLengths[i];
    }
    
    this.structureCount = Math.min(index.structures.length, this.structures.length);
    for (let i = 0; i < this.structureCount; i++) {
      this.structures[i] = index.structures[i];
    }
    
    this.rootType = index.rootType || 'object';
    this.size = index.size || text.length;
  }

  getLineStart(line) {
    if (line <= 0 || line > this.lineCount) return 0;
    return this.lineStarts[line - 1];
  }

  getLineEnd(line) {
    if (line <= 0) return 0;
    if (line >= this.lineCount) return this.size;
    return this.lineStarts[line];
  }

  getLineText(text, line) {
    const start = this.getLineStart(line);
    const end = this.getLineEnd(line);
    return text.substring(start, end);
  }

  getLineCount() {
    return this.lineCount;
  }

  binarySearchKey(line) {
    let low = 0;
    let high = this.keyCount - 1;
    
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const keyLine = this.keys[mid] >>> 8;
      
      if (keyLine === line) {
        return mid;
      } else if (keyLine < line) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    
    return -1;
  }

  getKeyAt(index) {
    if (index < 0 || index >= this.keyCount) return null;
    return {
      line: this.keys[index] >>> 8,
      depth: this.keys[index] & 0xFF,
      position: this.keyPositions[index],
      length: this.keyLengths[index]
    };
  }

  getParent(line) {
    let targetDepth = -1;
    let parentLine = -1;
    
    for (let i = this.structureCount - 1; i >= 0; i--) {
      const s = this.structures[i];
      const structLine = s >>> 16;
      const depth = (s >> 8) & 0xFF;
      const action = s & 1;
      
      if (structLine >= line) continue;
      
      if (action === 1) {
        if (targetDepth === -1) {
          targetDepth = depth + 1;
        }
      } else {
        if (depth === targetDepth - 1) {
          parentLine = structLine;
          break;
        }
      }
    }
    
    return parentLine;
  }

  getChildren(parentLine) {
    const children = [];
    let parentDepth = -1;
    
    for (let i = 0; i < this.structureCount; i++) {
      const s = this.structures[i];
      const structLine = s >>> 16;
      const depth = (s >> 8) & 0xFF;
      const action = s & 1;
      
      if (structLine === parentLine && action === 0) {
        parentDepth = depth;
        continue;
      }
      
      if (parentDepth !== -1) {
        if (action === 0 && depth === parentDepth + 1) {
          children.push(structLine);
        } else if (action === 1 && depth === parentDepth) {
          break;
        }
      }
    }
    
    return children;
  }

  getStructureAtLine(line) {
    for (let i = 0; i < this.structureCount; i++) {
      const s = this.structures[i];
      const structLine = s >>> 16;
      if (structLine === line) {
        return {
          line: structLine,
          depth: (s >> 8) & 0xFF,
          type: (s >> 1) & 1 ? 'array' : 'object',
          action: s & 1 ? 'close' : 'open'
        };
      }
    }
    return null;
  }

  getDepthAtLine(line) {
    let depth = 0;
    
    for (let i = 0; i < this.structureCount; i++) {
      const s = this.structures[i];
      const structLine = s >>> 16;
      if (structLine > line) break;
      
      const action = s & 1;
      if (action === 0) {
        depth++;
      } else {
        depth--;
      }
    }
    
    return depth;
  }

  searchKeys(query) {
    const results = [];
    query = query.toLowerCase();
    
    for (let i = 0; i < this.keyCount; i++) {
      const keyLen = this.keyLengths[i];
      if (keyLen < query.length) continue;
      
      const pos = this.keyPositions[i];
      const key = String.fromCharCode(
        ...new Uint16Array(this.keyPositions.buffer, pos * 2, keyLen)
      ).toLowerCase();
      
      if (key.includes(query)) {
        results.push({
          line: this.keys[i] >>> 8,
          position: pos,
          length: keyLen
        });
      }
    }
    
    return results;
  }

  clear() {
    this.lineCount = 0;
    this.keyCount = 0;
    this.structureCount = 0;
    this.rootType = 'object';
    this.size = 0;
  }
}