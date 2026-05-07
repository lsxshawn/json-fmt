<script setup>
import { ref, computed, onMounted, onUnmounted, shallowRef, markRaw } from 'vue';
import '@/assets/vscode.css';
import SideBar from '@/components/SideBar.vue';
import EditorTabs from '@/components/EditorTabs.vue';
import JsonTreeView from '@/components/JsonTreeView.vue';
import StatusBar from '@/components/StatusBar.vue';
import DetailPanel from '@/components/DetailPanel.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import LogoIcon from '@/components/icons/LogoIcon.vue';
import FormatIcon from '@/components/icons/FormatIcon.vue';
import CompressIcon from '@/components/icons/CompressIcon.vue';
import EscapeIcon from '@/components/icons/EscapeIcon.vue';
import ThemeIcon from '@/components/icons/ThemeIcon.vue';
import MoreIcon from '@/components/icons/MoreIcon.vue';
import SaveIcon from '@/components/icons/SaveIcon.vue';

const SAMPLE_JSON = {
  name: 'JSON Pro',
  version: '1.0.0',
  description: '大文件安全可视化 JSON 工具',
  features: {
    performance: ['100MB+ 大文件支持', 'Web Worker 解析', '虚拟滚动'],
    security: ['纯本地处理', '断网可用', '数据不上传']
  },
  stats: {
    users: 125000,
    rating: 4.9,
    isOpenSource: true,
    lastUpdate: null
  },
  tags: ['JSON', 'Visualization', 'Security', 'Large Files'],
  dependencies: {},
  devDependencies: {
    vue: '^3.5.0',
    vite: '^8.0.0'
  },
  items: [
    { id: 1, name: 'First', value: 100 },
    { id: 2, name: 'Second', value: 200 },
    { id: 3, name: 'Third', value: 300 }
  ]
};

const workerCode = `
let rawData = '';
let parsedTree = null;
let nodeIdCounter = 0;

function generateId() {
  return ++nodeIdCounter;
}

function ensureChildren(node) {
  if (!node._isLazy || !node._rawValue) return;

  const maxChildren = node._maxChildren || Infinity;
  if (Array.isArray(node._rawValue)) {
    const items = node._rawValue.slice(0, maxChildren);
    node.children = items.map((item, index) => {
      const child = createNode('[' + index + ']', item, node.path);
      return child;
    });
    if (node._rawValue.length > maxChildren) {
      node._remaining = node._rawValue.length - maxChildren;
    }
  } else if (typeof node._rawValue === 'object') {
    const entries = Object.entries(node._rawValue).slice(0, maxChildren);
    node.children = entries.map(([k, v]) => {
      const child = createNode(k, v, node.path);
      return child;
    });
    if (Object.keys(node._rawValue).length > maxChildren) {
      node._remaining = Object.keys(node._rawValue).length - maxChildren;
    }
  }

  node._isLazy = false;
  node._rawValue = null;
}

function createNode(key, value, parentPath = '') {
  const id = generateId();
  const path = parentPath ? (Array.isArray(parentPath) ? parentPath : [parentPath]) : [];
  if (key !== undefined) path.push(key);
  
  const isRoot = key === undefined;
  
  const displayPath = (function() {
    let result = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (typeof p !== 'number') {
        result.push(p);
      }
    }
    const lastElement = path[path.length - 1];
    if (typeof lastElement === 'number') {
      if (result.length === 0) {
        result.push('[' + lastElement + ']');
      } else {
        result[result.length - 1] += '[' + lastElement + ']';
      }
    }
    return result.join('.');
  })();
  
  const node = {
    id,
    key,
    path: [...path],
    pathStr: path.length > 0 ? displayPath : 'root',
    collapsed: !isRoot && path.length < 2,
    isRoot
  };

  if (value === null) {
    node.type = 'null';
    node.displayValue = 'null';
  } else if (typeof value === 'boolean') {
    node.type = 'boolean';
    node.displayValue = String(value);
  } else if (typeof value === 'number') {
    node.type = 'number';
    node.displayValue = String(value);
  } else if (typeof value === 'string') {
    node.type = 'string';
    node.displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
    node.fullValue = value;
  } else if (Array.isArray(value)) {
    node.type = 'array';
    node.children = [];
    node.childCount = value.length;
    node._rawValue = value;
    node._isLazy = true;
    node._maxChildren = 1000;
  } else if (typeof value === 'object') {
    node.type = 'object';
    node.children = [];
    node.childCount = Object.keys(value).length;
    node._rawValue = value;
    node._isLazy = true;
    node._maxChildren = 1000;
  } else {
    node.type = 'unknown';
    node.displayValue = String(value);
  }

  return node;
}

function flattenTree(node, visibleNodes = [], depth = 0) {
  if (!node) return visibleNodes;
  
  if (!node.collapsed) {
    ensureChildren(node);
  }
  const nodeCopy = {
    id: node.id,
    key: node.key,
    type: node.type,
    displayValue: node.displayValue,
    collapsed: node.collapsed,
    childCount: node.childCount,
    depth: depth
  };
  visibleNodes.push(nodeCopy);
  if (!node.collapsed && node.children) {
    for (const child of node.children) {
      if (child) {
        flattenTree(child, visibleNodes, depth + 1);
      }
    }
  }
  return visibleNodes;
}

// ============================================
// 重要：大文件永远都是展开所有节点
//       MAX_WORKER_NODES 设置为更大的值，确保所有节点都能显示
// ============================================
const MAX_WORKER_NODES = 1000000;
const MAX_WORKER_TOTAL = 5000000;

function estimateNodeCount(obj, count = 0) {
  if (count > MAX_WORKER_TOTAL * 2) return count;
  if (obj === null || typeof obj !== 'object') return count + 1;
  count++;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      count = estimateNodeCount(item, count);
      if (count > MAX_WORKER_TOTAL * 2) break;
    }
  } else {
    for (const key of Object.keys(obj)) {
      count = estimateNodeCount(obj[key], count);
      if (count > MAX_WORKER_TOTAL * 2) break;
    }
  }
  return count;
}

function parseJSON(text) {
  nodeIdCounter = 0;
  
  const data = JSON.parse(text);
  
  const estimatedTotal = estimateNodeCount(data);
  if (estimatedTotal > MAX_WORKER_TOTAL) {
    throw new Error('文件过大，包含约 ' + estimatedTotal.toLocaleString() + ' 个节点，超过支持的最大节点数 ' + MAX_WORKER_TOTAL.toLocaleString());
  }
  
  parsedTree = createNode(undefined, data);
  const visibleNodes = flattenTree(parsedTree);
  
  if (visibleNodes.length > MAX_WORKER_NODES) {
    return {
      visibleNodes: visibleNodes.slice(0, MAX_WORKER_NODES),
      totalNodes: countNodes(parsedTree),
      truncated: true
    };
  }
  
  return {
    visibleNodes,
    totalNodes: countNodes(parsedTree)
  };
}

function countNodes(node) {
  if (!node) return 0;
  
  let count = 1;
  if (node._isLazy && node._rawValue) {
    if (Array.isArray(node._rawValue)) {
      count += node._rawValue.length;
    } else if (typeof node._rawValue === 'object') {
      count += Object.keys(node._rawValue).length;
    }
  } else if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }
  return count;
}

function toggleNode(nodeId) {
  function toggle(n) {
    if (n.id === nodeId) {
      n.collapsed = !n.collapsed;
      if (!n.collapsed) {
        ensureChildren(n);
      }
      return true;
    }
    if (n._isLazy) {
      ensureChildren(n);
    }
    if (n.children) {
      for (const child of n.children) {
        if (toggle(child)) return true;
      }
    }
    return false;
  }
  toggle(parsedTree);
  const result = {
    visibleNodes: flattenTree(parsedTree),
    totalNodes: countNodes(parsedTree)
  };
  parsedTree._rawValue = null;
  return result;
}

function expandAll(node = parsedTree) {
  if (!node) return;
  node.collapsed = false;
  const originalMaxChildren = node._maxChildren;
  node._maxChildren = Infinity;
  ensureChildren(node);
  node._maxChildren = originalMaxChildren;
  if (node.children) node.children.forEach(expandAll);
}

function collapseAll(node = parsedTree) {
  node.collapsed = true;
  if (node.children) node.children.forEach(collapseAll);
}

self.onmessage = function(e) {
  const { type, data, nodeId } = e.data;
  
  switch(type) {
    case 'parse':
      try {
        const startTime = performance.now();
        const result = parseJSON(data);
        const parseTime = performance.now() - startTime;
        self.postMessage({ type: 'parsed', ...result, parseTime });
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
    case 'parseAndExpandAll':
      try {
        const startTime = performance.now();
        const result = parseJSON(data);
        expandAll();
        const expandedNodes = flattenTree(parsedTree);
        // ============================================
        // 重要：totalNodes 必须等于展开后的节点数
        //       使用 expandedNodes.length 而不是 countNodes
        //       确保节点数显示正确！
        // ============================================
        const totalCount = expandedNodes.length;
        const parseTime = performance.now() - startTime;
        self.postMessage({ type: 'parsed', visibleNodes: expandedNodes, totalNodes: totalCount, parseTime });
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
    case 'toggle':
      const toggleResult = toggleNode(nodeId);
      self.postMessage({ type: 'toggled', ...toggleResult });
      break;
    case 'expandAll':
      expandAll();
      self.postMessage({ type: 'updated', visibleNodes: flattenTree(parsedTree), totalNodes: countNodes(parsedTree) });
      break;
    case 'collapseAll':
      collapseAll();
      self.postMessage({ type: 'updated', visibleNodes: flattenTree(parsedTree), totalNodes: countNodes(parsedTree) });
      break;
  }
};
`;

