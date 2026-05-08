<script setup>
import { ref, computed, onMounted, onUnmounted, shallowRef, markRaw, watch } from 'vue';
import '@/assets/vscode.css';
import SideBar from '@/components/SideBar.vue';
import EditorTabs from '@/components/EditorTabs.vue';
import JsonTreeView from '@/components/JsonTreeView.vue';
import StatusBar from '@/components/StatusBar.vue';
import DetailPanel from '@/components/DetailPanel.vue';
import CommandPalette from '@/components/CommandPalette.vue';
import SkeletonLoader from '@/components/SkeletonLoader.vue';
import LogoIcon from '@/components/icons/LogoIcon.vue';
import FormatIcon from '@/components/icons/FormatIcon.vue';
import CompressIcon from '@/components/icons/CompressIcon.vue';
import EscapeIcon from '@/components/icons/EscapeIcon.vue';
import ThemeIcon from '@/components/icons/ThemeIcon.vue';
import MoreIcon from '@/components/icons/MoreIcon.vue';
import SaveIcon from '@/components/icons/SaveIcon.vue';
import { StreamingValidator, MemoryIndex, SearchController, ErrorHandler, BlockCacheManager } from '@/core/index.js';
import ParseProgress from '@/components/ParseProgress.vue';
import ConsolePanel from '@/components/ConsolePanel.vue';

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
const parseProgress = ref(0);

const parsingPhase = ref('');
const parsingProgress = ref(0);
const currentFileText = ref('');
const isLargeFileMode = ref(false);

const currentStep = ref('');
const showConsole = ref(false);
const selectedNode = ref(null);
const activeConsoleTab = ref('logs');
const parseSteps = ref([
  { id: 'read', message: '读取文件', detail: '', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'validate', message: '流式校验', detail: '检查括号匹配...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'index', message: '构建索引', detail: '扫描键名和结构...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'minimap', message: '绘制Minimap', detail: '基于索引生成缩略图...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'render', message: '渲染可见区', detail: '格式化前30行...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 }
]);

const backgroundProgress = ref(0);
let autoCollapseTimer = null;

let streamingValidator = null;
let memoryIndex = null;
let searchController = null;
let errorHandler = null;
let blockCacheManager = null;

const showDetailPanel = ref(false);
const searchQuery = ref('');
const isDragging = ref(false);
const cursorPosition = ref({ line: 1, column: 1 });

const showCommandPalette = ref(false);
const isTextMode = ref(false);
const textContent = ref('');

// ============================================
// 多Worker并行解析优化
// ============================================
const WORKER_COUNT = Math.min(4, navigator.hardwareConcurrency || 4);
const MAX_MEMORY_USAGE = 800 * 1024 * 1024;
const MEMORY_CHECK_INTERVAL = 200;
const VISIBLE_NODE_COUNT = 5000;
const PRELOAD_NODE_COUNT = 10000;

let workers = [];
let workerTasks = new Map();
let pendingResults = [];
let pendingResultCount = 0;
let totalShards = 0;
let backgroundParseStartTime = 0;
let memoryCheckTimer = null;
let isMemoryWarning = false;
const fileInputRef = ref(null);

// 节点位置索引
let nodePositionIndex = null;
let depthStats = null;
let globalResults = null;
let loadedCount = 0;

function resetParseSteps() {
  parseSteps.value = [
    { id: 'read', message: '读取文件', detail: '', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'validate', message: '流式校验', detail: '检查括号匹配...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'index', message: '构建索引', detail: '扫描键名和结构...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'minimap', message: '绘制Minimap', detail: '基于索引生成缩略图...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'render', message: '渲染可见区', detail: '格式化前30行...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 }
  ];
  parseProgress.value = 0;
  currentStep.value = '';
  backgroundProgress.value = 0;
}

function startParseStep(stepId) {
  const step = parseSteps.value.find(s => s.id === stepId);
  if (step) {
    parseSteps.value.forEach(s => s.active = false);
    step.active = true;
    step.startTime = performance.now();
    currentStep.value = step.message;
    showConsole.value = true;
    if (autoCollapseTimer) {
      clearTimeout(autoCollapseTimer);
      autoCollapseTimer = null;
    }
  }
}

function completeParseStep(stepId, detail = '', duration = null) {
  const step = parseSteps.value.find(s => s.id === stepId);
  if (step) {
    step.active = false;
    step.done = true;
    step.endTime = performance.now();
    if (duration !== null) {
      step.duration = duration;
    } else {
      step.duration = Math.round(step.endTime - step.startTime);
    }
    step.detail = detail;
    
    const stepIndex = parseSteps.value.findIndex(s => s.id === stepId);
    parseProgress.value = ((stepIndex + 1) / parseSteps.value.length) * 100;
    
    const allDone = parseSteps.value.every(s => s.done);
    if (allDone) {
      autoCollapseTimer = setTimeout(() => {
        showConsole.value = false;
      }, 3000);
    }
  }
}

function copyLog() {
  const log = parseSteps.value.map(s => {
    const time = s.endTime ? new Date(s.endTime).toLocaleTimeString('zh-CN', { hour12: false }) : '';
    const status = s.error ? '✗' : s.done ? '✓' : s.active ? '...' : '-';
    const duration = s.done ? `(${s.duration}ms)` : '';
    return `${time} ${status} ${s.message} ${duration} ${s.detail || ''}`;
  }).join('\n');
  navigator.clipboard.writeText(log);
}

function runInBackground() {
  showConsole.value = false;
}

function clearLog() {
  resetParseSteps();
}

function updateParseStep(stepId, detail = '', done = false) {
  const step = parseSteps.value.find(s => s.id === stepId);
  if (step) {
    parseSteps.value.forEach(s => s.active = false);
    step.active = !done;
    step.done = done;
    step.detail = detail;
    step.time = new Date().toISOString();
    if (!done && step.startTime === 0) {
      step.startTime = performance.now();
    }
    currentStep.value = step.message;
    
    const stepIndex = parseSteps.value.findIndex(s => s.id === stepId);
    parseProgress.value = ((stepIndex + (done ? 1 : 0)) / parseSteps.value.length) * 100;
  }
}

const filteredVisibleNodes = computed(() => {
  if (!searchQuery.value) return visibleNodes.value;
  const query = searchQuery.value.toLowerCase();
  return visibleNodes.value.filter(node => {
    if (!node || !node.k) return false;
    return node.k.toLowerCase().includes(query);
  });
});

const searchMatchIndex = ref(-1);
const searchMatchCount = ref(0);

const currentFile = computed(() => {
  return files.value.find(f => f.id === currentFileId.value);
});

const parseCache = new Map();
let worker = null;
let pendingParseTask = null;

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

  const type = typeof value;
  let node = {
    id,
    k: key,
    v: value,
    type,
    path: path.slice(),
    displayPath,
    depth: path.length,
    isRoot,
    collapsed: false,
    children: []
  };

  if (type === 'object' && value !== null) {
    if (Array.isArray(value)) {
      node._isLazy = true;
      node._rawValue = value;
      node._maxChildren = 100;
      node.type = 'array';
    } else {
      node._isLazy = true;
      node._rawValue = value;
      node._maxChildren = 100;
      node.type = 'object';
    }
  } else {
    node.type = type;
    node.value = value;
  }

  return node;
}

function parseShard(data, basePath, baseId, maxDepth = 10) {
  const result = [];
  let localId = baseId;
  
  const stack = [{
    value: data,
    key: undefined,
    depth: 0,
    path: basePath ? [...basePath] : [],
    isRoot: basePath === undefined || basePath.length === 0
  }];
  
  while (stack.length > 0) {
    const item = stack.pop();
    const { value, key, depth, path, isRoot } = item;
    
    localId++;
    
    let type, displayValue, fullValue, childCount = 0;
    
    if (value === null) {
      type = 'null';
      displayValue = 'null';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
      displayValue = String(value);
    } else if (typeof value === 'number') {
      type = 'number';
      displayValue = String(value);
    } else if (typeof value === 'string') {
      type = 'string';
      fullValue = undefined;
      displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
    } else if (Array.isArray(value)) {
      type = 'array';
      childCount = value.length;
      displayValue = 'Array(' + value.length + ')';
      
      if (depth < maxDepth) {
        for (let i = value.length - 1; i >= 0; i--) {
          const newPath = [...path];
          if (key !== undefined) newPath.push(key);
          stack.push({
            value: value[i],
            key: '[' + i + ']',
            depth: depth + 1,
            path: newPath,
            isRoot: false
          });
        }
      }
    } else if (typeof value === 'object') {
      type = 'object';
      const keys = Object.keys(value);
      childCount = keys.length;
      displayValue = 'Object(' + keys.length + ')';
      
      if (depth < maxDepth) {
        for (let i = keys.length - 1; i >= 0; i--) {
          const k = keys[i];
          const newPath = [...path];
          if (key !== undefined) newPath.push(key);
          stack.push({
            value: value[k],
            key: k,
            depth: depth + 1,
            path: newPath,
            isRoot: false
          });
        }
      }
    } else {
      type = 'unknown';
      displayValue = String(value);
    }
    
    const nodePath = [...path];
    if (key !== undefined) nodePath.push(key);
    const displayPath = nodePath.map(p => 
        typeof p === 'number' ? '[' + p + ']' : p
      ).join('.');
    
    result.push({
      id: localId,
      key: key,
      type: type,
      path: nodePath,
      displayPath: displayPath,
      depth: depth,
      isRoot: isRoot,
      collapsed: false,
      hasChildren: childCount > 0,
      displayValue: displayValue,
      fullValue: fullValue,
      childCount: childCount
    });
  }
  
  return { nodes: result, lastId: localId };
}

