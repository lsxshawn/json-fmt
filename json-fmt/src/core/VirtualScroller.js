import { LRUCache } from './LRUCache.js';

export class VirtualScroller {
  constructor(container, index, text, options = {}) {
    this.container = container;
    this.index = index;
    this.text = text;
    
    this.lineHeight = options.lineHeight || 22;
    this.overScan = options.overScan || 10;
    this.cache = new LRUCache(options.cacheSize || 5000);
    
    this.scrollTop = 0;
    this.containerHeight = 0;
    this.totalHeight = 0;
    
    this.scrollContent = null;
    this.viewport = null;
    this.renderTimeout = null;
    this.idleCallback = null;
    
    this.formatQueue = [];
    this.formattedLines = new Set();
    
    this._init();
  }

  _init() {
    this.totalHeight = this.index.getLineCount() * this.lineHeight;
    this._createScrollContainer();
    
    requestAnimationFrame(() => {
      this.render();
      this._scheduleBackgroundFormatting();
    });
  }

  _createScrollContainer() {
    if (this.scrollContent) {
      this.container.removeChild(this.scrollContent);
    }
    
    this.scrollContent = document.createElement('div');
    this.scrollContent.style.position = 'relative';
    this.scrollContent.style.height = `${this.totalHeight}px`;
    
    this.viewport = document.createElement('div');
    this.viewport.style.position = 'absolute';
    this.viewport.style.top = '0';
    this.viewport.style.left = '0';
    this.viewport.style.right = '0';
    
    this.scrollContent.appendChild(this.viewport);
    this.container.appendChild(this.scrollContent);
    
    this.container.addEventListener('scroll', (e) => this.handleScroll(e));
    this.container.addEventListener('resize', () => this.handleResize());
    
    this.handleResize();
  }

  handleScroll(e) {
    this.scrollTop = this.container.scrollTop;
    
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
    }
    
    this.renderTimeout = setTimeout(() => {
      this.render();
      this.renderTimeout = null;
    }, 16);
  }

  handleResize() {
    this.containerHeight = this.container.clientHeight;
    this.render();
  }

  render() {
    const startLine = Math.max(0, Math.floor(this.scrollTop / this.lineHeight) - this.overScan);
    const endLine = Math.min(
      this.index.getLineCount(),
      Math.ceil((this.scrollTop + this.containerHeight) / this.lineHeight) + this.overScan
    );
    
    this.viewport.style.transform = `translateY(${startLine * this.lineHeight}px)`;
    
    const fragment = document.createDocumentFragment();
    
    for (let i = startLine; i < endLine; i++) {
      const lineElement = this.getLineElement(i + 1);
      lineElement.style.position = 'absolute';
      lineElement.style.top = `${(i - startLine) * this.lineHeight}px`;
      lineElement.style.left = '0';
      lineElement.style.right = '0';
      lineElement.style.height = `${this.lineHeight}px`;
      lineElement.style.lineHeight = `${this.lineHeight}px`;
      lineElement.style.overflow = 'hidden';
      fragment.appendChild(lineElement);
    }
    
    while (this.viewport.firstChild) {
      this.viewport.removeChild(this.viewport.firstChild);
    }
    
    this.viewport.appendChild(fragment);
    
    this._updateFormatQueue(startLine, endLine);
  }

  getLineElement(line) {
    const cached = this.cache.get(line);
    if (cached) {
      return cached.cloneNode(true);
    }
    
    const lineText = this.index.getLineText(this.text, line);
    const depth = this.index.getDepthAtLine(line);
    
    const element = document.createElement('div');
    element.className = 'json-line';
    element.style.paddingLeft = `${depth * 16}px`;
    
    if (this.formattedLines.has(line)) {
      element.innerHTML = this._formatLine(lineText, depth);
    } else {
      element.textContent = lineText;
      element.style.color = '#888';
    }
    
    this.cache.set(line, element.cloneNode(true));
    
    return element;
  }

  _formatLine(text, depth) {
    let result = '';
    let inString = false;
    let escape = false;
    
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      
      if (escape) {
        escape = false;
        result += ch;
        continue;
      }
      
      if (ch === '\\') {
        escape = true;
        result += ch;
        continue;
      }
      
      if (ch === '"') {
        inString = !inString;
        result += `<span style="color: ${inString ? '#008000' : '#333'}">"</span>`;
        continue;
      }
      
      if (inString) {
        result += `<span style="color: #008000">${this._escapeHtml(ch)}</span>`;
      } else if (ch === ':') {
        result += `<span style="color: #333">:</span>`;
      } else if (ch === ',' || ch === '{' || ch === '}' || ch === '[' || ch === ']') {
        result += `<span style="color: #333">${ch}</span>`;
      } else if (ch === 'true' || ch === 'false' || ch === 'null') {
        let keyword = '';
        while (i < text.length && /[a-z]/.test(text[i])) {
          keyword += text[i];
          i++;
        }
        i--;
        result += `<span style="color: #0000ff">${keyword}</span>`;
      } else if (/[\d.-]/.test(ch)) {
        let number = '';
        while (i < text.length && /[\d.eE+-]/.test(text[i])) {
          number += text[i];
          i++;
        }
        i--;
        result += `<span style="color: #ff0000">${number}</span>`;
      } else {
        result += this._escapeHtml(ch);
      }
    }
    
    return result;
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _updateFormatQueue(startLine, endLine) {
    for (let i = startLine; i < endLine; i++) {
      if (!this.formattedLines.has(i + 1)) {
        this.formatQueue.push(i + 1);
      }
    }
    
    this._scheduleBackgroundFormatting();
  }

  _scheduleBackgroundFormatting() {
    if (this.idleCallback) {
      cancelIdleCallback(this.idleCallback);
    }
    
    this.idleCallback = requestIdleCallback(() => {
      this._formatNextBatch();
    }, { timeout: 100 });
  }

  _formatNextBatch() {
    const batchSize = 30;
    let count = 0;
    
    while (this.formatQueue.length > 0 && count < batchSize) {
      const line = this.formatQueue.shift();
      if (!this.formattedLines.has(line)) {
        this.formattedLines.add(line);
        this.cache.delete(line);
        count++;
      }
    }
    
    if (this.formatQueue.length > 0) {
      this._scheduleBackgroundFormatting();
    }
    
    if (count > 0) {
      this.render();
    }
    
    this.idleCallback = null;
  }

  scrollToLine(line) {
    const scrollPosition = (line - 1) * this.lineHeight;
    this.container.scrollTop = scrollPosition;
  }

  destroy() {
    this.container.removeEventListener('scroll', (e) => this.handleScroll(e));
    this.container.removeEventListener('resize', () => this.handleResize());
    
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout);
      this.renderTimeout = null;
    }
    
    if (this.idleCallback) {
      cancelIdleCallback(this.idleCallback);
      this.idleCallback = null;
    }
    
    this.cache.clear();
    this.formatQueue = [];
    this.formattedLines.clear();
    
    if (this.scrollContent) {
      this.container.removeChild(this.scrollContent);
      this.scrollContent = null;
      this.viewport = null;
    }
  }
}