const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
let worker = null;

const files = ref([]);
const currentFileId = ref(null);
const jsonTree = shallowRef(null);
const visibleNodes = shallowRef([]);
const totalNodes = ref(0);
const parseStatus = ref('');
const errorMessage = ref('');
const warningMessage = ref('');
const fileSize = ref(0);
const parseTime = ref(0);
const isEscaped = ref(false);
const isUsingWorker = ref(true);
// ============================================
// 重要：防止在Worker处理过程中切换文件导致崩溃
// ============================================
const isParsing = ref(false);
const isLargeFileMode = ref(false);
const containerRef = ref(null);
const containerHeight = ref(600);
const selectedNode = ref(null);
const showDetailPanel = ref(false);
const searchQuery = ref('');
const isDragging = ref(false);
const cursorPosition = ref({ line: 1, column: 1 });
const dbName = 'JsonProCache';
const storeName = 'files';
const dbVersion = 1;
let db = null;
const showCommandPalette = ref(false);
const currentTheme = ref('light');
const fileInputRef = ref(null);
const isTextMode = ref(false);
const textContent = ref('');
const searchMatchIndex = ref(0);
const searchMatchCount = ref(0);

const currentFile = computed(() => files.value.find(f => f.id === currentFileId.value));
const filteredVisibleNodes = computed(() => {
  return visibleNodes.value;
});

function getNodeMatchInfo(node) {
  if (!searchQuery.value.trim()) {
    return { isMatch: false };
  }
  const q = searchQuery.value.toLowerCase();
  const isMatch = node.key?.toLowerCase().includes(q) ||
    node.displayValue?.toLowerCase().includes(q) ||
    (node.fullValue?.toLowerCase() || '').includes(q);
  return { isMatch };
}

function updateSearchMatches() {
  if (!searchQuery.value.trim()) {
    searchMatchCount.value = 0;
    searchMatchIndex.value = 0;
    return;
  }
  const q = searchQuery.value.toLowerCase();
  const matches = visibleNodes.value.filter(node =>
    node.key?.toLowerCase().includes(q) ||
    node.displayValue?.toLowerCase().includes(q) ||
    (node.fullValue?.toLowerCase() || '').includes(q)
  );
  searchMatchCount.value = matches.length;
  if (searchMatchIndex.value > matches.length) {
    searchMatchIndex.value = matches.length > 0 ? 1 : 0;
  }
}

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

async function saveFile(fileData) {
  if (!db) return;
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  const allFiles = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const totalSize = allFiles.reduce((sum, f) => sum + (f.size || 0), 0);
  if (totalSize > 500 * 1024 * 1024) {
    const sorted = allFiles.sort((a, b) => (a.lastOpen || 0) - (b.lastOpen || 0));
    const toRemove = sorted.slice(0, Math.ceil(sorted.length / 2));
    const delTransaction = db.transaction(storeName, 'readwrite');
    const delStore = delTransaction.objectStore(storeName);
    toRemove.forEach(f => delStore.delete(f.id));
  }
  const newFile = {
    id: fileData.id,
    name: fileData.name,
    content: fileData.content,
    size: fileData.size,
    lastOpen: Date.now()
  };
  store.put(newFile);
}