function parseShardFast(data, basePath, baseId, maxDepth = 8, maxNodes = 500000) {
  const result = [];
  let localId = baseId;
  let nodeCount = 0;
  
  const stack = [{
    value: data,
    key: undefined,
    depth: 0,
    path: basePath ? [...basePath] : [],
    isRoot: basePath === undefined || basePath.length === 0
  }];
  
  while (stack.length > 0 && nodeCount < maxNodes) {
    const item = stack.pop();
    const { value, key, depth, path, isRoot } = item;
    
    localId++;
    nodeCount++;
    
    let type, displayValue, fullValue, childCount = 0;
    
    if (value === null) {
      type = 'null';
      displayValue = 'null';
    } else if (typeof value === 'boolean') {
      type = 'boolean';
      displayValue = String(value);
    } else if (typeof value === 'number') {
      type = 'number';
      displayValue = String(value);
    } else if (typeof value === 'string') {
      type = 'string';
      displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
    } else if (Array.isArray(value)) {
      type = 'array';
      childCount = value.length;
      displayValue = 'Array(' + value.length + ')';
      
      if (depth < maxDepth) {
        for (let i = value.length - 1; i >= 0; i--) {
          if (nodeCount >= maxNodes) break;
          const newPath = [...path];
          if (key !== undefined) newPath.push(key);
          stack.push({
            value: value[i],
            key: '[' + i + ']',
            depth: depth + 1,
            path: newPath,
            isRoot: false
          });
        }
      }
    } else if (typeof value === 'object') {
      type = 'object';
      const keys = Object.keys(value);
      childCount = keys.length;
      displayValue = 'Object(' + keys.length + ')';
      
      if (depth < maxDepth) {
        for (let i = keys.length - 1; i >= 0; i--) {
          if (nodeCount >= maxNodes) break;
          const k = keys[i];
          const newPath = [...path];
          if (key !== undefined) newPath.push(key);
          stack.push({
            value: value[k],
            key: k,
            depth: depth + 1,
            path: newPath,
            isRoot: false
          });
        }
      }
    } else {
      type = 'unknown';
      displayValue = String(value);
    }
    
    const nodePath = [...path];
    if (key !== undefined) nodePath.push(key);
    
    result.push({
      id: localId,
      key: key,
      type: type,
      path: nodePath,
      displayPath: nodePath.join('.'),
      depth: depth,
      isRoot: isRoot,
      collapsed: false,
      hasChildren: childCount > 0,
      displayValue: displayValue,
      childCount: childCount
    });
  }
  
  return { nodes: result, lastId: localId, truncated: nodeCount >= maxNodes };
}

function getDisplayValue(node) {
  if (typeof node.v === 'string') {
    return node.v.length > 200 ? node.v.substring(0, 200) + '...' : node.v;
  }
  if (node.v === null) {
    return 'null';
  }
  if (typeof node.v === 'boolean') {
    return String(node.v);
  }
  if (typeof node.v === 'number') {
    return String(node.v);
  }
  if (node.type === 'array') {
    const len = node._rawValue ? (Array.isArray(node._rawValue) ? node._rawValue.length : 0) : 0;
    return 'Array(' + len + ')';
  }
  if (node.type === 'object') {
    const raw = node._rawValue;
    const len = raw && typeof raw === 'object' ? Object.keys(raw).length : 0;
    return 'Object(' + len + ')';
  }
  return String(node.v);
}

function flattenTree(root) {
  if (!root) return [];
  
  const result = [];
  const stack = [root];
  
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    
    const raw = node._rawValue;
    const childCount = raw ? (Array.isArray(raw) ? raw.length : (typeof raw === 'object' ? Object.keys(raw).length : 0)) : 0;
    const displayValue = getDisplayValue(node);
    
    if (!node.collapsed) {
      result.push({
        id: node.id,
        key: node.k,
        type: node.type,
        path: node.path,
        displayPath: node.displayPath,
        depth: node.depth,
        isRoot: node.isRoot,
        collapsed: node.collapsed,
        hasChildren: node.children && node.children.length > 0,
        displayValue: displayValue,
        fullValue: typeof node.v === 'string' ? node.v : undefined,
        childCount: childCount
      });
      
      if (node.children && node.children.length > 0) {
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push(node.children[i]);
        }
      }
    } else {
      result.push({
        id: node.id,
        key: node.k,
        type: node.type,
        path: node.path,
        displayPath: node.displayPath,
        depth: node.depth,
        isRoot: node.isRoot,
        collapsed: node.collapsed,
        hasChildren: true,
        displayValue: displayValue,
        fullValue: typeof node.v === 'string' ? node.v : undefined,
        childCount: childCount
      });
    }
  }
  
  return result;
}

function countNodes(root) {
  if (!root) return 0;
  
  let count = 0;
  const stack = [root];
  
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    
    count++;
    
    if (node._isLazy && node._rawValue) {
      if (Array.isArray(node._rawValue)) {
        count += node._rawValue.length;
      } else if (typeof node._rawValue === 'object') {
        count += Object.keys(node._rawValue).length;
      }
    }
    
    if (node.children && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  
  return count;
}

function expandAll() {
  if (!parsedTree) return;
  
  const stack = [parsedTree];
  
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    
    node.collapsed = false;
    const originalMaxChildren = node._maxChildren;
    node._maxChildren = Infinity;
    ensureChildren(node);
    node._maxChildren = originalMaxChildren;
    
    if (node.children && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
}

function collapseAll() {
  if (!parsedTree) return;
  
  const stack = [parsedTree];
  
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    
    node.collapsed = true;
    
    if (node.children && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
}

function toggleNode(nodeId) {
  if (!parsedTree) return { visibleNodes: [], totalNodes: 0 };
  
  const stack = [parsedTree];
  
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    
    if (node.id === nodeId) {
      node.collapsed = !node.collapsed;
      if (!node.collapsed) {
        const originalMaxChildren = node._maxChildren;
        node._maxChildren = Infinity;
        ensureChildren(node);
        node._maxChildren = originalMaxChildren;
      }
      break;
    }
    
    if (node.children && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]);
      }
    }
  }
  
  const visibleNodes = flattenTree(parsedTree);
  return { visibleNodes, totalNodes: visibleNodes.length };
}

function estimateNodeCount(obj) {
  let count = 0;
  const stack = [obj];
  
  while (stack.length > 0 && count <= MAX_WORKER_TOTAL * 2) {
    const current = stack.pop();
    if (current === null || typeof current !== 'object') {
      count++;
      continue;
    }
    
    count++;
    
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push(current[i]);
      }
    } else {
      const keys = Object.keys(current);
      for (let i = keys.length - 1; i >= 0; i--) {
        stack.push(current[keys[i]]);
      }
    }
  }
  
  return count;
}

const MAX_WORKER_TOTAL = 5000000;

function parseJSONToFlatArray(text) {
  try {
    const data = JSON.parse(text);
    
    const result = [];
    let idCounter = 0;
    
    const stack = [{ 
      value: data, 
      key: undefined, 
      depth: 0, 
      path: [],
      isRoot: true 
    }];
    
    while (stack.length > 0 && result.length < MAX_WORKER_TOTAL) {
      const item = stack.pop();
      const { value, key, depth, path, isRoot } = item;
      
      idCounter++;
      
      let type, displayValue, fullValue, childCount = 0;
      
      if (value === null) {
        type = 'null';
        displayValue = 'null';
      } else if (typeof value === 'boolean') {
        type = 'boolean';
        displayValue = String(value);
      } else if (typeof value === 'number') {
        type = 'number';
        displayValue = String(value);
      } else if (typeof value === 'string') {
        type = 'string';
        fullValue = undefined;
        displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
      } else if (Array.isArray(value)) {
        type = 'array';
        childCount = value.length;
        displayValue = 'Array(' + value.length + ')';
        
        for (let i = value.length - 1; i >= 0; i--) {
          if (result.length >= MAX_WORKER_TOTAL) break;
          const newPath = [...path, '[' + i + ']'];
          stack.push({
            value: value[i],
            key: '[' + i + ']',
            depth: depth + 1,
            path: newPath,
            isRoot: false
          });
        }
      } else if (typeof value === 'object') {
        type = 'object';
        const keys = Object.keys(value);
        childCount = keys.length;
        displayValue = 'Object(' + keys.length + ')';
        
        for (let i = keys.length - 1; i >= 0; i--) {
          if (result.length >= MAX_WORKER_TOTAL) break;
          const k = keys[i];
          const newPath = [...path, k];
          stack.push({
            value: value[k],
            key: k,
            depth: depth + 1,
            path: newPath,
            isRoot: false
          });
        }
      } else {
        type = 'unknown';
        displayValue = String(value);
      }
      
      const displayPath = path.length > 0 ? path.join('.') : '';
      
      result.push({
        id: idCounter,
        key: key,
        type: type,
        path: path,
        displayPath: displayPath,
        depth: depth,
        isRoot: isRoot,
        collapsed: false,
        hasChildren: childCount > 0,
        displayValue: displayValue,
        fullValue: fullValue,
        childCount: childCount
      });
    }
    
    return {
      nodes: result,
      truncated: result.length >= MAX_WORKER_TOTAL,
      total: result.length
    };
    
  } catch (err) {
    throw new Error('解析失败: ' + err.message);
  }
}

