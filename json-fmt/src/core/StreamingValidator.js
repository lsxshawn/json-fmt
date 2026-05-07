export class ValidationError extends Error {
  constructor(message, line, col, pos) {
    super(message);
    this.line = line;
    this.col = col;
    this.pos = pos;
    this.name = 'ValidationError';
  }
}

export class StreamingValidator {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      depth: 0,
      inString: false,
      escape: false,
      line: 1,
      col: 1,
      lastKeyStart: 0,
      lastKeyLength: 0,
      inKey: false,
      expectKey: false,
      expectColon: false,
      expectValue: false,
      afterValue: false
    };
    this.index = {
      lines: new Uint32Array(1000000),
      linesLength: 1,
      keys: new Uint32Array(500000),
      keyPositions: new Uint32Array(500000),
      keyLengths: new Uint16Array(500000),
      keysLength: 0,
      structures: new Uint32Array(100000),
      structuresLength: 0,
      errors: [],
      totalLines: 0,
      totalKeys: 0,
      totalStructures: 0,
      rootType: null,
      size: 0
    };
    this.index.lines[0] = 0;
  }

  process(text) {
    this.reset();
    this.index.size = text.length;
    
    try {
      JSON.parse(text);
    } catch (err) {
      const match = err.message.match(/position (\d+)/);
      const pos = match ? parseInt(match[1]) : 0;
      const lines = text.substring(0, pos).split('\n');
      const line = lines.length;
      const col = lines[lines.length - 1].length + 1;
      throw new ValidationError(err.message, line, col, pos);
    }
    
    this._buildIndex(text);
    
    return this._createResult();
  }

  _buildIndex(text) {
    const len = text.length;
    let pos = 0;
    let ch;
    
    while (pos < len) {
      ch = text.charCodeAt(pos);

      if (this.state.escape) {
        this.state.escape = false;
        pos++;
        this.state.col++;
        continue;
      }

      if (this.state.inString) {
        if (ch === 0x5C) {
          this.state.escape = true;
        } else if (ch === 0x22) {
          this.state.inString = false;
          if (this.state.inKey) {
            this.state.lastKeyLength = pos - this.state.lastKeyStart - 1;
            this._addKey(text);
            this.state.inKey = false;
          }
        }
        pos++;
        this.state.col++;
        continue;
      }

      switch (ch) {
        case 0x20:
        case 0x09:
          pos++;
          this.state.col++;
          continue;

        case 0x0A:
          this._addLine(pos + 1);
          pos++;
          this.state.line++;
          this.state.col = 1;
          continue;

        case 0x0D:
          if (text.charCodeAt(pos + 1) === 0x0A) {
            pos++;
          }
          this._addLine(pos + 1);
          pos++;
          this.state.line++;
          this.state.col = 1;
          continue;

        case 0x22:
          this.state.inString = true;
          if (this.state.expectKey) {
            this.state.lastKeyStart = pos;
            this.state.inKey = true;
          }
          pos++;
          this.state.col++;
          continue;

        case 0x7B:
          if (!this.index.rootType) {
            this.index.rootType = 'object';
          }
          this._addStructure('object', 'open', pos);
          this.state.depth++;
          this.state.expectKey = true;
          pos++;
          this.state.col++;
          continue;

        case 0x7D:
          this._addStructure('object', 'close', pos);
          this.state.depth--;
          this.state.afterValue = true;
          pos++;
          this.state.col++;
          continue;

        case 0x5B:
          if (!this.index.rootType) {
            this.index.rootType = 'array';
          }
          this._addStructure('array', 'open', pos);
          this.state.depth++;
          this.state.expectValue = true;
          pos++;
          this.state.col++;
          continue;

        case 0x5D:
          this._addStructure('array', 'close', pos);
          this.state.depth--;
          this.state.afterValue = true;
          pos++;
          this.state.col++;
          continue;

        case 0x3A:
          this.state.expectColon = false;
          this.state.expectValue = true;
          pos++;
          this.state.col++;
          continue;

        case 0x2C:
          if (this.state.depth > 0) {
            const lastStructure = this._getLastStructure();
            if (lastStructure && lastStructure.type === 'object') {
              this.state.expectKey = true;
            } else {
              this.state.expectValue = true;
            }
          }
          this.state.afterValue = false;
          pos++;
          this.state.col++;
          continue;

        case 0x74:
        case 0x66:
        case 0x6E:
          const keyword = this._readKeyword(text, pos);
          if (keyword === 'true' || keyword === 'false' || keyword === 'null') {
            pos += keyword.length;
            this.state.col += keyword.length;
            this.state.expectValue = false;
            this.state.afterValue = true;
            continue;
          }
          break;

        default:
          if ((ch >= 0x30 && ch <= 0x39) || ch === 0x2D || ch === 0x2E) {
            const numLen = this._readNumber(text, pos);
            pos += numLen;
            this.state.col += numLen;
            this.state.expectValue = false;
            this.state.afterValue = true;
            continue;
          }
      }
      
      pos++;
      this.state.col++;
    }

    this.index.totalLines = this.state.line;
    this.index.totalKeys = this.index.keysLength;
    this.index.totalStructures = this.index.structuresLength;
  }

  _readKeyword(text, pos) {
    const keywords = ['true', 'false', 'null'];
    for (const kw of keywords) {
      if (text.startsWith(kw, pos)) {
        return kw;
      }
    }
    return '';
  }

  _readNumber(text, pos) {
    let len = 0;
    if (text.charCodeAt(pos) === 0x2D) {
      len++;
    }
    while (pos + len < text.length) {
      const ch = text.charCodeAt(pos + len);
      if ((ch >= 0x30 && ch <= 0x39) || ch === 0x2E || ch === 0x65 || ch === 0x45 || ch === 0x2D || ch === 0x2B) {
        len++;
      } else {
        break;
      }
    }
    return len;
  }

  _addLine(pos) {
    if (this.index.linesLength < this.index.lines.length) {
      this.index.lines[this.index.linesLength++] = pos;
    }
  }

  _addKey(text) {
    if (this.index.keysLength < this.index.keys.length && this.state.lastKeyLength > 0) {
      this.index.keys[this.index.keysLength] = (this.state.line << 8) | Math.min(this.state.depth, 255);
      this.index.keyPositions[this.index.keysLength] = this.state.lastKeyStart;
      this.index.keyLengths[this.index.keysLength] = this.state.lastKeyLength;
      this.index.keysLength++;
      this.state.expectKey = false;
      this.state.expectColon = true;
    }
  }

  _addStructure(type, action, pos) {
    if (this.index.structuresLength < this.index.structures.length) {
      const typeCode = type === 'object' ? 0 : 1;
      const actionCode = action === 'open' ? 0 : 1;
      this.index.structures[this.index.structuresLength] = 
        (this.state.line << 16) | (this.state.depth << 8) | (typeCode << 1) | actionCode;
      this.index.structuresLength++;
    }
  }

  _getLastStructure() {
    if (this.index.structuresLength === 0) return null;
    const s = this.index.structures[this.index.structuresLength - 1];
    return {
      line: s >>> 16,
      depth: (s >> 8) & 0xFF,
      type: (s >> 1) & 1 ? 'array' : 'object',
      action: s & 1 ? 'close' : 'open'
    };
  }

  _createResult() {
    return {
      lines: this.index.lines.slice(0, this.index.linesLength),
      keys: this.index.keys.slice(0, this.index.keysLength),
      keyPositions: this.index.keyPositions.slice(0, this.index.keysLength),
      keyLengths: this.index.keyLengths.slice(0, this.index.keysLength),
      structures: this.index.structures.slice(0, this.index.structuresLength),
      errors: this.index.errors,
      totalLines: this.index.totalLines,
      totalKeys: this.index.totalKeys,
      totalStructures: this.index.totalStructures,
      rootType: this.index.rootType,
      size: this.index.size
    };
  }
}