async function loadFiles() {
  if (!db) return [];
  const transaction = db.transaction(storeName, 'readonly');
  const store = transaction.objectStore(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const allFiles = req.result || [];
      const validFiles = [];
      for (const file of allFiles) {
        try {
          if (file && file.content && typeof file.content === 'string') {
            if (file.size < 1024 * 1024) {
              JSON.parse(file.content);
            }
            validFiles.push(file);
          }
        } catch (e) {
          console.warn('Skip invalid cache file:', file?.name || 'unknown');
        }
      }
      validFiles.sort((a, b) => (b.lastOpen || 0) - (a.lastOpen || 0));
      resolve(validFiles);
    };
    req.onerror = () => reject(req.error);
  });
}

async function clearCache() {
  if (!db) return;
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  store.clear();
  files.value = [];
  currentFileId.value = null;
  jsonTree.value = null;
  visibleNodes.value = [];
  totalNodes.value = 0;
}

async function deleteFileFromCache(fileId) {
  if (!db) return;
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  store.delete(fileId);
  files.value = files.value.filter(f => f.id !== fileId);
  if (currentFileId.value === fileId) {
    currentFileId.value = files.value.length > 0 ? files.value[0].id : null;
    if (currentFileId.value) {
      const file = files.value.find(f => f.id === currentFileId.value);
      if (file) parseJSONContent(file.content, file.size);
    } else {
      jsonTree.value = null;
      visibleNodes.value = [];
      totalNodes.value = 0;
    }
  }
}

let syncNodeIdCounter = 0;

function createNodeSync(key, value, parentPath = '') {
  const id = ++syncNodeIdCounter;
  const path = parentPath ? (Array.isArray(parentPath) ? parentPath : [parentPath]) : [];
  if (key !== undefined) path.push(key);
  
  const isRoot = key === undefined;
  
  const displayPath = (function() {
    let result = [];
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      if (typeof p !== 'number') {
        result.push(p);
      }
    }
    const lastElement = path[path.length - 1];
    if (typeof lastElement === 'number') {
      if (result.length === 0) {
        result.push('[' + lastElement + ']');
      } else {
        result[result.length - 1] += '[' + lastElement + ']';
      }
    }
    return result.join('.');
  })();
  
  const node = {
    id,
    key,
    path: [...path],
    pathStr: path.length > 0 ? displayPath : 'root',
    collapsed: !isRoot && path.length < 2,
    isRoot
  };

  if (value === null) {
    node.type = 'null';
    node.displayValue = 'null';
  } else if (typeof value === 'boolean') {
    node.type = 'boolean';
    node.displayValue = String(value);
  } else if (typeof value === 'number') {
    node.type = 'number';
    node.displayValue = String(value);
  } else if (typeof value === 'string') {
    node.type = 'string';
    node.displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
    node.fullValue = value;
  } else if (Array.isArray(value)) {
    node.type = 'array';
    node.children = [];
    node.childCount = value.length;
    node._rawValue = value;
    node._isLazy = true;
    node._maxChildren = 1000;
  } else if (typeof value === 'object') {
    node.type = 'object';
    node.children = [];
    node.childCount = Object.keys(value).length;
    node._rawValue = value;
    node._isLazy = true;
    node._maxChildren = 1000;
  } else {
    node.type = 'unknown';
    node.displayValue = String(value);
  }

  return node;
}

function ensureChildrenSync(node) {
  if (!node._isLazy || !node._rawValue) return;
  const maxChildren = node._maxChildren || Infinity;
  if (Array.isArray(node._rawValue)) {
    const items = node._rawValue.slice(0, maxChildren);
    node.children = items.map((item, index) => {
      const child = createNodeSync('[' + index + ']', item, node.path);
      return child;
    });
    if (node._rawValue.length > maxChildren) {
      node._remaining = node._rawValue.length - maxChildren;
    }
  } else if (typeof node._rawValue === 'object') {
    const entries = Object.entries(node._rawValue).slice(0, maxChildren);
    node.children = entries.map(([k, v]) => {
      const child = createNodeSync(k, v, node.path);
      return child;
    });
    if (Object.keys(node._rawValue).length > maxChildren) {
      node._remaining = Object.keys(node._rawValue).length - maxChildren;
    }
  }
  node._isLazy = false;
  node._rawValue = null;
}

function flattenTreeSyncOptimized(node, depth = 0) {
  const result = [];
  if (!node) return result;
  
  const stack = [{ node, depth }];
  
  while (stack.length > 0) {
    const { node: n, depth: d } = stack.pop();
    
    if (!n) continue;
    
    if (!n.collapsed) {
      ensureChildrenSync(n);
    }
    
    result.push(n);
    
    if (!n.collapsed && n.children) {
      for (let i = n.children.length - 1; i >= 0; i--) {
        if (n.children[i]) {
          stack.push({ node: n.children[i], depth: d + 1 });
        }
      }
    }
  }
  
  return result;
}

function countNodesSync(node) {
  let count = 1;
  if (node._isLazy && node._rawValue) {
    if (Array.isArray(node._rawValue)) {
      count += node._rawValue.length;
    } else if (typeof node._rawValue === 'object') {
      count += Object.keys(node._rawValue).length;
    }
  } else if (node.children) {
    for (const child of node.children) {
      count += countNodesSync(child);
    }
  }
  return count;
}

function getParseErrorInfo(err, content) {
  let message = 'JSON 解析失败';
  if (err instanceof SyntaxError) {
    const match = err.message.match(/position (\d+)/);
    if (match) {
      const position = parseInt(match[1]);
      const contextStart = Math.max(0, position - 50);
      const contextEnd = Math.min(content.length, position + 50);
      const context = content.substring(contextStart, contextEnd);
      message = 'JSON 语法错误\n位置: 第 ' + position + ' 字节\n附近内容: "' + context + '"\n\n' + err.message;
      if (content.charCodeAt(0) === 0xFEFF) {
        message += '\n\n检测到文件开头有 BOM 字符，已尝试移除';
      }
    } else {
      message = 'JSON 语法错误: ' + err.message;
    }
  } else {
    message = '解析失败: ' + err.message;
  }
  return { message, type: 'syntax' };
}

const MAX_TOTAL_NODES = 10000000;