function streamingIndex(text) {
  var maxLines = Math.min(text.length / 2, 5000000);
  var maxKeys = Math.min(text.length / 10, 500000);
  
  var lines = [];
  var keys = [];
  var keyPositions = [];
  var keyLengths = [];
  var depths = [];
  
  var lineCount = 0;
  var keyCount = 0;
  var depth = 0;
  var inString = false;
  var isEscaped = false;
  var keyStart = -1;
  var keyLength = 0;
  
  lines[lineCount++] = 0;
  
  for (var i = 0; i < text.length; i++) {
    var char = text.charAt(i);
    
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    
    if (char === '\\\\' && inString) {
      isEscaped = true;
      continue;
    }
    
    if (char === '"') {
      if (!inString) {
        inString = true;
        keyStart = i + 1;
        keyLength = 0;
      } else {
        inString = false;
        if (keyStart > 0 && keyLength > 0) {
          if (keyCount < maxKeys) {
            keys[keyCount] = (lineCount << 16) | depth;
            keyPositions[keyCount] = keyStart;
            keyLengths[keyCount] = keyLength;
            depths[keyCount] = depth;
            keyCount++;
          }
          keyStart = -1;
          keyLength = 0;
        }
      }
      continue;
    }
    
    if (inString) {
      keyLength++;
      continue;
    }
    
    if (char === '\\n') {
      if (lineCount < maxLines) {
        lines[lineCount++] = i + 1;
      }
      continue;
    }
    
    if (char === '{' || char === '[') {
      depth++;
      continue;
    }
    
    if (char === '}' || char === ']') {
      depth--;
      continue;
    }
  }
  
  var maxDepth = 0;
  for (var i = 0; i < keyCount; i++) {
    if (depths[i] > maxDepth) {
      maxDepth = depths[i];
    }
  }
  
  return {
    lines: lines.slice(0, lineCount),
    keys: keys.slice(0, keyCount),
    keyPositions: keyPositions.slice(0, keyCount),
    keyLengths: keyLengths.slice(0, keyCount),
    depths: depths.slice(0, keyCount),
    lineCount: lineCount,
    keyCount: keyCount,
    totalNodes: keyCount + 1,
    maxDepth: maxDepth
  };
}

function getNodesFromIndex(index, text, start, end) {
  var nodes = [];
  
  for (var i = start; i < end && i < index.keyCount; i++) {
    var keyPos = index.keyPositions[i];
    var keyLen = index.keyLengths[i];
    var depth = index.depths[i];
    var key = text.substring(keyPos, keyPos + keyLen);
    
    nodes.push({
      id: i + 1,
      key: key,
      type: 'object',
      depth: depth,
      path: '',
      displayPath: key,
      displayValue: '{}',
      fullValue: null,
      hasChildren: true,
      childCount: 0,
      isExpanded: depth < 2,
      collapsed: false,
      isRoot: false,
      line: 0
    });
  }
  
  return nodes;
}

function createRootNode() {
  return {
    id: 0,
    key: '',
    type: 'object',
    depth: 0,
    path: '',
    displayPath: '',
    displayValue: '{}',
    fullValue: null,
    hasChildren: true,
    childCount: 0,
    isExpanded: true,
    collapsed: false,
    isRoot: true,
    line: 0
  };
}

function continueBackgroundParse(totalKeys, currentPos) {
  const BATCH_SIZE = 5000;
  const index = self._streamingIndex;
  const content = self._content;
  
  if (!index || !content) return;
  
  const start = currentPos;
  const end = Math.min(start + BATCH_SIZE, index.keyCount);
  
  const nodes = getNodesFromIndex(index, content, start, end);
  
  self.postMessage({
    type: 'parsed',
    visibleNodes: nodes,
    totalNodes: index.totalNodes,
    isComplete: end >= index.keyCount,
    progress: Math.min(end / index.totalNodes, 1)
  });
  
  if (end < index.keyCount) {
    setTimeout(() => continueBackgroundParse(totalKeys, end), 50);
  }
}

function buildPositionIndex(data) {
  const nodes = [];
  const index = {
    totalNodes: 0,
    keys: [],
    depths: [],
    hasChildren: [],
    types: [],
    paths: []
  };
  
  const stack = [{ value: data, key: undefined, path: [], depth: 0, isRoot: true }];
  
  while (stack.length > 0) {
    const item = stack.pop();
    const { value, key, path, depth, isRoot } = item;
    
    let type, displayValue, fullValue, hasChildren = false, childCount = 0;
    
    if (value === null) {
      type = 'null';
      displayValue = 'null';
      fullValue = null;
    } else if (typeof value === 'boolean') {
      type = 'boolean';
      displayValue = value ? 'true' : 'false';
      fullValue = value;
    } else if (typeof value === 'number') {
      type = 'number';
      displayValue = String(value);
      fullValue = value;
    } else if (typeof value === 'string') {
      type = 'string';
      displayValue = '"' + value.substring(0, 100) + (value.length > 100 ? '...' : '') + '"';
      fullValue = value;
    } else if (Array.isArray(value)) {
      type = 'array';
      childCount = value.length;
      hasChildren = childCount > 0;
      displayValue = '[' + childCount + ']';
      fullValue = value;
    } else if (typeof value === 'object') {
      type = 'object';
      childCount = Object.keys(value).length;
      hasChildren = childCount > 0;
      displayValue = '{' + childCount + '}';
      fullValue = value;
    } else {
      type = 'unknown';
      displayValue = String(value);
      fullValue = value;
    }
    
    const nodePath = path.join('.');
    
    const node = {
      id: index.totalNodes + 1,
      key: key,
      type: type,
      depth: depth,
      path: nodePath,
      displayValue: displayValue,
      fullValue: hasChildren ? null : fullValue,
      hasChildren: hasChildren,
      childCount: childCount,
      isExpanded: hasChildren && depth < 3,
      pathParts: [...path]
    };
    
    nodes.push(node);
    
    index.keys.push(key);
    index.depths.push(depth);
    index.hasChildren.push(hasChildren);
    index.types.push(type);
    index.paths.push([...path]);
    index.totalNodes++;
    
    if (hasChildren) {
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          const childKey = '[' + i + ']';
          stack.push({
            value: value[i],
            key: childKey,
            path: [...path, childKey],
            depth: depth + 1,
            isRoot: false
          });
        }
      } else {
        const keys = Object.keys(value);
        for (let i = keys.length - 1; i >= 0; i--) {
          const k = keys[i];
          stack.push({
            value: value[k],
            key: k,
            path: [...path, k],
            depth: depth + 1,
            isRoot: false
          });
        }
      }
    }
  }
  
  return { index, nodes };
}

function buildDepthStats(index) {
  const maxDepth = Math.max(...index.depths) + 1;
  const stats = {
    totalByDepth: new Array(maxDepth).fill(0),
    cumulativeByDepth: new Array(maxDepth).fill(0),
    maxDepth
  };
  
  for (let i = 0; i < index.totalNodes; i++) {
    stats.totalByDepth[index.depths[i]]++;
  }
  
  let cumulative = 0;
  for (let d = 0; d < maxDepth; d++) {
    cumulative += stats.totalByDepth[d];
    stats.cumulativeByDepth[d] = cumulative;
  }
  
  return stats;
}

function getValueByPath(data, path) {
  let current = data;
  for (const part of path) {
    if (part.startsWith('[') && part.endsWith(']')) {
      const index = parseInt(part.slice(1, -1));
      current = current[index];
    } else {
      current = current[part];
    }
    if (current === undefined || current === null) break;
  }
  return current;
}

function createNodeWithPath(value, key, depth, path, hasChildren) {
  let type, displayValue, fullValue, childCount = 0;
  
  if (value === null) {
    type = 'null';
    displayValue = 'null';
    fullValue = null;
  } else if (typeof value === 'boolean') {
    type = 'boolean';
    displayValue = value ? 'true' : 'false';
    fullValue = value;
  } else if (typeof value === 'number') {
    type = 'number';
    displayValue = String(value);
    fullValue = value;
  } else if (typeof value === 'string') {
    type = 'string';
    displayValue = '"' + value.substring(0, 100) + (value.length > 100 ? '...' : '') + '"';
    fullValue = value;
  } else if (Array.isArray(value)) {
    type = 'array';
    childCount = value.length;
    displayValue = '[' + childCount + ']';
    fullValue = value;
  } else if (typeof value === 'object') {
    type = 'object';
    childCount = Object.keys(value).length;
    displayValue = '{' + childCount + '}';
    fullValue = value;
  } else {
    type = 'unknown';
    displayValue = String(value);
    fullValue = value;
  }
  
  const nodePath = path.join('.');
  
  return {
    id: 0,
    key: key,
    type: type,
    depth: depth,
    path: nodePath,
    displayValue: displayValue,
    fullValue: fullValue,
    hasChildren: hasChildren,
    childCount: childCount,
    isExpanded: hasChildren && depth < 3,
    pathParts: path
  };
}

