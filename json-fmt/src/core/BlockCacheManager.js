export class BlockCacheManager {
  constructor(options = {}) {
    this.blockSize = options.blockSize || 300;
    this.maxActiveBlocks = options.maxActiveBlocks || 3;
    this.recycleThreshold = options.recycleThreshold || 1;
    
    this.activeBlocks = new Map();
    this.recyclingQueue = [];
    this.loadingPromises = new Map();
    
    this.memoryIndex = null;
    this.content = '';
    this.totalNodes = 0;
    
    this.onBlocksChanged = null;
    this.onMemoryWarning = null;
    
    this.rowHeight = 28;
    
    // 缓存解析后的完整数据
    this.parsedData = null;
    this.flatNodesCache = [];
    
    this.collapsedNodes = new Set();
    this.parentMap = new Map();
    this.childrenMap = new Map();
    this._visibleCache = [];
    this._visibleIdSet = new Set();
  }
  
  initialize(index, content, totalNodes) {
    this.memoryIndex = index;
    this.content = content;
    this.totalNodes = totalNodes;
    this.activeBlocks.clear();
    this.recyclingQueue = [];
    this.loadingPromises.clear();
    this.collapsedNodes.clear();
    this.parentMap.clear();
    this.childrenMap.clear();
    this._visibleCache.length = 0;
    this._visibleIdSet.clear();
    
    // 解析完整数据
    try {
      let cleanContent = content;
      if (cleanContent.charCodeAt(0) === 0xFEFF) {
        cleanContent = cleanContent.substring(1);
      }
      this.parsedData = JSON.parse(cleanContent);
      
      // 立即构建完整的 flatNodesCache
      console.log('[BlockCacheManager] initialize: building flatNodesCache, totalNodes:', totalNodes);
      this._buildFlatNodesCache();
      console.log('[BlockCacheManager] initialize: flatNodesCache built, length:', this.flatNodesCache.length);
    } catch (e) {
      console.error('Failed to parse JSON:', e);
    }
  }
  
  getTotalBlocks() {
    return Math.ceil(this.totalNodes / this.blockSize);
  }
  
  getBlockId(nodeIndex) {
    return Math.floor(nodeIndex / this.blockSize);
  }
  
  getBlockRange(blockId) {
    const start = blockId * this.blockSize;
    const end = Math.min((blockId + 1) * this.blockSize - 1, this.totalNodes - 1);
    return { start, end, blockId };
  }
  
  loadBlocks(rangeStart, rangeEnd) {
    let needsUpdate = false;
    
    console.log('[BlockCacheManager] loadBlocks: rangeStart:', rangeStart, 'rangeEnd:', rangeEnd, 
                'activeBlocks.size:', this.activeBlocks.size);
    
    for (let blockId = rangeStart; blockId <= rangeEnd; blockId++) {
      if (!this.activeBlocks.has(blockId)) {
        console.log('[BlockCacheManager] loadBlocks: loading block', blockId);
        this._loadBlockSync(blockId);
        needsUpdate = true;
      } else {
        // 更新已加载block的访问时间
        const block = this.activeBlocks.get(blockId);
        if (block) {
          block.lastAccessTime = Date.now();
        }
        console.log('[BlockCacheManager] loadBlocks: block', blockId, 'already loaded, status:', block?.status);
      }
    }
    
    this.recycleBlocks(rangeStart, rangeEnd);
    
    if (needsUpdate && this.onBlocksChanged) {
      const activeNodes = this.getActiveNodes();
      this.onBlocksChanged(activeNodes);
    }
  }
  
  _loadBlockSync(blockId) {
    const range = this.getBlockRange(blockId);
    
    console.log('[BlockCacheManager] _loadBlockSync: blockId:', blockId, 
                'range:', range, 'memoryIndex:', !!this.memoryIndex, 'content:', !!this.content);
    
    const block = {
      id: blockId,
      startIndex: range.start,
      endIndex: range.end,
      nodes: [],
      status: 'loaded',
      lastAccessTime: Date.now()
    };
    
    this.activeBlocks.set(blockId, block);
    
    try {
      console.log('[BlockCacheManager] _loadBlockSync: calling _parseBlock with start:', range.start, 'end:', range.end);
      const nodes = this._parseBlock(range.start, range.end);
      console.log('[BlockCacheManager] _loadBlockSync: _parseBlock returned', nodes.length, 'nodes');
      block.nodes = nodes;
      block.status = 'loaded';
      block.lastAccessTime = Date.now();
    } catch (error) {
      console.error(`Failed to load block ${blockId}:`, error);
      block.status = 'error';
    }
  }
  
  _parseBlock(startIndex, endIndex) {
    const nodes = [];
    
    console.log('[BlockCacheManager] _parseBlock: startIndex:', startIndex, 'endIndex:', endIndex, 
                'flatNodesCache.length:', this.flatNodesCache.length, 'totalNodes:', this.totalNodes);
    
    // 如果没有解析数据，返回空数组
    if (!this.parsedData) {
      console.log('[BlockCacheManager] _parseBlock: parsedData is null');
      return nodes;
    }
    
    // 如果缓存不完整或请求的范围超出缓存范围，需要构建完整缓存
    if (this.flatNodesCache.length < this.totalNodes || endIndex >= this.flatNodesCache.length) {
      console.log('[BlockCacheManager] _parseBlock: building flatNodesCache');
      this._buildFlatNodesCache();
      console.log('[BlockCacheManager] _parseBlock: flatNodesCache built, length:', this.flatNodesCache.length);
    }
    
    // 如果已经有完整缓存的flatNodes，直接切片获取
    if (this.flatNodesCache.length > 0) {
      const result = this.flatNodesCache.slice(startIndex, Math.min(endIndex + 1, this.flatNodesCache.length));
      console.log('[BlockCacheManager] _parseBlock: returning', result.length, 'nodes');
      return result;
    }
    
    return nodes;
  }
  
  _buildFlatNodesCache() {
    if (!this.parsedData) {
      console.log('[BlockCacheManager] _buildFlatNodesCache: parsedData is null');
      return;
    }
    
    console.log('[BlockCacheManager] _buildFlatNodesCache: starting, totalNodes:', this.totalNodes);
    
    const data = this.parsedData;
    let idCounter = 0;
    const flatNodes = [];
    
    const treeStack = [];
    treeStack.push({ v: data, k: undefined, d: 0, r: true, p: null });
    
    while (treeStack.length > 0 && flatNodes.length < this.totalNodes) {
      const item = treeStack.pop();
      const v = item.v;
      const k = item.k;
      const d = item.d;
      const r = item.r;
      const parent = item.p;
      
      const node = this._createNode(v, k, d, idCounter++, r);
      flatNodes.push(node);
      
      if (parent !== null && parent !== undefined) {
        this.parentMap.set(node.id, parent);
        if (!this.childrenMap.has(parent)) {
          this.childrenMap.set(parent, []);
        }
        this.childrenMap.get(parent).push(node.id);
      }
      
      // 如果是对象或数组，添加子节点到栈
      if (node.hasChildren && v) {
        const keys = Array.isArray(v) ? v.map((_, i) => i) : Object.keys(v);
        for (let i = keys.length - 1; i >= 0; i--) {
          const key = keys[i];
          const childValue = v[key];
          treeStack.push({
            v: childValue,
            k: key,
            d: d + 1,
            r: false,
            p: node.id
          });
        }
      }
    }
    
    this.flatNodesCache = flatNodes;
    this._visibleCache = [...flatNodes];
    this._visibleIdSet = new Set(flatNodes.map(n => n.id));
    console.log('[BlockCacheManager] _buildFlatNodesCache: finished, flatNodesCache.length:', this.flatNodesCache.length);
  }
  
  _createNode(value, key, depth, id, isRoot = false) {
    const t = typeof value;
    let type = 'string';
    let displayValue = '';
    let childCount = 0;
    
    if (value === null) {
      type = 'null';
      displayValue = 'null';
    } else if (t === 'boolean') {
      type = 'boolean';
      displayValue = value ? 'true' : 'false';
    } else if (t === 'number') {
      type = 'number';
      displayValue = String(value);
    } else if (t === 'string') {
      type = 'string';
      displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
    } else if (t === 'object') {
      if (Array.isArray(value)) {
        type = 'array';
        displayValue = `[${value.length}]`;
        childCount = value.length;
      } else {
        type = 'object';
        const keys = Object.keys(value);
        displayValue = `{${keys.length}}`;
        childCount = keys.length;
      }
    }
    
    const keyStr = isRoot ? '' : (key !== undefined ? (typeof key === 'number' ? `[${key}]` : key) : '');
    
    return {
      id: id,
      key: keyStr,
      value: value,
      type: type,
      depth: depth,
      collapsed: false,
      hasChildren: type === 'object' || type === 'array',
      displayValue: displayValue,
      childCount: childCount,
      fullValue: t === 'string' ? value : displayValue
    };
  }
  
  _indexToLine(index) {
    const totalLines = this.memoryIndex.getLineCount();
    return Math.min(Math.ceil((index + 1) * totalLines / this.totalNodes), totalLines);
  }
  
  _parseLineFast(lineText, lineNum, depth, nodeId, arrayIndex = -1) {
    const trimmed = lineText.trim();
    
    let key = '';
    let value = '';
    let type = 'string';
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      key = trimmed.substring(0, colonIndex).trim();
      if (key.startsWith('"') && key.endsWith('"')) {
        key = key.substring(1, key.length - 1);
      } else if (key.startsWith("'") && key.endsWith("'")) {
        key = key.substring(1, key.length - 1);
      }
      value = trimmed.substring(colonIndex + 1).trim();
      if (value.endsWith(',')) {
        value = value.substring(0, value.length - 1);
      }
    } else {
      // 没有冒号，可能是数组元素或特殊情况
      value = trimmed;
      if (value.endsWith(',')) {
        value = value.substring(0, value.length - 1);
      }
      // 如果是数组元素，使用数组索引
      if (arrayIndex >= 0) {
        key = `[${arrayIndex}]`;
      }
    }
    
    const firstChar = value[0];
    if (firstChar === '{') {
      type = 'object';
    } else if (firstChar === '[') {
      type = 'array';
    } else if (firstChar === '"' || firstChar === "'") {
      type = 'string';
    } else if (value === 'null') {
      type = 'null';
    } else if (value === 'true' || value === 'false') {
      type = 'boolean';
    } else if (!isNaN(parseFloat(value)) && value.trim() !== '') {
      type = 'number';
    }
    
    let displayValue = value;
    if (type === 'string') {
      const strValue = value.substring(1, value.length - 1);
      displayValue = strValue.length > 50 ? strValue.substring(0, 50) + '...' : strValue;
    } else if (type === 'object') {
      displayValue = '{...}';
    } else if (type === 'array') {
      displayValue = '[...]';
    }
    
    return {
      id: nodeId,
      key: key || '',
      value: value,
      type: type,
      depth: depth,
      collapsed: false,
      hasChildren: type === 'object' || type === 'array',
      displayValue: displayValue,
      childCount: this._estimateChildCountFast(value),
      fullValue: value
    };
  }
  
  _estimateChildCountFast(value) {
    if (value.length < 3) return 0;
    const firstChar = value[0];
    if (firstChar === '{') {
      let count = 0;
      let inString = false;
      for (let i = 1; i < value.length; i++) {
        if (value[i] === '"' && value[i-1] !== '\\') {
          inString = !inString;
        }
        if (!inString && value[i] === '"') {
          count++;
        }
      }
      return count;
    }
    if (firstChar === '[') {
      const inner = value.substring(1, value.length - 1).trim();
      if (!inner) return 0;
      let count = 1;
      let inString = false;
      for (let i = 0; i < inner.length; i++) {
        if (inner[i] === '"' && inner[i-1] !== '\\') {
          inString = !inString;
        }
        if (!inString && inner[i] === ',') {
          count++;
        }
      }
      return count;
    }
    return 0;
  }
  
  _parseLine(lineText, lineNum, depth, nodeId) {
    const trimmed = lineText.trim();
    if (!trimmed || trimmed === ',' || trimmed === '{' || trimmed === '}' || trimmed === '[' || trimmed === ']') {
      return null;
    }
    
    let key = '';
    let value = '';
    let type = 'string';
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      key = trimmed.substring(0, colonIndex).trim().replace(/^["']|["']$/g, '');
      value = trimmed.substring(colonIndex + 1).trim().replace(/,$/, '');
    } else {
      value = trimmed.replace(/,$/, '');
    }
    
    if (value === 'null') {
      type = 'null';
    } else if (value === 'true' || value === 'false') {
      type = 'boolean';
    } else if (!isNaN(parseFloat(value)) && value !== '') {
      type = 'number';
    } else if (value.startsWith('"') || value.startsWith("'")) {
      type = 'string';
    } else if (value.startsWith('{')) {
      type = 'object';
    } else if (value.startsWith('[')) {
      type = 'array';
    }
    
    return {
      id: nodeId,
      key: key || `[${lineNum}]`,
      value: value,
      type: type,
      depth: depth,
      collapsed: false,
      hasChildren: type === 'object' || type === 'array',
      displayValue: this._formatValue(value, type),
      childCount: this._estimateChildCount(value),
      fullValue: value
    };
  }
  
  _formatValue(value, type) {
    if (type === 'string') {
      const str = value.replace(/^["']|["']$/g, '');
      return str.length > 50 ? str.substring(0, 50) + '...' : str;
    }
    if (type === 'object') return '{...}';
    if (type === 'array') return '[...]';
    return value;
  }
  
  _estimateChildCount(value) {
    if (value.startsWith('{')) {
      const match = value.match(/"[^"]*"/g);
      return match ? match.length : 0;
    }
    if (value.startsWith('[')) {
      const trimmed = value.substring(1, value.length - 1).trim();
      if (!trimmed) return 0;
      return trimmed.split(',').length;
    }
    return 0;
  }
  
  recycleBlocks(keepStart, keepEnd) {
    const toRecycle = [];
    
    for (const [blockId, block] of this.activeBlocks) {
      if (blockId < keepStart - 1 || blockId > keepEnd + 1) {
        toRecycle.push(blockId);
      }
    }
    
    toRecycle.forEach(blockId => {
      this.recycleBlock(blockId);
    });
    
    while (this.recyclingQueue.length > this.recycleThreshold) {
      const oldestBlockId = this.recyclingQueue.shift();
      this.forceRecycle(oldestBlockId);
    }
  }
  
  recycleBlock(blockId) {
    const block = this.activeBlocks.get(blockId);
    if (!block) return;
    
    block.status = 'recycled';
    this.recyclingQueue.push(blockId);
    
    if (this.recyclingQueue.length > this.maxActiveBlocks + this.recycleThreshold) {
      this.forceRecycle(blockId);
    }
  }
  
  forceRecycle(blockId) {
    const block = this.activeBlocks.get(blockId);
    if (!block) return;
    
    block.nodes = null;
    this.activeBlocks.delete(blockId);
    
    const queueIndex = this.recyclingQueue.indexOf(blockId);
    if (queueIndex !== -1) {
      this.recyclingQueue.splice(queueIndex, 1);
    }
  }
  
  getActiveNodes() {
    const nodes = [];
    const sortedBlockIds = Array.from(this.activeBlocks.keys()).sort((a, b) => a - b);
    
    for (const blockId of sortedBlockIds) {
      const block = this.activeBlocks.get(blockId);
      if (block && block.status === 'loaded' && block.nodes) {
        for (const node of block.nodes) {
          if (this._visibleIdSet.has(node.id)) {
            nodes.push(node);
          }
        }
      }
    }
    
    return nodes;
  }
  
  getNodesInRange(startIndex, endIndex) {
    const nodes = [];
    const startBlock = this.getBlockId(startIndex);
    const endBlock = this.getBlockId(endIndex);
    
    for (let blockId = startBlock; blockId <= endBlock; blockId++) {
      const block = this.activeBlocks.get(blockId);
      if (block && block.status === 'loaded' && block.nodes) {
        const blockStart = Math.max(block.startIndex, startIndex);
        const blockEnd = Math.min(block.endIndex, endIndex);
        
        const startOffset = blockStart - block.startIndex;
        const endOffset = blockEnd - block.startIndex;
        
        nodes.push(...block.nodes.slice(startOffset, endOffset + 1));
      }
    }
    
    return nodes;
  }
  
  isBlockLoaded(blockId) {
    const block = this.activeBlocks.get(blockId);
    return block && block.status === 'loaded';
  }
  
  isRangeLoaded(rangeStart, rangeEnd) {
    for (let blockId = rangeStart; blockId <= rangeEnd; blockId++) {
      if (!this.isBlockLoaded(blockId)) return false
    }
    return true
  }
  
  isCollapsed(nodeId) {
    return this.collapsedNodes.has(nodeId);
  }
  
  getTotalVisibleNodes() {
    return this._visibleCache.length;
  }
  
  getVisibleNodeIndex(nodeId) {
    for (let i = 0; i < this._visibleCache.length; i++) {
      if (this._visibleCache[i].id === nodeId) return i;
    }
    return -1;
  }
  
  getVisibleAncestor(nodeId) {
    let cur = this.parentMap.get(nodeId);
    while (cur !== undefined) {
      if (this.collapsedNodes.has(cur)) return cur;
      cur = this.parentMap.get(cur);
    }
    return null;
  }
  
  visibleToFlatRange(start, end) {
    const len = this._visibleCache.length;
    if (len === 0) return { start: 0, end: 0 };
    const s = Math.max(0, Math.min(start, len - 1));
    const e = Math.max(0, Math.min(end - 1, len - 1));
    return {
      start: this._visibleCache[s].id,
      end: this._visibleCache[e].id + 1
    };
  }
  
  prepareJumpToVisible(flatId) {
    const ancestor = this.getVisibleAncestor(flatId);
    if (ancestor !== null) {
      this.collapsedNodes.delete(ancestor);
      this._expandInVisibleCache(ancestor);
      this._visibleIdSet = new Set(this._visibleCache.map(n => n.id));
      if (this.onBlocksChanged) {
        this.onBlocksChanged(this.getActiveNodes());
      }
    }
    return this.getVisibleNodeIndex(flatId);
  }
  
  toggleNode(nodeId) {
    if (!this.childrenMap.has(nodeId) || this.childrenMap.get(nodeId).length === 0) return -1;
    
    const wasCollapsed = this.collapsedNodes.has(nodeId);
    if (wasCollapsed) {
      this.collapsedNodes.delete(nodeId);
      this._expandInVisibleCache(nodeId);
    } else {
      this.collapsedNodes.add(nodeId);
      this._collapseInVisibleCache(nodeId);
    }
    
    this._visibleIdSet = new Set(this._visibleCache.map(n => n.id));
    
    if (this.onBlocksChanged) {
      this.onBlocksChanged(this.getActiveNodes());
    }
    
    return this.getVisibleNodeIndex(nodeId);
  }
  
  _expandInVisibleCache(nodeId) {
    const idx = this._visibleCache.findIndex(n => n.id === nodeId);
    if (idx === -1) return;
    
    const directChildren = this.childrenMap.get(nodeId) || [];
    if (directChildren.length === 0) return;
    
    const childNodes = directChildren
      .map(cid => this.flatNodesCache[cid])
      .filter(Boolean);
    
    this._visibleCache.splice(idx + 1, 0, ...childNodes);
  }
  
  _collapseInVisibleCache(nodeId) {
    const idx = this._visibleCache.findIndex(n => n.id === nodeId);
    if (idx === -1) return;
    
    let count = 0;
    for (let i = idx + 1; i < this._visibleCache.length; i++) {
      if (this._isAncestor(nodeId, this._visibleCache[i].id)) {
        count++;
      } else {
        break;
      }
    }
    
    if (count > 0) {
      this._visibleCache.splice(idx + 1, count);
    }
  }
  
  _isAncestor(ancestorId, nodeId) {
    let cur = this.parentMap.get(nodeId);
    while (cur !== undefined) {
      if (cur === ancestorId) return true;
      cur = this.parentMap.get(cur);
    }
    return false;
  }
  
  clear() {
    this.activeBlocks.forEach(block => {
      if (block.nodes) {
        block.nodes = null;
      }
    });
    this.activeBlocks.clear();
    this.recyclingQueue = [];
    this.loadingPromises.clear();
    
    this.parsedData = null;
    this.flatNodesCache = [];
    this.collapsedNodes.clear();
    this.parentMap.clear();
    this.childrenMap.clear();
    this._visibleCache.length = 0;
    this._visibleIdSet.clear();
  }
}