function parseAndCreateOptimized(content) {
  let cleanContent = content;
  if (cleanContent.charCodeAt(0) === 0xFEFF) {
    cleanContent = cleanContent.substring(1);
  }
  
  const data = JSON.parse(cleanContent);
  
  let totalCount = 0;
  let idCounter = 0;
  
  const flatNodes = [];
  const treeStack = [];
  
  let rootNode = null;
  
  treeStack.push({ v: data, k: undefined, d: 0, r: true, p: null });
  
  while (treeStack.length > 0) {
    const item = treeStack.pop();
    const v = item.v;
    const k = item.k;
    const d = item.d;
    const r = item.r;
    const parent = item.p;
    
    totalCount++;
    
    if (totalCount > MAX_TOTAL_NODES) {
      return { 
        flatNodes: [], 
        totalCount, 
        error: `文件过大，包含约 ${totalCount.toLocaleString()} 个节点，超过支持的最大节点数 ${MAX_TOTAL_NODES.toLocaleString()}` 
      };
    }
    
    const id = ++idCounter;
    
    let node;
    const t = typeof v;
    
    if (v === null) {
      node = { id, k, type: 0, dv: 'null', d, r, c: false, children: [] };
    } else if (t === 'boolean') {
      node = { id, k, type: 1, dv: v ? 'true' : 'false', d, r, c: false, children: [] };
    } else if (t === 'number') {
      node = { id, k, type: 2, dv: String(v), d, r, c: false, children: [] };
    } else if (t === 'string') {
      const len = v.length;
      node = { 
        id, k, type: 3, 
        dv: len > 200 ? v.substring(0, 200) + '...' : v,
        fv: v, d, r, c: false, children: [] 
      };
    } else if (Array.isArray(v)) {
      const childCount = v.length;
      const isCollapsed = false;
      node = { id, k, type: 4, cc: childCount, rv: v, il: true, d, r, c: isCollapsed, children: [] };
      
      if (!isCollapsed && childCount > 0) {
        for (let i = childCount - 1; i >= 0; i--) {
          treeStack.push({ v: v[i], k: i, d: d + 1, r: false, p: node });
        }
      }
    } else if (t === 'object') {
      const keys = Object.keys(v);
      const childCount = keys.length;
      const isCollapsed = false;
      node = { id, k, type: 5, cc: childCount, rv: v, il: true, d, r, c: isCollapsed, children: [] };
      
      if (!isCollapsed && childCount > 0) {
        for (let i = childCount - 1; i >= 0; i--) {
          treeStack.push({ v: v[keys[i]], k: keys[i], d: d + 1, r: false, p: node });
        }
      }
    } else {
      node = { id, k, type: 6, dv: String(v), d, r, c: false, children: [] };
    }
    
    if (parent) {
      parent.children.push(node);
    } else {
      rootNode = node;
    }
    
    flatNodes.push(node);
  }
  
  return { flatNodes, totalCount, rootNode };
}

function normalizeNodes(nodes) {
  const typeMap = ['null', 'boolean', 'number', 'string', 'array', 'object', 'unknown'];
  
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    node.key = node.k;
    node.type = typeMap[node.type];
    node.displayValue = node.dv;
    node.fullValue = node.fv;
    node.childCount = node.cc;
    node._rawValue = node.rv;
    node._isLazy = node.il;
    node.depth = node.d;
    node.isRoot = node.r;
    node.collapsed = node.c;
    
    delete node.k;
    delete node.dv;
    delete node.fv;
    delete node.cc;
    delete node.rv;
    delete node.il;
    delete node.d;
    delete node.r;
    delete node.c;
  }
  
  return nodes;
}

// ============================================
// 设计原则：大文件永远展开所有节点
// ============================================
// 1. 大文件打开时必须确保所有节点都展开
// 2. 任何修改都必须在此基础上进行，不能改变这个行为
// 3. 小文件（<=10000节点）：同步展开所有节点
// 4. 大文件（>10000节点）：先展开第一层保证快速响应，再通过Worker异步展开所有节点
// ============================================
function fallbackParse(content, size, startTime, fileId = null) {
  try {
    // ============================================
    // 设置解析中标志，防止切换文件
    // ============================================
    isParsing.value = true;
    isUsingWorker.value = false;
    if (!content || content.trim() === '') {
      throw new Error('空内容');
    }
    
    const result = parseAndCreateOptimized(content);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    const { flatNodes, totalCount, rootNode } = result;
    
    normalizeNodes(flatNodes);
    
    const warning = '';
    
    jsonTree.value = rootNode;
    
    let currentNodes;
    
    // ============================================
    // 设计原则：大文件永远展开所有节点
    // ============================================
    // 注意：以下代码确保所有节点都被展开，totalNodes 必须等于展开后的节点数
    //       任何修改都不能改变这个行为！
    // ============================================
    
    if (totalCount <= 10000) {
      // 小文件：同步展开所有节点
      function expandAllSync(node) {
        if (!node) return;
        node.collapsed = false;
        const originalMaxChildren = node._maxChildren;
        node._maxChildren = Infinity;
        ensureChildrenSync(node);
        node._maxChildren = originalMaxChildren;
        if (node.children) node.children.forEach(expandAllSync);
      }
      expandAllSync(rootNode);
      
      currentNodes = flattenTreeSyncOptimized(rootNode);
      visibleNodes.value = markRaw(currentNodes);
      warningMessage.value = warning;
      // 重要：totalNodes 必须等于展开后的节点数
      totalNodes.value = currentNodes.length;
      // ============================================
      // 重置解析中标志，允许切换文件
      // ============================================
      isParsing.value = false;
    } else {
      // 大文件：使用Worker在后台展开所有节点
      if (worker) {
        isUsingWorker.value = true;
        parseStatus.value = 'parsing';
        // ============================================
        // 设置解析中标志，防止切换文件
        // ============================================
        isParsing.value = true;
        // 清空状态，等待Worker结果
        visibleNodes.value = [];
        totalNodes.value = 0;
        
        worker.postMessage({ type: 'parseAndExpandAll', data: content });
        currentNodes = [];
      } else {
        // 没有Worker时的降级方案：同步展开
        function expandAllSync(node) {
          if (!node) return;
          node.collapsed = false;
          const originalMaxChildren = node._maxChildren;
          node._maxChildren = Infinity;
          ensureChildrenSync(node);
          node._maxChildren = originalMaxChildren;
          if (node.children) node.children.forEach(expandAllSync);
        }
        expandAllSync(rootNode);
        
        currentNodes = flattenTreeSyncOptimized(rootNode);
        visibleNodes.value = markRaw(currentNodes);
        warningMessage.value = warning;
        // 重要：totalNodes 必须等于展开后的节点数
        totalNodes.value = currentNodes.length;
        // ============================================
        // 重置解析中标志，允许切换文件
        // ============================================
        isParsing.value = false;
      }
    }
    parseTime.value = Date.now() - startTime;
    parseStatus.value = '';
    
    // ============================================
    // 重要：只在同步解析完成且有数据时才缓存
    // Worker处理的大文件由Worker消息处理逻辑负责缓存
    // ============================================
    if (fileId && currentNodes && currentNodes.length > 0) {
      parseCache.set(fileId, {
        visibleNodes: currentNodes,
        jsonTree: rootNode,
        totalNodes: currentNodes.length,
        warningMessage: warning
      });
    }
  } catch (e) {
      const errorInfo = getParseErrorInfo(e, content);
      errorMessage.value = errorInfo.message;
      parseStatus.value = 'error';
      // ============================================
      // 重置解析中标志，允许切换文件
      // ============================================
      isParsing.value = false;
    }
  }