function parseRange(data, index, start, end) {
  const nodes = [];
  
  if (!index || !data) return nodes;
  
  for (let i = start; i < end && i < (index.keyCount || 0); i++) {
    const key = index.keyPositions ? 'key_' + i : 'unknown';
    const depth = index.depths ? index.depths[i] : 0;
    
    nodes.push({
      id: i + 1,
      key: key,
      type: 'object',
      depth: depth,
      path: '',
      displayPath: key,
      displayValue: '{}',
      fullValue: null,
      hasChildren: true,
      childCount: 0,
      isExpanded: depth < 2,
      collapsed: false,
      isRoot: false,
      line: 0
    });
  }
  
  return nodes;
}

function parseAndExpandAllFast(text) {
  try {
    self.postMessage({ type: 'parseStart' });
    
    const startTime = performance.now();
    
    // 流式解析并分批发送，避免内存溢出
    const data = JSON.parse(text);
    const batchSize = 5000; // 大幅增加批次大小
    const maxPerFrame = 1000; // 每帧处理更多节点
    let totalNodes = 0;
    let sentCount = 0;
    let isTruncated = false;
    
    const result = [];
    let idCounter = 0;
    
    // 使用数组栈，更高效
    const stack = [{ 
      value: data, 
      key: undefined, 
      depth: 0, 
      path: '',
      isRoot: true 
    }];
    
    // 发送当前批次的节点
    function sendCurrentBatch() {
      if (result.length > 0) {
        self.postMessage({
          type: 'parsed',
          visibleNodes: result,
          totalNodes: totalNodes,
          truncated: isTruncated,
          isComplete: false,
          progress: sentCount / Math.max(totalNodes, sentCount + 1)
        });
        
        sentCount += result.length;
        result.length = 0; // 清空数组，复用内存
      }
    }
    
    // 继续解析并发送
    function continueParsing() {
      let processedCount = 0;
      
      while (stack.length > 0 && !isTruncated) {
        // 弹出栈顶元素
        const item = stack.pop();
        
        const { value, key, depth, path, isRoot } = item;
        
        idCounter++;
        totalNodes++;
        
        let type, displayValue, fullValue, childCount = 0;
        
        if (value === null) {
          type = 'null';
          displayValue = 'null';
        } else if (typeof value === 'boolean') {
          type = 'boolean';
          displayValue = String(value);
        } else if (typeof value === 'number') {
          type = 'number';
          displayValue = String(value);
        } else if (typeof value === 'string') {
          type = 'string';
          fullValue = undefined;
          displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
        } else if (Array.isArray(value)) {
          type = 'array';
          childCount = value.length;
          displayValue = 'Array(' + value.length + ')';
          
          // 倒序压栈，处理所有元素
          for (let i = value.length - 1; i >= 0; i--) {
            if (totalNodes >= MAX_WORKER_TOTAL) {
              isTruncated = true;
              break;
            }
            const newPath = path ? path + '[' + i + ']' : '[' + i + ']';
            stack.push({
              value: value[i],
              key: '[' + i + ']',
              depth: depth + 1,
              path: newPath,
              isRoot: false
            });
          }
        } else if (typeof value === 'object') {
          type = 'object';
          const keys = Object.keys(value);
          childCount = keys.length;
          displayValue = 'Object(' + keys.length + ')';
          
          // 倒序压栈，处理所有元素
          for (let i = keys.length - 1; i >= 0; i--) {
            if (totalNodes >= MAX_WORKER_TOTAL) {
              isTruncated = true;
              break;
            }
            const k = keys[i];
            const newPath = path ? path + '.' + k : k;
            stack.push({
              value: value[k],
              key: k,
              depth: depth + 1,
              path: newPath,
              isRoot: false
            });
          }
        } else {
          type = 'unknown';
          displayValue = String(value);
        }
        
        result.push({
          id: idCounter,
          key: key,
          type: type,
          path: path,
          displayPath: path,
          depth: depth,
          isRoot: isRoot,
          collapsed: false,
          hasChildren: childCount > 0,
          displayValue: displayValue,
          fullValue: fullValue,
          childCount: childCount
        });
        
        // 每解析batchSize个节点就发送一次
        if (result.length >= batchSize) {
          sendCurrentBatch();
        }
        
        // 每处理一定数量后让出主线程
        processedCount++;
        if (processedCount >= maxPerFrame) {
          setTimeout(continueParsing, 0);
          return;
        }
      }
      
      // 发送剩余的节点
      sendCurrentBatch();
      
      const parseTime = performance.now() - startTime;
      
      // 所有节点发送完成
      self.postMessage({
        type: 'parsed',
        visibleNodes: [],
        totalNodes: totalNodes,
        parseTime: parseTime,
        truncated: isTruncated,
        isComplete: true,
        progress: 1
      });
    }
    
    // 开始流式解析
    continueParsing();
    
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
}

self.onmessage = function(e) {
  const { type, data, nodeId, shardIndex, totalShards, basePath, baseId, maxDepth, maxNodes, start, end, index, content, visibleCount, preloadCount } = e.data;
  
  switch(type) {
    case 'parse':
      try {
        const startTime = performance.now();
        const dataObj = JSON.parse(data);
        
        let idCounter = 0;
        const stack = [{ value: dataObj, key: undefined }];
        
        while (stack.length > 0) {
          const item = stack.pop();
          idCounter++;
          
          if (typeof item.value === 'object' && item.value !== null) {
            if (Array.isArray(item.value)) {
              for (let i = item.value.length - 1; i >= 0; i--) {
                stack.push({ value: item.value[i], key: '[' + i + ']' });
              }
            } else {
              for (const key of Object.keys(item.value)) {
                stack.push({ value: item.value[key], key: key });
              }
            }
          }
        }
        
        const parseTime = performance.now() - startTime;
        
        self.postMessage({ 
          type: 'parsed', 
          estimatedTotal: idCounter,
          totalNodes: idCounter,
          visibleNodes: [],
          parseTime: parseTime
        });
        
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
    case 'parseRange':
      try {
        const startTime = performance.now();
        const dataObj = JSON.parse(content);
        
        const nodes = parseRange(dataObj, index, start, end);
        
        const parseTime = performance.now() - startTime;
        
        self.postMessage({
          type: 'rangeResult',
          start: start,
          end: end,
          nodes: nodes,
          parseTime: parseTime
        });
      } catch (err) {
        self.postMessage({ 
          type: 'error', 
          message: err.message 
        });
      }
      break;
    case 'buildIndexAndParse':
      try {
        if (!content) {
          throw new Error('buildIndexAndParse: content is undefined');
        }
        if (typeof content !== 'string') {
          throw new Error('buildIndexAndParse: content is not a string, type=' + typeof content);
        }
        if (content.length === 0) {
          throw new Error('buildIndexAndParse: content is empty');
        }
        var parsedIndex = streamingIndex(content);
        var totalNodes = parsedIndex.totalNodes;
        
        self._streamingIndex = parsedIndex;
        self._content = content;
        
        self.postMessage({
          type: 'indexReady',
          totalNodes: totalNodes,
          lineCount: parsedIndex.lineCount,
          maxDepth: parsedIndex.maxDepth,
          keyCount: parsedIndex.keyCount
        });
        
      } catch (err) {
        self.postMessage({ type: 'error', message: 'buildIndexAndParse error: ' + err.message });
      }
      break;
    case 'getNodes':
      try {
        if (!self._streamingIndex || !self._content) {
          self.postMessage({ type: 'nodesReady', nodes: [], start: 0, end: 0, totalNodes: 0 });
          return;
        }
        
        var cachedIndex = self._streamingIndex;
        var cachedContent = self._content;
        var actualEnd = Math.min(end, cachedIndex.keyCount);
        
        var nodes = [];
        for (var i = start; i < actualEnd; i++) {
          var keyPos = cachedIndex.keyPositions[i];
          var keyLen = cachedIndex.keyLengths[i];
          var depth = cachedIndex.depths[i];
          var key = cachedContent.substring(keyPos, keyPos + keyLen);
          
          nodes.push({
            id: i + 1,
            key: key,
            type: 'object',
            depth: depth,
            path: '',
            displayPath: key,
            displayValue: '{}',
            fullValue: null,
            hasChildren: true,
            childCount: 0,
            isExpanded: depth < 2,
            collapsed: false,
            isRoot: false,
            line: 0
          });
        }
        
        self.postMessage({
          type: 'nodesReady',
          nodes: nodes,
          start: start,
          end: actualEnd,
          totalNodes: cachedIndex.totalNodes
        });
        
      } catch (err) {
        self.postMessage({ type: 'error', message: err.message });
      }
      break;
    case 'parseAndExpandAll':
      parseAndExpandAllFast(data);
      break;
    case 'parseShard':
      try {
        const startTime = performance.now();
        const dataObj = JSON.parse(data);
        
        const result = parseShardFast(dataObj, basePath, baseId || 0, maxDepth || 8, maxNodes || 500000);
        
        const parseTime = performance.now() - startTime;
        
        self.postMessage({
          type: 'shardResult',
          shardIndex: shardIndex,
          totalShards: totalShards,
          visibleNodes: result.nodes,
          totalNodes: result.nodes.length,
          lastId: result.lastId,
          truncated: result.truncated,
          parseTime: parseTime
        });
      } catch (err) {
        self.postMessage({ 
          type: 'error', 
          message: err.message,
          shardIndex: shardIndex 
        });
      }
      break;
    case 'toggle':
      break;
    case 'expandAll':
      break;
    case 'collapseAll':
      break;
  }
};
`;

function getParseErrorInfo(err, content) {
  let message = err.message || '解析失败';
  let type = 'unknown';
  
  if (err.message) {
    if (err.message.includes('Unexpected')) {
      type = 'syntax';
      const match = err.message.match(/at position (\d+)/);
      if (match) {
        const pos = parseInt(match[1]);
        const lines = content.substring(0, pos).split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;
        message = `第 ${line} 行，第 ${column} 列：${err.message}`;
      }
    } else if (err.message.includes('maximum')) {
      type = 'size';
    } else if (err.message.includes('out of memory')) {
      type = 'memory';
    }
  }
  
  return { message, type };
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
    } else if (t === 'object') {
      if (Array.isArray(v)) {
        node = { 
          id, k, type: 4, 
          dv: `Array(${v.length})`, 
          d, r, c: false, 
          children: [],
          _raw: v,
          _len: v.length,
          _isArray: true
        };
      } else {
        const keys = Object.keys(v);
        node = { 
          id, k, type: 5, 
          dv: `Object(${keys.length})`, 
          d, r, c: false, 
          children: [],
          _raw: v,
          _keys: keys,
          _isArray: false
        };
      }
      
      const childItems = [];
      if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i--) {
          childItems.push({ v: v[i], k: '[' + i + ']', d: d + 1, r: false, p: node });
        }
      } else {
        const keys = Object.keys(v);
        for (let i = keys.length - 1; i >= 0; i--) {
          const key = keys[i];
          childItems.push({ v: v[key], k: key, d: d + 1, r: false, p: node });
        }
      }
      
      treeStack.push(...childItems);
    } else {
      node = { id, k, type: 6, dv: String(v), d, r, c: false, children: [] };
    }
    
    if (r) {
      rootNode = node;
    }
    
    if (parent) {
      parent.children.unshift(node);
    }
    
    flatNodes.push(node);
  }
  
  return { flatNodes, totalCount, rootNode };
}

function normalizeNodes(nodes) {
  // 数字类型到字符串类型的映射
  const typeMap = {
    0: 'null',
    1: 'boolean',
    2: 'number',
    3: 'string',
    4: 'array',
    5: 'object',
    6: 'number'
  };
  
  nodes.forEach(node => {
    // 将数字类型转换为字符串类型
    if (typeof node.type === 'number') {
      node.type = typeMap[node.type] || 'number';
    }
    
    // 保留深度属性（用于后续的 ensureChildren 递归）
    if (node.d !== undefined) {
      node.depth = node.d;
    }
    
    if (node.type === 'array' || node.type === 'object') {
      node.collapsed = node.c !== undefined ? node.c : true;
    } else {
      node.collapsed = false;
    }
    delete node.c;
    delete node.r;
  });
}

function flattenTreeSyncOptimized(root) {
  const result = [];
  
  function traverse(node) {
    if (!node) return;
    
    result.push({
      id: node.id,
      k: node.k,
      v: node.dv,
      type: node.type,
      depth: node.depth,
      collapsed: node.collapsed,
      hasChildren: node.children && node.children.length > 0
    });
    
    if (!node.collapsed && node.children) {
      node.children.forEach(traverse);
    }
  }
  
  traverse(root);
  return result;
}

function ensureChildrenSync(node) {
  if (!node._raw) return;
  
  const children = [];
  if (node._isArray) {
    for (let i = 0; i < node._raw.length; i++) {
      const child = createNodeFromRaw(node._raw[i], '[' + i + ']', node.depth + 1);
      children.push(child);
    }
  } else {
    for (const key of node._keys) {
      const child = createNodeFromRaw(node._raw[key], key, node.depth + 1);
      children.push(child);
    }
  }
  
  node.children = children;
  delete node._raw;
  delete node._keys;
  delete node._len;
  delete node._isArray;
}

function createNodeFromRaw(value, key, depth) {
  const t = typeof value;
  let node;
  
  if (value === null) {
    node = { id: ++idCounter, k: key, type: 0, dv: 'null', depth, collapsed: false, children: [] };
  } else if (t === 'boolean') {
    node = { id: ++idCounter, k: key, type: 1, dv: value ? 'true' : 'false', depth, collapsed: false, children: [] };
  } else if (t === 'number') {
    node = { id: ++idCounter, k: key, type: 2, dv: String(value), depth, collapsed: false, children: [] };
  } else if (t === 'string') {
    const len = value.length;
    node = { 
      id: ++idCounter, k: key, type: 3, 
      dv: len > 200 ? value.substring(0, 200) + '...' : value,
      fv: value, depth, collapsed: false, children: [] 
    };
  } else if (t === 'object') {
    if (Array.isArray(value)) {
      node = { 
        id: ++idCounter, k: key, type: 4, 
        dv: `Array(${value.length})`, 
        depth, collapsed: false, 
        children: [],
        _raw: value,
        _len: value.length,
        _isArray: true
      };
    } else {
      const keys = Object.keys(value);
      node = { 
        id: ++idCounter, k: key, type: 5, 
        dv: `Object(${keys.length})`, 
        depth, collapsed: false, 
        children: [],
        _raw: value,
        _keys: keys,
        _isArray: false
      };
    }
  } else {
    node = { id: ++idCounter, k: key, type: 6, dv: String(value), depth, collapsed: false, children: [] };
  }
  
  return node;
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
        
        // 先快速渲染前1000个节点（带完整格式化）
        const renderStartTime = performance.now();
        let quickIdCounter = 0; // 用于快速渲染的独立ID计数器
        try {
          // 展开节点的子节点（递归）
          function ensureChildren(node, maxDepth = 5) {
            if (!node || maxDepth <= 0) return;
            if (node._raw && !node.children) {
              const children = [];
              const parentDepth = node.d !== undefined ? node.d : (node.depth || 0);
              if (node._isArray) {
                for (let i = 0; i < node._raw.length && children.length < 100; i++) {
                  const child = createQuickNode(node._raw[i], '[' + i + ']', parentDepth + 1);
                  children.push(child);
                }
              } else if (node._keys) {
                for (const key of node._keys.slice(0, 100)) {
                  const child = createQuickNode(node._raw[key], key, parentDepth + 1);
                  children.push(child);
                }
              }
              node.children = children;
            }
            // 递归处理子节点
            if (node.children) {
              for (const child of node.children) {
                ensureChildren(child, maxDepth - 1);
              }
            }
          }
          
          // 快速创建节点的辅助函数
          function createQuickNode(value, key, depth) {
            const t = typeof value;
            let node;
            
            if (value === null) {
              node = { id: ++quickIdCounter, k: key, type: 'null', dv: 'null', d: depth, depth: depth, collapsed: false, children: [] };
            } else if (t === 'boolean') {
              node = { id: ++quickIdCounter, k: key, type: 'boolean', dv: value ? 'true' : 'false', d: depth, depth: depth, collapsed: false, children: [] };
            } else if (t === 'number') {
              node = { id: ++quickIdCounter, k: key, type: 'number', dv: String(value), d: depth, depth: depth, collapsed: false, children: [] };
            } else if (t === 'string') {
              const len = value.length;
              node = { 
                id: ++quickIdCounter, k: key, type: 'string', 
                dv: len > 200 ? value.substring(0, 200) + '...' : value,
                fv: value, d: depth, depth: depth, collapsed: false, children: [] 
              };
            } else if (t === 'object') {
              if (Array.isArray(value)) {
                node = { 
                  id: ++quickIdCounter, k: key, type: 'array', 
                  dv: `Array(${value.length})`, 
                  d: depth, depth: depth, collapsed: false, 
                  children: [],
                  _raw: value,
                  _len: value.length,
                  _isArray: true
                };
              } else {
                const keys = Object.keys(value);
                node = { 
                  id: ++quickIdCounter, k: key, type: 'object', 
                  dv: `Object(${keys.length})`, 
                  d: depth, depth: depth, collapsed: false, 
                  children: [],
                  _raw: value,
                  _keys: keys,
                  _isArray: false
                };
              }
            } else {
              node = { id: ++quickIdCounter, k: key, type: 'number', dv: String(value), d: depth, depth: depth, collapsed: false, children: [] };
            }
            
            return node;
          }
          
          ensureChildren(rootNode, 5);
          
          // 获取前1000个可见节点
          const initialNodes = [];
          const stack = [{ node: rootNode, depth: 0 }];
          
          while (stack.length > 0 && initialNodes.length < 1000) {
            const { node, depth } = stack.pop();
            if (!node) continue;
            
            initialNodes.push({
              id: node.id,
              key: node.k,
              value: node.dv,
              type: node.type,
              depth: depth,
              collapsed: false,
              hasChildren: node.children && node.children.length > 0,
              displayValue: node.dv,
              childCount: node._len || node.children?.length || 0,
              fullValue: node.fv || node.dv
            });
            
            if (!node.collapsed && node.children) {
              for (let i = node.children.length - 1; i >= 0; i--) {
                if (initialNodes.length < 1000) {
                  stack.push({ node: node.children[i], depth: depth + 1 });
                }
              }
            }
          }
          
          visibleNodes.value = markRaw(initialNodes);
          // 只有当索引还没有设置节点总数时，才使用初始渲染的节点数
          if (totalNodes.value === 0) {
            totalNodes.value = initialNodes.length;
          }
        } catch (e) {
          console.warn('Quick parse failed:', e);
          visibleNodes.value = [];
          totalNodes.value = 0;
        }
        
        // 立即完成渲染可见区步骤
        const renderDuration = Math.round(performance.now() - renderStartTime);
        completeParseStep('render', `${totalNodes.value.toLocaleString()} 节点`, renderDuration);
        
        currentNodes = [];
      } else {
        // 没有Worker时的降级方案：异步分块展开，避免阻塞主线程
        let processedCount = 0;
        const queue = [rootNode];
        
        function processChunk() {
          const chunkSize = 100; // 每帧处理的节点数
          let count = 0;
          
          while (queue.length > 0 && count < chunkSize) {
            const node = queue.shift();
            if (!node) continue;
            
            node.collapsed = false;
            
            if (node._raw && !node.children) {
              const children = [];
              const keys = node._isArray ? Array.from({ length: node._raw.length }, (_, i) => i) : node._keys;
              
              for (let i = 0; i < keys.length; i++) {
                const key = node._isArray ? '[' + keys[i] + ']' : keys[i];
                const rawValue = node._raw[keys[i]];
                const child = createNodeFromRaw(rawValue, key, node.depth + 1);
                children.push(child);
                
                if (child._raw) {
                  queue.push(child);
                }
              }
              
              node.children = children;
              delete node._raw;
              delete node._keys;
              delete node._len;
              delete node._isArray;
            }
            
            processedCount++;
            count++;
          }
          
          if (queue.length > 0) {
            // 使用 requestAnimationFrame 让浏览器有时间渲染
            requestAnimationFrame(processChunk);
          } else {
            // 所有节点处理完成
            currentNodes = flattenTreeSyncOptimized(rootNode);
            visibleNodes.value = markRaw(currentNodes);
            warningMessage.value = warning;
            totalNodes.value = currentNodes.length;
            isParsing.value = false;
          }
        }
        
        // 开始异步分块处理
        requestAnimationFrame(processChunk);
      }
    }
    
    parseTime.value = Date.now() - startTime;
    
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

function initWorkers() {
  destroyWorkers();
  
  workers = [];
  for (let i = 0; i < WORKER_COUNT; i++) {
    const w = new Worker(workerUrl);
    w.onmessage = (e) => handleWorkerMessage(e, i);
    w.onerror = (err) => {
      errorMessage.value = err.message;
      parseStatus.value = 'error';
      isParsing.value = false;
    };
    w.onmessageerror = (err) => {
      errorMessage.value = 'Worker消息处理错误';
      parseStatus.value = 'error';
      isParsing.value = false;
    };
    workers.push(w);
  }
}

function destroyWorkers() {
  for (const w of workers) {
    try {
      w.terminate();
    } catch (e) {}
  }
  workers = [];
}

function handleWorkerMessage(e, workerIndex) {
  const { type, visibleNodes: nodes, totalNodes: cnt, parseTime: pt, tree, message, truncated, estimatedTotal, isComplete, progress, shardIndex, totalShards: msgTotalShards, lastId, start, end, lineCount, maxDepth, keyCount } = e.data;
  
  if (type === 'indexReady') {
    // 索引构建完成，使用索引分析出的节点总数
    totalNodes.value = cnt;
    completeParseStep('index', `${cnt.toLocaleString()} 节点`);
    return;
  }
  
  if (type === 'rangeResult') {
    workerTasks.delete(workerIndex);
    
    for (let i = 0; i < nodes.length; i++) {
      const globalPos = start + i;
      if (globalPos < globalResults.length) {
        globalResults[globalPos] = nodes[i];
      }
    }
    
    loadedCount = Math.max(loadedCount, end);
    
    updateVisibleArea();
    
    return;
  }
  
  if (type === 'shardResult') {
    pendingResults[shardIndex] = nodes;
    pendingResultCount++;
    
    parseProgress.value = Math.round((pendingResultCount / totalShards) * 100);
    
    if (pendingResultCount === totalShards) {
      const allNodes = pendingResults.flat();
      
      allNodes.sort((a, b) => a.id - b.id);
      
      totalNodes.value = allNodes.length;
      
      if (!visibleNodes.value || visibleNodes.value.length === 0) {
        visibleNodes.value = markRaw(allNodes);
      }
      
      const totalParseTime = performance.now() - backgroundParseStartTime;
      parseTime.value = totalParseTime;
      
      warningMessage.value = truncated ? '文件过大，已截断显示部分节点' : '';
      parseStatus.value = '';
      isParsing.value = false;
      
      if (currentFileId.value && visibleNodes.value && visibleNodes.value.length > 0) {
        parseCache.set(currentFileId.value, {
          visibleNodes: visibleNodes.value,
          jsonTree: tree || jsonTree.value,
          totalNodes: allNodes.length,
          warningMessage: warningMessage.value
        });
      }
      
      pendingResults = [];
      pendingResultCount = 0;
      totalShards = 0;
      
      stopMemoryMonitor();
    }
    return;
  }
  
  if (type === 'nodesReady') {
    if (e.data.nodes && e.data.nodes.length > 0) {
      const { nodes: receivedNodes, start, end, totalNodes: total } = e.data;
      
      if (!visibleNodes.value || visibleNodes.value.length === 0) {
        visibleNodes.value = markRaw(new Array(total));
      }
      
      for (let i = 0; i < receivedNodes.length; i++) {
        const pos = start + i;
        if (pos < visibleNodes.value.length) {
          visibleNodes.value[pos] = receivedNodes[i];
        }
      }
      
      visibleNodes.value = markRaw([...visibleNodes.value]);
      totalNodes.value = total;
    }
    return;
  }
  
  if (type === 'parsed') {
    if (nodes && nodes.length > 0) {
      if (!visibleNodes.value || visibleNodes.value.length === 0) {
        visibleNodes.value = markRaw([...nodes]);
      } else {
        visibleNodes.value = markRaw([...visibleNodes.value, ...nodes]);
      }
      totalNodes.value = cnt;
      
      if (progress !== undefined) {
        parseProgress.value = Math.round(progress * 100);
      }
    }
    
    if (isComplete) {
      if (pt) parseTime.value = pt;
      if (tree) jsonTree.value = tree;
      warningMessage.value = truncated ? '文件过大，已截断显示部分节点' : '';
      parseStatus.value = '';
      isParsing.value = false;
      stopMemoryMonitor();
      
      if (currentFileId.value && visibleNodes.value && visibleNodes.value.length > 0) {
        parseCache.set(currentFileId.value, {
          visibleNodes: visibleNodes.value,
          jsonTree: tree || jsonTree.value,
          totalNodes: cnt,
          warningMessage: warningMessage.value
        });
      }
    }
  } else if (type === 'toggled' || type === 'updated') {
    visibleNodes.value = markRaw(nodes);
    totalNodes.value = cnt;
    if (pt) parseTime.value = pt;
    if (tree) jsonTree.value = tree;
    warningMessage.value = truncated ? '文件过大，已截断显示部分节点' : '';
    parseStatus.value = '';
    isParsing.value = false;
    
    if (currentFileId.value && nodes && nodes.length > 0) {
      parseCache.set(currentFileId.value, {
        visibleNodes: nodes,
        jsonTree: tree || jsonTree.value,
        totalNodes: cnt,
        warningMessage: warningMessage.value
      });
    }
  } else if (type === 'subtree') {
    const { nodes: subtreeNodes, parentId } = e.data;
    if (subtreeNodes && subtreeNodes.length > 0) {
      const currentNodes = visibleNodes.value || [];
      const parentIndex = currentNodes.findIndex(n => n.id === parentId);
      if (parentIndex >= 0) {
        const newNodes = [...currentNodes];
        newNodes[parentIndex] = { ...newNodes[parentIndex], collapsed: false };
        const children = subtreeNodes.slice(1);
        newNodes.splice(parentIndex + 1, 0, ...children);
        visibleNodes.value = markRaw(newNodes);
        totalNodes.value = newNodes.length;
      }
    }
  } else if (type === 'error') {
    errorMessage.value = message;
    parseStatus.value = 'error';
    isParsing.value = false;
  }
}

function initWorker() {
  initWorkers();
  worker = workers[0];
}

function findTopLevelArrays(text) {
  const arrays = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let arrayStart = -1;
  let arrayKey = '';
  let keyStart = -1;
  
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    
    if (escape) {
      escape = false;
      continue;
    }
    
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    
    if (ch === '"') {
      if (!inString) {
        inString = true;
        keyStart = i;
      } else {
        inString = false;
        if (keyStart >= 0 && depth === 1) {
          arrayKey = text.substring(keyStart + 1, i);
          keyStart = -1;
        }
      }
      continue;
    }
    
    if (inString) continue;
    
    if (ch === '{') {
      depth++;
      continue;
    }
    
    if (ch === '}') {
      depth--;
      continue;
    }
    
    if (ch === '[') {
      if (depth === 1 && arrayStart === -1) {
        arrayStart = i;
      }
      depth++;
      continue;
    }
    
    if (ch === ']') {
      depth--;
      if (arrayStart >= 0 && depth === 1) {
        const slice = text.substring(arrayStart, i + 1);
        arrays.push({
          text: slice,
          key: arrayKey,
          start: arrayStart,
          end: i
        });
        arrayStart = -1;
        arrayKey = '';
      }
    }
  }
  
  return arrays;
}

function checkMemoryUsage() {
  if (!navigator.storage || !navigator.storage.estimate) {
    return { usage: 0, quota: MAX_MEMORY_USAGE };
  }
  
  return navigator.storage.estimate().then(estimate => {
    return {
      usage: estimate.usage || 0,
      quota: estimate.quota || MAX_MEMORY_USAGE
    };
  }).catch(() => {
    return { usage: 0, quota: MAX_MEMORY_USAGE };
  });
}

async function startMemoryMonitor() {
  if (memoryCheckTimer) {
    clearInterval(memoryCheckTimer);
  }
  
  memoryCheckTimer = setInterval(async () => {
    const memory = await checkMemoryUsage();
    
    if (memory.usage > MAX_MEMORY_USAGE) {
      if (!isMemoryWarning) {
        isMemoryWarning = true;
        warningMessage.value = '内存使用过高，正在优化...';
      }
      
      if (memory.usage > MAX_MEMORY_USAGE * 1.2) {
        abortBackgroundParse();
      }
    } else {
      isMemoryWarning = false;
    }
  }, MEMORY_CHECK_INTERVAL);
}

function stopMemoryMonitor() {
  if (memoryCheckTimer) {
    clearInterval(memoryCheckTimer);
    memoryCheckTimer = null;
  }
}

function abortBackgroundParse() {
  isParsing.value = false;
  
  for (const w of workers) {
    try {
      w.terminate();
    } catch (e) {}
  }
  
  workers = [];
  initWorkers();
  
  pendingResults = [];
  pendingResultCount = 0;
  totalShards = 0;
  
  warningMessage.value = '解析已中止，内存使用过高';
  parseStatus.value = '';
}

function startParallelParse(content) {
  if (!content || content.trim() === '') {
    errorMessage.value = '空内容';
    parseStatus.value = 'error';
    isParsing.value = false;
    return;
  }
  
  startMemoryMonitor();
  
  if (workers[0]) {
    workers[0].postMessage({ 
      type: 'buildIndexAndParse', 
      content: content,
      visibleCount: VISIBLE_NODE_COUNT,
      preloadCount: PRELOAD_NODE_COUNT
    });
  }
}

async function parseJSONContent(content, size, fileId = null, readDuration = 0) {
  try {
    let currentNodes;
    fileSize.value = size;
    isLargeFileMode.value = size > 50 * 1024 * 1024;
    parseStatus.value = 'parsing';
    errorMessage.value = '';
    currentFileText.value = content;
    
    const parseStartTime = Date.now();
    
    resetParseSteps();
    startParseStep('read');
    
    if (!streamingValidator) {
      streamingValidator = new StreamingValidator();
    }
    if (!errorHandler) {
      errorHandler = new ErrorHandler();
    }
    
    try {
      completeParseStep('read', `${(size / 1024 / 1024).toFixed(1)} MB`, readDuration);
      
      startParseStep('validate');
      const indexResult = streamingValidator.process(content);
      completeParseStep('validate', `${content.length.toLocaleString()} 字符`);
      
      startParseStep('index');
      if (!memoryIndex) {
        memoryIndex = new MemoryIndex();
      }
      // 转换 StreamingValidator 的输出格式为 MemoryIndex 期望的格式
      const indexData = {
        lines: indexResult.index.lineStarts,
        keys: indexResult.index.keys,
        keyPositions: indexResult.index.keyPos,
        keyLengths: indexResult.index.keyLen,
        structures: [],
        rootType: 'object',
        size: content.length
      };
      memoryIndex.loadFromStreamingIndex(indexData, content);
      
      if (searchController) {
        searchController.destroy();
      }
      searchController = new SearchController(memoryIndex, content);
      completeParseStep('index', `${memoryIndex.keyCount?.toLocaleString() || 0} 键名`);
      
      // ============================================
      // 优化策略：基于BlockCacheManager的按需加载
      // ============================================
      // 1. 先快速解析获取节点总数（用于Minimap和内容区域高度计算）
      // 2. 基于索引和节点总数绘制Minimap
      // 3. 初始化BlockCacheManager
      // 4. 加载第一个Block（可见区）
      // ============================================
      if (worker) {
        isUsingWorker.value = true;
        isParsing.value = true;
        
        const renderStartTime = performance.now();
        try {
          // 先快速解析获取节点总数（用于Minimap高度计算）
          const quickResult = parseAndCreateOptimized(content);
          if (!quickResult.error) {
            const { totalCount } = quickResult;
            
            // 使用真实的节点总数
            totalNodes.value = totalCount;
            
            // 基于索引和节点总数绘制Minimap
            startParseStep('minimap');
            const minimapStart = performance.now();
            requestAnimationFrame(() => {});
            const minimapDuration = Math.max(1, Math.round(performance.now() - minimapStart));
            completeParseStep('minimap', `${totalCount.toLocaleString()} 节点`, minimapDuration);
            
            startParseStep('render');
            
            // 初始化BlockCacheManager
            if (!blockCacheManager) {
              blockCacheManager = new BlockCacheManager({
                blockSize: 1000,
                maxActiveBlocks: 3,
                recycleThreshold: 2
              });
            }
            
            // 初始化缓存管理器
            blockCacheManager.initialize(memoryIndex, content, totalCount);
            
            // 设置回调函数
            blockCacheManager.onBlocksChanged = (nodes) => {
              visibleNodes.value = markRaw(nodes);
            };
            
            // 加载第一个Block（可见区）
            await blockCacheManager.loadBlocks(0, 2);
            
            // 获取初始可见节点
            const initialNodes = blockCacheManager.getActiveNodes();
            if (initialNodes.length > 0) {
              visibleNodes.value = markRaw(initialNodes);
            }
          }
        } catch (e) {
          console.warn('Quick parse failed:', e);
        }
        
        // 完成渲染可见区步骤
        const renderDuration = Math.round(performance.now() - renderStartTime);
        completeParseStep('render', `${totalNodes.value.toLocaleString()} 节点`, renderDuration);
        
        currentNodes = [];
        isParsing.value = false;
      } else {
        fallbackParse(content, size, Date.now(), fileId);
      }
      
    } catch (validationError) {
      if (validationError instanceof Error) {
        const errorInfo = errorHandler.handleValidationError(validationError, content);
        errorMessage.value = errorInfo.message;
        warningMessage.value = errorInfo.suggestion;
      } else {
        errorMessage.value = validationError.message || '解析失败';
      }
      parseStatus.value = 'error';
      isParsing.value = false;
    }
    
  } catch (err) {
    errorMessage.value = '解析初始化失败: ' + err.message;
    parseStatus.value = 'error';
    isParsing.value = false;
    console.error('Parse init error:', err);
  }
}

async function selectFile(fileId) {
  isParsing.value = false;
  currentFileId.value = fileId;
  const file = files.value.find(f => f.id === fileId);
  
  if (!file) return;
  
  file.lastOpen = Date.now();
  
  if (pendingParseTask) {
    clearTimeout(pendingParseTask);
    pendingParseTask = null;
  }
  
  destroyWorkers();
  
  await new Promise(resolve => setTimeout(resolve, 10));
  
  initWorkers();
  
  visibleNodes.value = [];
  jsonTree.value = null;
  errorMessage.value = '';
  warningMessage.value = '';
  totalNodes.value = 0;
  parseStatus.value = '';
  
  if (parseCache.has(fileId)) {
    const cached = parseCache.get(fileId);
    
    if (cached.visibleNodes && cached.visibleNodes.length > 0) {
      showConsole.value = true;
      visibleNodes.value = markRaw(cached.visibleNodes);
      jsonTree.value = cached.jsonTree;
      totalNodes.value = cached.visibleNodes.length;
      warningMessage.value = cached.warningMessage;
      parseStatus.value = '';
      return;
    } else {
      parseCache.delete(fileId);
    }
  }
  
  parseStatus.value = 'parsing';
  
  pendingParseTask = setTimeout(() => {
    parseJSONContent(file.content, file.size, fileId, file.readDuration);
    pendingParseTask = null;
  }, 50);
}

function handleDragOver(e) {
  e.preventDefault();
  isDragging.value = true;
}

function handleDragLeave(e) {
  e.preventDefault();
  isDragging.value = false;
}

function handleDrop(e) {
  e.preventDefault();
  isDragging.value = false;
  const droppedFiles = Array.from(e.dataTransfer.files);
  handleOpenFiles(droppedFiles);
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
  
  // 立即显示解析日志
  showConsole.value = true;
  
  let lastFileId = null;
  for (const file of fileList) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') continue;
    
    const readStartTime = performance.now();
    const content = await file.text();
    const readDuration = Math.round(performance.now() - readStartTime);
    const size = new Blob([content]).size;
    const fileData = {
      id: Date.now() + Math.random(),
      name: file.name,
      content,
      size,
      readDuration,
      lastOpen: Date.now()
    };
    
    const existingFile = files.value.find(f => f.name === file.name);
    if (existingFile) {
      existingFile.content = content;
      existingFile.size = size;
      existingFile.readDuration = readDuration;
      existingFile.lastOpen = Date.now();
      lastFileId = existingFile.id;
    } else {
      files.value.push(fileData);
      lastFileId = fileData.id;
    }
  }
  
  if (lastFileId) {
    selectFile(lastFileId);
  }
}

function deleteFileFromCache(fileId) {
  const index = files.value.findIndex(f => f.id === fileId);
  if (index > -1) {
    files.value.splice(index, 1);
    parseCache.delete(fileId);
    
    if (currentFileId.value === fileId) {
      isParsing.value = false;
      
      destroyWorkers();
      
      currentFileId.value = files.value.length > 0 ? files.value[0].id : null;
      visibleNodes.value = [];
      jsonTree.value = null;
      totalNodes.value = 0;
      fileSize.value = 0;
      parseTime.value = 0;
      warningMessage.value = '';
      errorMessage.value = '';
      parseStatus.value = '';
      
      if (currentFileId.value) {
        setTimeout(() => selectFile(currentFileId.value), 10);
      }
    }
  }
}

function clearCache() {
  isParsing.value = false;
  
  stopMemoryMonitor();
  
  destroyWorkers();
  
  if (pendingParseTask) {
    clearTimeout(pendingParseTask);
    pendingParseTask = null;
  }
  
  parseCache.clear();
  files.value = [];
  currentFileId.value = null;
  visibleNodes.value = [];
  jsonTree.value = null;
  totalNodes.value = 0;
  fileSize.value = 0;
  parseTime.value = 0;
  warningMessage.value = '';
  errorMessage.value = '';
  parseStatus.value = '';
}

function toggleNode(nodeId) {
  if (worker && !isParsing.value) {
    worker.postMessage({ type: 'toggle', nodeId });
  }
}

function expandAll() {
  if (worker && !isParsing.value) {
    worker.postMessage({ type: 'expandAll' });
  }
}

function collapseAll() {
  if (worker && !isParsing.value) {
    worker.postMessage({ type: 'collapseAll' });
  }
}

function toggleFormatCompress() {
  isTextMode.value = !isTextMode.value;
}

function toggleEscape() {
  isEscaped.value = !isEscaped.value;
}

function exportJSON() {
  if (!currentFile.value) return;
  
  let content = currentFile.value.content;
  if (!isTextMode.value) {
    try {
      const parsed = JSON.parse(content);
      content = JSON.stringify(parsed, null, 2);
    } catch (e) {
      console.error('Failed to format JSON:', e);
    }
  }
  
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFile.value.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatJSON() {
  if (!currentFile.value) return;
  
  try {
    const parsed = JSON.parse(currentFile.value.content);
    textContent.value = JSON.stringify(parsed, null, 2);
    isTextMode.value = true;
  } catch (e) {
    errorMessage.value = 'JSON 格式错误，无法格式化';
  }
}

function handleSearch(query) {
  searchQuery.value = query;
  
  if (query) {
    const matches = visibleNodes.value.filter(n => n && n.k && n.k.toLowerCase().includes(query.toLowerCase()));
    searchMatchCount.value = matches.length;
    searchMatchIndex.value = 0;
  } else {
    searchMatchCount.value = 0;
    searchMatchIndex.value = -1;
  }
}

function handleSearchNext() {
  if (searchMatchCount.value === 0) return;
  searchMatchIndex.value = (searchMatchIndex.value + 1) % searchMatchCount.value;
}

function handleSearchPrev() {
  if (searchMatchCount.value === 0) return;
  searchMatchIndex.value = (searchMatchIndex.value - 1 + searchMatchCount.value) % searchMatchCount.value;
}

function handleSelectNode(node) {
  selectedNode.value = node;
  showDetailPanel.value = true;
}

function handleUpdateValue({ nodeId, value }) {
  console.log('Update value:', nodeId, value);
}

function handlePasteContent(content) {
  try {
    JSON.parse(content);
    const fileData = {
      id: Date.now() + Math.random(),
      name: 'pasted.json',
      content,
      size: new Blob([content]).size,
      lastOpen: Date.now()
    };
    files.value.push(fileData);
    selectFile(fileData.id);
  } catch (e) {
    errorMessage.value = '粘贴的内容不是有效的 JSON';
  }
}

function copyPath(path) {
  navigator.clipboard.writeText(path);
}

function handleScroll(pos) {
  cursorPosition.value = pos;
}

function handleNeedNodes(start, end) {
  if (!blockCacheManager) return;
  
  const blockSize = blockCacheManager.blockSize;
  const startBlock = Math.max(0, Math.floor(start / blockSize) - 1);
  const endBlock = Math.ceil(end / blockSize) + 1;
  
  blockCacheManager.loadBlocks(startBlock, endBlock);
}

function toggleTheme() {
  document.documentElement.classList.toggle('dark');
}

function handleScrollToNode(nodeId) {
  console.log('Scroll to node:', nodeId);
}

const workerUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));

onMounted(() => {
  initWorker();
  
  const sampleContent = JSON.stringify(SAMPLE_JSON, null, 2);
  const sampleFile = {
    id: 1,
    name: 'sample.json',
    content: sampleContent,
    size: new Blob([sampleContent]).size,
    lastOpen: Date.now()
  };
  files.value.push(sampleFile);
  selectFile(1);
});

onUnmounted(() => {
  stopMemoryMonitor();
  destroyWorkers();
  URL.revokeObjectURL(workerUrl);
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

    <ParseProgress
      :progress="parseProgress"
      :current-step="currentStep"
      :is-parsing="isParsing"
    />

    <div class="app-layout">
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
          v-show="!isTextMode && (parseStatus !== 'parsing' || visibleNodes.length > 0)"
          ref="containerRef"
          :visibleNodes="filteredVisibleNodes"
          :totalNodes="totalNodes"
          :searchQuery="searchQuery"
          :currentFile="currentFile"
          :parseStatus="parseStatus"
          :errorMessage="errorMessage"
          :searchMatchIndex="searchMatchIndex"
          :searchMatchCount="searchMatchCount"
          :memory-index="memoryIndex"
          :current-file-text="currentFileText"
          :onNeedNodes="handleNeedNodes"
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
    </div> <!-- .main-content -->

    <ConsolePanel
      :steps="parseSteps"
      :is-expanded="showConsole"
      :background-progress="backgroundProgress"
      :total-nodes="totalNodes"
      @toggle="showConsole = !showConsole"
      @copy="copyLog"
      @background="runInBackground"
      @clear="clearLog"
    />

    <footer class="app-footer">
      <StatusBar
        :fileSize="fileSize"
        :totalNodes="totalNodes"
        :parseTime="parseTime"
        :is-parsing="isParsing"
        :parse-status="parseStatus"
      />
    </footer> <!-- .app-footer -->
  </div> <!-- .app-layout -->
  
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
  </div> <!-- .app -->
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  color: #333333;
  overflow: hidden;
}

.title-bar {
  height: 40px;
  background: #ffffff;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo-icon {
  color: #4a90d9;
}

.logo-text {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.logo-pro {
  color: #4a90d9;
}

.title-separator {
  color: #ccc;
}

.doc-title {
  font-size: 13px;
  color: #666;
}

.title-center {
  display: flex;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: all 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #f5f5f5;
  border-color: #ccc;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon {
  flex-shrink: 0;
}

.title-right {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}

.icon-btn:hover {
  background: #f0f0f0;
  color: #333;
}

.app-layout {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.app-footer {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-height: 28px;
  background: #f8f9fa;
  border-top: 1px solid #dadce0;
}

.console-tabs-container {
  border-top: 1px solid #e0e0e0;
  background: #f8f9fa;
}

.console-tabs {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid #e0e0e0;
}

.console-tab {
  padding: 4px 12px;
  font-size: 12px;
  color: #5f6368;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.console-tab:hover {
  background: #e8eaed;
}

.console-tab.active {
  background: #e0e0e0;
  color: #202124;
}

.console-tab-content {
  max-height: 120px;
  overflow-y: auto;
}

.editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #ffffff;
}

.text-view {
  flex: 1;
  overflow: hidden;
}

.text-content {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  padding: 16px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: #333;
  background: #ffffff;
  box-sizing: border-box;
}

.drag-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(74, 144, 217, 0.1);
  border: 2px dashed #4a90d9;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.drag-message {
  font-size: 20px;
  color: #4a90d9;
  font-weight: 500;
}

</style>