<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import '@/assets/vscode.css';
import SideBar from '@/components/SideBar.vue';
import EditorTabs from '@/components/EditorTabs.vue';
import JsonTreeView from '@/components/JsonTreeView.vue';
import StatusBar from '@/components/StatusBar.vue';
import DetailPanel from '@/components/DetailPanel.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import LogoIcon from '@/components/icons/LogoIcon.vue';

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
  const node = {
    id,
    key,
    path: [...path],
    pathStr: path.length > 0 ? (Array.isArray(path) ? path.join('.') : path) : 'root',
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
  if (!node.collapsed) {
    ensureChildren(node);
  }
  const nodeCopy = { ...node, depth };
  delete nodeCopy._rawValue;
  visibleNodes.push(nodeCopy);
  if (!node.collapsed && node.children) {
    for (const child of node.children) {
      flattenTree(child, visibleNodes, depth + 1);
    }
  }
  return visibleNodes;
}

function parseJSON(text) {
  nodeIdCounter = 0;
  const data = JSON.parse(text);
  parsedTree = createNode(undefined, data);
  const visibleNodes = flattenTree(parsedTree);
  return {
    visibleNodes,
    totalNodes: countNodes(parsedTree)
  };
}

function countNodes(node) {
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
  node.collapsed = false;
  ensureChildren(node);
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
        self.postMessage({ type: 'parsed', ...result, parseTime, tree: parsedTree });
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
    case 'toggle':
      const toggleResult = toggleNode(nodeId);
      self.postMessage({ type: 'toggled', ...toggleResult, tree: parsedTree });
      break;
    case 'expandAll':
      expandAll();
      self.postMessage({ type: 'updated', visibleNodes: flattenTree(parsedTree), totalNodes: countNodes(parsedTree), tree: parsedTree });
      break;
    case 'collapseAll':
      collapseAll();
      self.postMessage({ type: 'updated', visibleNodes: flattenTree(parsedTree), totalNodes: countNodes(parsedTree), tree: parsedTree });
      break;
  }
};
`;

const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
let worker = null;

const files = ref([]);
const currentFileId = ref(null);
const jsonTree = ref(null);
const visibleNodes = ref([]);
const totalNodes = ref(0);
const parseStatus = ref('');
const errorMessage = ref('');
const fileSize = ref(0);
const parseTime = ref(0);
const isEscaped = ref(false);
const isUsingWorker = ref(true);
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
const currentTheme = ref('dark');

const currentFile = computed(() => files.value.find(f => f.id === currentFileId.value));
const filteredVisibleNodes = computed(() => {
  if (!searchQuery.value.trim()) return visibleNodes.value;
  const q = searchQuery.value.toLowerCase();
  return visibleNodes.value.map(node => ({
    ...node,
    isMatch: node.key?.toLowerCase().includes(q) ||
             node.displayValue?.toLowerCase().includes(q) ||
             (node.fullValue?.toLowerCase() || '').includes(q)
  }));
});

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
            JSON.parse(file.content);
            validFiles.push(file);
          }
        } catch (e) {
          console.warn('Skip invalid cache file:', file?.name || 'unknown');
        }
      }
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
  const node = {
    id,
    key,
    path: [...path],
    pathStr: path.length > 0 ? (Array.isArray(path) ? path.join('.') : path) : 'root',
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

function flattenTreeSync(node, visibleNodesArr = [], depth = 0) {
  if (!node.collapsed) {
    ensureChildrenSync(node);
  }
  const nodeCopy = { ...node, depth };
  delete nodeCopy._rawValue;
  visibleNodesArr.push(nodeCopy);
  if (!node.collapsed && node.children) {
    for (const child of node.children) {
      flattenTreeSync(child, visibleNodesArr, depth + 1);
    }
  }
  return visibleNodesArr;
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

function fallbackParse(content, size, startTime) {
  try {
    isUsingWorker.value = false;
    if (!content || content.trim() === '') {
      throw new Error('空内容');
    }
    let cleanContent = content;
    if (cleanContent.charCodeAt(0) === 0xFEFF) {
      cleanContent = cleanContent.substring(1);
    }
    const data = JSON.parse(cleanContent);
    syncNodeIdCounter = 0;
    const parsedTreeObj = createNodeSync(undefined, data);
    const flatNodes = flattenTreeSync(parsedTreeObj);
    visibleNodes.value = flatNodes;
    jsonTree.value = parsedTreeObj;
    totalNodes.value = countNodesSync(parsedTreeObj);
    parseTime.value = Date.now() - startTime;
    parseStatus.value = '';
  } catch (e) {
    const errorInfo = getParseErrorInfo(e, content);
    errorMessage.value = errorInfo.message;
    parseStatus.value = 'error';
  }
}

function initWorker() {
  worker = new Worker(workerUrl);
  worker.onmessage = (e) => {
    const { type, visibleNodes: nodes, totalNodes: cnt, parseTime: pt, tree, message } = e.data;
    if (type === 'parsed' || type === 'toggled' || type === 'updated') {
      visibleNodes.value = nodes;
      totalNodes.value = cnt;
      if (pt) parseTime.value = pt;
      if (tree) jsonTree.value = tree;
      parseStatus.value = '';
    } else if (type === 'error') {
      errorMessage.value = message;
      parseStatus.value = 'error';
    }
  };
  worker.onerror = (err) => {
    errorMessage.value = err.message;
    parseStatus.value = 'error';
  };
}

function parseJSONContent(content, size) {
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
        fallbackParse(content, size, parseStartTime);
      }, 30000);
      const handleMessage = (e) => {
        clearTimeout(timeout);
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        try {
          const { type, visibleNodes: nodes, totalNodes: cnt, parseTime: pt, tree, message: msg } = e.data;
          if (type === 'parsed' || type === 'toggled' || type === 'updated') {
            visibleNodes.value = nodes;
            totalNodes.value = cnt;
            if (pt) parseTime.value = pt;
            if (tree) jsonTree.value = tree;
            parseStatus.value = '';
          } else if (type === 'error') {
            isUsingWorker.value = false;
            errorMessage.value = msg;
            parseStatus.value = 'error';
            fallbackParse(content, size, parseStartTime);
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
        fallbackParse(content, size, parseStartTime);
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
        fallbackParse(content, size, parseStartTime);
      }
    } else {
      isUsingWorker.value = false;
      fallbackParse(content, size, parseStartTime);
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
  }
  if (files.value.length > 0 && !currentFileId.value) {
    selectFile(files.value[files.value.length - 1].id);
  }
}

function selectFile(fileId) {
  currentFileId.value = fileId;
  const file = files.value.find(f => f.id === fileId);
  if (file) {
    file.lastOpen = Date.now();
    parseJSONContent(file.content, file.size);
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

function toggleNode(nodeId) {
  if (isUsingWorker.value && worker) {
    worker.postMessage({ type: 'toggle', nodeId });
  } else {
    if (!jsonTree.value) return;
    function toggle(n) {
      if (n.id === nodeId) {
        n.collapsed = !n.collapsed;
        if (!n.collapsed) {
          ensureChildrenSync(n);
        }
        return true;
      }
      if (!n.collapsed && n.children) {
        for (const child of n.children) {
          if (toggle(child)) return true;
        }
      }
      return false;
    }
    toggle(jsonTree.value);
    visibleNodes.value = flattenTreeSync(jsonTree.value);
  }
}

function expandAll() {
  if (isUsingWorker.value && worker) {
    worker.postMessage({ type: 'expandAll' });
  } else {
    if (!jsonTree.value) return;
    function expand(node) {
      node.collapsed = false;
      ensureChildrenSync(node);
      if (node.children) node.children.forEach(expand);
    }
    expand(jsonTree.value);
    visibleNodes.value = flattenTreeSync(jsonTree.value);
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

function formatJSON() {
  if (!currentFile.value) return;
  try {
    const parsed = JSON.parse(currentFile.value.content);
    const formatted = JSON.stringify(parsed, null, 2);
    updateCurrentFile(formatted);
    isEscaped.value = false;
    errorMessage.value = '格式化完成';
  } catch (e) {
    errorMessage.value = '格式化失败: ' + e.message;
  }
}

function compressJSON() {
  if (!currentFile.value) return;
  try {
    const parsed = JSON.parse(currentFile.value.content);
    const compressed = JSON.stringify(parsed);
    updateCurrentFile(compressed);
    isEscaped.value = false;
    errorMessage.value = '压缩完成';
  } catch (e) {
    errorMessage.value = '压缩失败: ' + e.message;
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
}

function handleSearchNext() {
}

function handleSearchPrev() {
}

function toggleTheme() {
  if (currentTheme.value === 'dark') {
    currentTheme.value = 'light';
    document.documentElement.classList.remove('theme-dark');
    document.documentElement.classList.add('theme-light');
  } else if (currentTheme.value === 'light') {
    currentTheme.value = 'hc';
    document.documentElement.classList.remove('theme-light');
    document.documentElement.classList.add('theme-hc');
  } else {
    currentTheme.value = 'dark';
    document.documentElement.classList.remove('theme-hc');
    document.documentElement.classList.remove('theme-light');
  }
}

onMounted(async () => {
  initWorker();
  await initDB();
  const cached = await loadFiles();
  if (cached.length > 0) {
    files.value = cached;
    selectFile(cached[0].id);
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
});
</script>

<template>
  <div class="app" @dragover="handleDragOver" @dragleave="handleDragLeave" @drop="handleDrop">
    <div v-if="isDragging" class="drag-overlay">
      <div class="drag-message">释放文件以打开</div>
    </div>

    <header class="title-bar">
      <div class="title-left">
        <LogoIcon class="title-icon"/>
        <span class="title-text">JSON</span>
        <span class="title-accent">Pro</span>
      </div>
      <div class="title-right">
        <button class="title-btn" @click="formatJSON" :disabled="!currentFile">格式化</button>
        <button class="title-btn" @click="compressJSON" :disabled="!currentFile">压缩</button>
        <button class="title-btn" @click="toggleEscape" :disabled="!currentFile">{{ isEscaped ? '反转义' : '转义' }}</button>
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
          ref="containerRef"
          :visibleNodes="filteredVisibleNodes"
          :searchQuery="searchQuery"
          :currentFile="currentFile"
          :parseStatus="parseStatus"
          :errorMessage="errorMessage"
          @toggleNode="toggleNode"
          @scroll="handleScroll"
          @selectNode="handleSelectNode"
          @copyPath="copyPath"
          @search="handleSearch"
          @searchNext="handleSearchNext"
          @searchPrev="handleSearchPrev"
        />
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
  height: var(--titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--sidebar-bg);
  border-bottom: 1px solid var(--border);
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-icon {
  color: var(--accent);
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.title-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.title-accent {
  font-size: 14px;
  font-weight: 500;
  color: var(--accent);
}

.title-right {
  display: flex;
  gap: 16px;
}

.title-btn {
  background: transparent;
  border: none;
  color: var(--btn-text);
  padding: 4px 8px;
  font-size: 14px;
  font-family: var(--font-ui);
  font-weight: 400;
  cursor: pointer;
  transition: var(--transition-fast);
  border-radius: 4px;
}

.title-btn:hover:not(:disabled) {
  color: var(--accent);
  background: var(--hover-bg);
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
</style>