function estimateNodeCount(obj, count = 0) {
  if (count > MAX_TOTAL_NODES * 2) return count;
  if (obj === null || typeof obj !== 'object') return count + 1;
  
  count++;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      count = estimateNodeCount(item, count);
      if (count > MAX_TOTAL_NODES * 2) break;
    }
  } else {
    for (const key of Object.keys(obj)) {
      count = estimateNodeCount(obj[key], count);
      if (count > MAX_TOTAL_NODES * 2) break;
    }
  }
  return count;
}

function initWorker() {
  worker = new Worker(workerUrl);
  worker.onmessage = (e) => {
    const { type, visibleNodes: nodes, totalNodes: cnt, parseTime: pt, tree, message, truncated } = e.data;
    if (type === 'parsed' || type === 'toggled' || type === 'updated') {
      visibleNodes.value = nodes;
      // ============================================
      // 重要：totalNodes 必须等于展开后的节点数（nodes.length）
      //       任何修改都不能改变这个行为！
      // ============================================
      totalNodes.value = nodes.length;
      if (pt) parseTime.value = pt;
      if (tree) jsonTree.value = tree;
      warningMessage.value = '';
      parseStatus.value = '';
      // ============================================
      // 重置解析中标志，允许切换文件
      // ============================================
      isParsing.value = false;
      
      // ============================================
      // Worker处理完成后缓存结果
      // ============================================
      if (currentFileId.value && nodes && nodes.length > 0) {
        parseCache.set(currentFileId.value, {
          visibleNodes: nodes,
          jsonTree: tree || jsonTree.value,
          totalNodes: nodes.length,
          warningMessage: ''
        });
      }
    } else if (type === 'error') {
      errorMessage.value = message;
      parseStatus.value = 'error';
      // ============================================
      // 重置解析中标志，允许切换文件
      // ============================================
      isParsing.value = false;
    }
  };
  worker.onerror = (err) => {
    errorMessage.value = err.message;
    parseStatus.value = 'error';
    // ============================================
    // 重置解析中标志，允许切换文件
    // ============================================
    isParsing.value = false;
  };
}

function parseJSONContent(content, size, fileId = null) {
  try {
    fileSize.value = size;
    isLargeFileMode.value = size > 50 * 1024 * 1024;
    parseStatus.value = 'parsing';
    errorMessage.value = '';
    const parseStartTime = Date.now();
    if (worker && size <= 50 * 1024 * 1024) {
      isUsingWorker.value = true;
      const timeout = setTimeout(() => {
        isUsingWorker.value = false;
        errorMessage.value = '解析超时，正在尝试备用方案...';
        fallbackParse(content, size, parseStartTime, fileId);
      }, 30000);
      const handleMessage = (e) => {
        clearTimeout(timeout);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        try {
          const { type, visibleNodes: nodes, totalNodes: cnt, parseTime: pt, message: msg } = e.data;
          if (type === 'parsed' || type === 'toggled' || type === 'updated') {
            visibleNodes.value = nodes;
            // ============================================
            // 重要：totalNodes 必须等于展开后的节点数
            //       使用 nodes.length 而不是 cnt，确保节点数显示正确！
            // ============================================
            totalNodes.value = nodes.length;
            if (pt) parseTime.value = pt;
            parseStatus.value = '';
            if (fileId) {
              parseCache.set(fileId, {
                visibleNodes: nodes,
                jsonTree: null,
                totalNodes: nodes.length,
                warningMessage: ''
              });
            }
          } else if (type === 'error') {
            isUsingWorker.value = false;
            errorMessage.value = msg;
            parseStatus.value = 'error';
            fallbackParse(content, size, parseStartTime, fileId);
          }
        } catch (err) {
          isUsingWorker.value = false;
          errorMessage.value = '响应处理失败: ' + err.message;
          parseStatus.value = 'error';
        }
      };
      const handleError = (err) => {
        isUsingWorker.value = false;
        clearTimeout(timeout);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        errorMessage.value = 'Worker错误: ' + err.message;
        parseStatus.value = 'error';
        fallbackParse(content, size, parseStartTime, fileId);
      };
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError);
      try {
        worker.postMessage({ type: 'parse', data: content });
      } catch (err) {
        isUsingWorker.value = false;
        clearTimeout(timeout);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        errorMessage.value = 'Worker发送失败: ' + err.message;
        fallbackParse(content, size, parseStartTime, fileId);
      }
    } else {
      isUsingWorker.value = false;
      fallbackParse(content, size, parseStartTime, fileId);
    }
  } catch (err) {
    isUsingWorker.value = false;
    errorMessage.value = '解析初始化失败: ' + err.message;
    parseStatus.value = 'error';
    console.error('Parse init error:', err);
  }
}

async function handleFileSelect(e) {
  await handleOpenFiles(Array.from(e.target.files));
  e.target.value = '';
}

async function handleOpenFiles(fileList) {
  if (!fileList || fileList.length === 0) {
    fileInputRef.value?.click();
    return;
  }
  let lastFileId = null;
  for (const file of fileList) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') continue;
    const content = await file.text();
    const size = new Blob([content]).size;
    const fileData = {
      id: Date.now() + Math.random(),
      name: file.name,
      content: content,
      size: size
    };
    files.value.push(fileData);
    await saveFile(fileData);
    lastFileId = fileData.id;
  }
  if (lastFileId) {
    selectFile(lastFileId);
  }
}

async function handlePasteContent(text) {
  // 尝试解析并格式化JSON
  let formattedContent = text;
  try {
    const parsed = JSON.parse(text);
    formattedContent = JSON.stringify(parsed, null, 2);
  } catch (e) {
    console.warn('Pasted content is not valid JSON, keeping as-is');
  }
  
  const fileData = {
    id: Date.now() + Math.random(),
    name: 'pasted-' + new Date().toISOString().slice(0, 10) + '.json',
    content: formattedContent,
    size: new Blob([formattedContent]).size
  };
  files.value.push(fileData);
  await saveFile(fileData);
  selectFile(fileData.id);
}

const parseCache = new Map();
let pendingParseTask = null;

function selectFile(fileId) {
  currentFileId.value = fileId;
  const file = files.value.find(f => f.id === fileId);
  if (file) {
    file.lastOpen = Date.now();
    
    if (pendingParseTask) {
      clearTimeout(pendingParseTask);
      pendingParseTask = null;
    }
    
    if (worker) {
      try {
        worker.terminate();
        worker = null;
        initWorker();
      } catch (e) {
        console.warn('Failed to restart worker:', e);
      }
    }
    
    if (parseCache.has(fileId)) {
      const cached = parseCache.get(fileId);
      
      visibleNodes.value = [];
      totalNodes.value = 0;
      
      requestAnimationFrame(() => {
        visibleNodes.value = markRaw(cached.visibleNodes);
        jsonTree.value = cached.jsonTree;
        // ============================================
        // 重要：totalNodes 必须等于展开后的节点数
        //       任何修改都不能改变这个行为！
        // ============================================
        totalNodes.value = cached.visibleNodes.length;
        warningMessage.value = cached.warningMessage;
        parseStatus.value = '';
      });
      return;
    }
    
    visibleNodes.value = [];
    jsonTree.value = null;
    errorMessage.value = '';
    warningMessage.value = '';
    totalNodes.value = 0;
    parseStatus.value = 'parsing';
    
    pendingParseTask = setTimeout(() => {
      parseJSONContent(file.content, file.size, fileId);
      pendingParseTask = null;
    }, 50);
  }
}

function handleDragOver(e) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave(e) {
  e.preventDefault();
  isDragging.value = false;
}

async function handleDrop(e) {
  e.preventDefault();
  isDragging.value = false;
  await handleOpenFiles(Array.from(e.dataTransfer.files));
}

let toggleDebounceTimeout = null;

function toggleNode(nodeId) {
  if (isUsingWorker.value && worker) {
    worker.postMessage({ type: 'toggle', nodeId });
  } else {
    if (!jsonTree.value) return;
    
    clearTimeout(toggleDebounceTimeout);
    
    toggleDebounceTimeout = setTimeout(() => {
      const nodeRefs = new Map();
      function findNode(n) {
        nodeRefs.set(n.id, n);
        if (n.id === nodeId) {
          return n;
        }
        if (!n.collapsed && n.children) {
          for (const child of n.children) {
            const found = findNode(child);
            if (found) return found;
          }
        }
        return null;
      }
      
      const targetNode = findNode(jsonTree.value);
      if (!targetNode) return;
      
      const wasCollapsed = targetNode.collapsed;
      targetNode.collapsed = !targetNode.collapsed;
      
      if (!targetNode.collapsed) {
        ensureChildrenSync(targetNode);
      }
      
      const newVisible = flattenTreeSyncOptimized(jsonTree.value);
      visibleNodes.value = markRaw(newVisible);
    }, 0);
  }
}

function expandAll() {
  if (isUsingWorker.value && worker) {
    worker.postMessage({ type: 'expandAll' });
  } else {
    if (!jsonTree.value) return;
    function expand(node) {
      if (!node) return;
      node.collapsed = false;
      const originalMaxChildren = node._maxChildren;
      node._maxChildren = Infinity;
      ensureChildrenSync(node);
      node._maxChildren = originalMaxChildren;
      if (node.children) node.children.forEach(expand);
    }
    expand(jsonTree.value);
    visibleNodes.value = flattenTreeSync(jsonTree.value);
  }
}

function expandAllInChunks(node, depth = 0) {
  if (!node) return;
  
  if (node.collapsed === false && node.children && node.children.length > 0) {
    const chunkSize = 100;
    let index = 0;
    
    function processChunk() {
      const end = Math.min(index + chunkSize, node.children.length);
      for (let i = index; i < end; i++) {
        expandAllInChunks(node.children[i], depth + 1);
      }
      index = end;
      
      if (index < node.children.length) {
        if (depth < 3) {
          setTimeout(processChunk, 0);
        } else {
          requestAnimationFrame(processChunk);
        }
      } else if (depth === 0) {
        visibleNodes.value = markRaw(flattenTreeSyncOptimized(jsonTree.value));
      }
    }
    
    processChunk();
    return;
  }
  
  node.collapsed = false;
  
  const originalMaxChildren = node._maxChildren;
  node._maxChildren = Infinity;
  ensureChildrenSync(node);
  node._maxChildren = originalMaxChildren;
  
  if (node.children && node.children.length > 0) {
    const chunkSize = 100;
    let index = 0;
    
    function processChunk() {
      const end = Math.min(index + chunkSize, node.children.length);
      for (let i = index; i < end; i++) {
        expandAllInChunks(node.children[i], depth + 1);
      }
      index = end;
      
      if (index < node.children.length) {
        if (depth < 3) {
          setTimeout(processChunk, 0);
        } else {
          requestAnimationFrame(processChunk);
        }
      } else if (depth === 0) {
        visibleNodes.value = markRaw(flattenTreeSyncOptimized(jsonTree.value));
      }
    }
    
    processChunk();
  } else if (depth === 0) {
    visibleNodes.value = markRaw(flattenTreeSyncOptimized(jsonTree.value));
  }
}

function collapseAll() {
  if (isUsingWorker.value && worker) {
    worker.postMessage({ type: 'collapseAll' });
  } else {
    if (!jsonTree.value) return;
    function collapse(node) {
      node.collapsed = true;
      if (node.children) node.children.forEach(collapse);
    }
    collapse(jsonTree.value);
    visibleNodes.value = flattenTreeSync(jsonTree.value);
  }
}

function handleScroll(e) {
}

function toggleFormatCompress() {
  if (!currentFile.value) return;
  
  if (isTextMode.value) {
    try {
      const parsed = JSON.parse(textContent.value);
      const formatted = JSON.stringify(parsed, null, 2);
      textContent.value = formatted;
      updateCurrentFile(formatted);
      errorMessage.value = '';
      isTextMode.value = false;
    } catch (e) {
      errorMessage.value = 'JSON格式错误: ' + e.message;
      parseStatus.value = 'error';
    }
  } else {
    try {
      const parsed = JSON.parse(currentFile.value.content);
      const compressed = JSON.stringify(parsed);
      textContent.value = compressed;
      isTextMode.value = true;
    } catch (e) {
      errorMessage.value = '压缩失败: ' + e.message;
      parseStatus.value = 'error';
    }
  }
}

function formatJSON() {
  if (!currentFile.value) return;
  try {
    const parsed = JSON.parse(currentFile.value.content);
    const formatted = JSON.stringify(parsed, null, 2);
    updateCurrentFile(formatted);
    isEscaped.value = false;
    errorMessage.value = '';
  } catch (e) {
    errorMessage.value = '格式化失败: ' + e.message;
    parseStatus.value = 'error';
  }
}

function compressJSON() {
  if (!currentFile.value) return;
  try {
    const parsed = JSON.parse(currentFile.value.content);
    const compressed = JSON.stringify(parsed);
    updateCurrentFile(compressed);
    isEscaped.value = false;
    errorMessage.value = '';
  } catch (e) {
    errorMessage.value = '压缩失败: ' + e.message;
    parseStatus.value = 'error';
  }
}

function toggleEscape() {
  if (!currentFile.value) return;
  try {
    const content = currentFile.value.content;
    let newContent;
    
    if (isEscaped.value) {
      const unescapedStr = JSON.parse(content);
      try {
        const parsed = JSON.parse(unescapedStr);
        newContent = JSON.stringify(parsed, null, 2);
      } catch {
        newContent = unescapedStr;
      }
      isEscaped.value = false;
      errorMessage.value = '反转义完成';
    } else {
      const parsed = JSON.parse(content);
      newContent = JSON.stringify(JSON.stringify(parsed));
      isEscaped.value = true;
      errorMessage.value = '转义完成';
    }
    
    updateCurrentFile(newContent);
  } catch (e) {
    errorMessage.value = '转义/反转义失败: ' + e.message;
  }
}

function updateCurrentFile(content) {
  const file = files.value.find(f => f.id === currentFileId.value);
  if (file) {
    file.content = content;
    file.size = new Blob([content]).size;
    saveFile(file);
    parseJSONContent(file.content, file.size);
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
}

function copyPath(node) {
  let pathStr = '';
  if (node.path.length === 0) {
    pathStr = 'root';
  } else {
    pathStr = 'root.' + node.path.map(p => {
      if (typeof p === 'number' || p.match(/^\[\d+\]$/)) return p;
      return p.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/) ? p : '"' + p + '"';
    }).join('.');
  }
  copyToClipboard(pathStr);
}

function exportJSON() {
  if (!currentFile.value) return;
  const blob = new Blob([currentFile.value.content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFile.value.name.replace('.json', '') + '_formatted.json';
  a.click();
  URL.revokeObjectURL(url);
}

function handleKeydown(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    exportJSON();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
    e.preventDefault();
    showCommandPalette.value = !showCommandPalette.value;
  }
}

async function handlePasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      await handlePasteContent(text.trim());
    }
  } catch (err) {
    console.error('Failed to read clipboard:', err);
  }
}

function handlePasteEvent(e) {
  e.preventDefault();
  
  // 优先检查是否粘贴了文件
  const files = e.clipboardData?.files;
  if (files && files.length > 0) {
    const jsonFiles = Array.from(files).filter(file => 
      file.name.endsWith('.json') || file.type === 'application/json'
    );
    if (jsonFiles.length > 0) {
      handleOpenFiles(jsonFiles);
      return;
    }
  }
  
  // 否则尝试粘贴文本内容
  const text = e.clipboardData?.getData('text');
  if (text && text.trim()) {
    handlePasteContent(text.trim());
  }
}

function handleSelectNode(node) {
  selectedNode.value = node;
  showDetailPanel.value = true;
}

function handleUpdateValue(newValue) {
  if (!selectedNode.value || !currentFile.value) return;
  try {
    let content = currentFile.value.content;
    const path = selectedNode.value.path;
    if (path.length === 0) {
      let newVal;
      if (selectedNode.value.type === 'number') {
        newVal = parseFloat(newValue);
      } else if (selectedNode.value.type === 'boolean') {
        newVal = newValue === 'true';
      } else {
        newVal = newValue;
      }
      const parsed = JSON.parse(content);
      const newContent = JSON.stringify(newVal, null, 2);
      updateCurrentFile(newContent);
    } else {
      const parsed = JSON.parse(content);
      let obj = parsed;
      for (let i = 0; i < path.length - 1; i++) {
        obj = obj[path[i]];
      }
      const lastKey = path[path.length - 1];
      if (selectedNode.value.type === 'number') {
        obj[lastKey] = parseFloat(newValue);
      } else if (selectedNode.value.type === 'boolean') {
        obj[lastKey] = newValue === 'true';
      } else {
        obj[lastKey] = newValue;
      }
      updateCurrentFile(JSON.stringify(parsed, null, 2));
    }
    showDetailPanel.value = false;
    selectedNode.value = null;
  } catch (e) {
    errorMessage.value = '更新失败: ' + e.message;
  }
}

function handleSearch(query) {
  searchQuery.value = query;
  updateSearchMatches();
}

function handleSearchNext() {
  if (searchMatchCount.value > 0) {
    searchMatchIndex.value = searchMatchIndex.value >= searchMatchCount.value ? 1 : searchMatchIndex.value + 1;
  }
}

function handleSearchPrev() {
  if (searchMatchCount.value > 0) {
    searchMatchIndex.value = searchMatchIndex.value <= 1 ? searchMatchCount.value : searchMatchIndex.value - 1;
  }
}

function toggleTheme() {
  if (currentTheme.value === 'light') {
    currentTheme.value = 'dark';
    document.documentElement.removeAttribute('data-theme');
  } else {
    currentTheme.value = 'light';
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

onMounted(async () => {
  if (currentTheme.value === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  initWorker();
  await initDB();
  const cached = await loadFiles();
  if (cached.length > 0) {
    files.value = cached;
    const firstFile = cached[0];
    if (firstFile.size < 10 * 1024 * 1024) {
      selectFile(firstFile.id);
    }
  } else {
    const sampleFile = {
      id: 'sample',
      name: '示例数据.json',
      content: JSON.stringify(SAMPLE_JSON, null, 2),
      size: new Blob([JSON.stringify(SAMPLE_JSON)]).size
    };
    files.value = [sampleFile];
    selectFile('sample');
  }
  if (containerRef.value) {
    containerHeight.value = containerRef.value.clientHeight;
  }
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('paste', handlePasteEvent);
  window.addEventListener('resize', () => {
    if (containerRef.value) {
      containerHeight.value = containerRef.value.clientHeight;
    }
  });
});

onUnmounted(() => {
  if (worker) {
    worker.terminate();
    URL.revokeObjectURL(workerUrl);
  }
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('paste', handlePasteEvent);
});
</script>

<template>
  <div class="app" @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop">
    <input
      ref="fileInputRef"
      type="file"
      accept=".json,application/json"
      multiple
      style="display: none;"
      @change="handleFileSelect"
    />
    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-message">释放文件以打开</div>
    </div>

    <header class="title-bar">
      <div class="title-left">
        <LogoIcon :size="20" class="logo-icon"/>
        <span class="logo-text">JSON<span class="logo-pro">Pro</span></span>
        <span class="title-separator">|</span>
        <span class="doc-title" v-if="currentFile">{{ currentFile.name }}</span>
      </div>
      <div class="title-center">
        <button class="action-btn" @click="toggleFormatCompress">
          <FormatIcon :size="14" class="btn-icon"/>
          <span>{{ isTextMode ? '格式化' : '压缩' }}</span>
        </button>
        <button class="action-btn" @click="toggleEscape" :disabled="!currentFile">
          <EscapeIcon :size="14" class="btn-icon"/>
          <span>{{ isEscaped ? '反转义' : '转义' }}</span>
        </button>
        <button class="action-btn" @click="exportJSON" :disabled="!currentFile">
          <SaveIcon :size="14" class="btn-icon"/>
          <span>导出</span>
        </button>
      </div>
      <div class="title-right">
        <button class="icon-btn" title="切换主题" @click="toggleTheme">
          <ThemeIcon :size="16" class="btn-icon"/>
        </button>
        <button class="icon-btn" title="更多" @click="showCommandPalette = true">
          <MoreIcon :size="16" class="btn-icon"/>
        </button>
      </div>
    </header>

    <div class="main-content">
      <SideBar
        :files="files"
        :currentFileId="currentFileId"
        @selectFile="selectFile"
        @deleteFile="deleteFileFromCache"
        @openFiles="handleOpenFiles"
        @clearCache="clearCache"
        @expandAll="expandAll"
        @collapseAll="collapseAll"
      />

      <main class="editor-area">
        <EditorTabs
          :files="files"
          :currentFileId="currentFileId"
          @selectTab="selectFile"
          @closeTab="deleteFileFromCache"
        />
        <JsonTreeView
          v-show="!isTextMode"
          ref="containerRef"
          :visibleNodes="filteredVisibleNodes"
          :totalNodes="totalNodes"
          :searchQuery="searchQuery"
          :currentFile="currentFile"
          :parseStatus="parseStatus"
          :errorMessage="errorMessage"
          :searchMatchIndex="searchMatchIndex"
          :searchMatchCount="searchMatchCount"
          @toggleNode="toggleNode"
          @scroll="handleScroll"
          @selectNode="handleSelectNode"
          @copyPath="copyPath"
          @search="handleSearch"
          @searchNext="handleSearchNext"
          @searchPrev="handleSearchPrev"
          @pasteContent="handlePasteContent"
          @openFiles="handleOpenFiles"
        />
        <div v-show="isTextMode" class="text-view">
          <textarea 
            class="text-content" 
            v-model="textContent"
            spellcheck="false"
          ></textarea>
        </div>
      </main>

      <DetailPanel
        v-if="showDetailPanel"
        :node="selectedNode"
        :visible="showDetailPanel"
        @close="showDetailPanel = false"
        @updateValue="handleUpdateValue"
      />
    </div>

    <StatusBar
      :fileSize="fileSize"
      :totalNodes="totalNodes"
      :parseTime="parseTime"
    />

    <CommandPalette
      :visible="showCommandPalette"
      @close="showCommandPalette = false"
      @openFiles="handleOpenFiles"
      @saveFile="exportJSON"
      @format="formatJSON"
      @escape="toggleEscape"
      @toggleTheme="toggleTheme"
      @search="handleSearch"
    />
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
}

.title-bar {
  height: 40px;
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  position: relative;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.logo-icon {
  color: #007acc;
}

.logo-text {
  font-size: 14px;
  font-weight: 600;
  color: #333333;
}

.logo-pro {
  color: #007acc;
}

.title-separator {
  color: #e5e5e5;
  margin: 0 4px;
}

.doc-title {
  font-size: 13px;
  color: #6e6e6e;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title-center {
  display: flex;
  align-items: center;
  gap: 4px;
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  background: transparent;
  color: #6e6e6e;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 150ms;
}

.action-btn:hover:not(:disabled) {
  background: #f0f0f0;
  color: #333333;
}

.action-btn:active:not(:disabled) {
  background: #e5e5e5;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.title-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6e6e6e;
  border-radius: 4px;
  cursor: pointer;
}

.icon-btn:hover {
  background: #f0f0f0;
  color: #333333;
}

.title-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.drag-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.drag-message {
  font-size: 24px;
  color: var(--accent);
  padding: 40px 60px;
  border: 2px dashed var(--accent);
  border-radius: 12px;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: calc(100vh - var(--titlebar-height, 40px) - var(--statusbar-height, 28px));
}

.text-view {
  flex: 1;
  display: flex;
  min-height: 0;
  background: var(--bg);
}

.text-content {
  flex: 1;
  margin: 0;
  padding: 16px;
  border: none;
  outline: none;
  resize: none;
  background: var(--bg);
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-primary);
  box-sizing: border-box;
  white-space: pre;
  overflow: auto;
}
</style>
