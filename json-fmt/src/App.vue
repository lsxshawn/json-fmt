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
import { StreamingValidator, MemoryIndex, SearchController, ErrorHandler } from '@/core/index.js';
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

const parsingPhase = ref('');
const parsingProgress = ref(0);
const currentFileText = ref('');
const isLargeFileMode = ref(false);

const currentStep = ref('');
const parseProgress = ref(0);
const showConsole = ref(false);
const selectedNode = ref(null);
const activeConsoleTab = ref('logs');
const parseSteps = ref([
  { id: 'read', message: '读取文件', detail: '', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'validate', message: '流式校验', detail: '检查括号匹配...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'index', message: '构建索引', detail: '扫描键名和结构...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'render', message: '渲染可见区', detail: '格式化前30行...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
  { id: 'background', message: '后台格式化', detail: '处理剩余区域...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 }
]);

const backgroundProgress = ref(0);
let autoCollapseTimer = null;

let streamingValidator = null;
let memoryIndex = null;
let searchController = null;
let errorHandler = null;

const showDetailPanel = ref(false);
const searchQuery = ref('');
const isDragging = ref(false);
const cursorPosition = ref({ line: 1, column: 1 });

const showCommandPalette = ref(false);
const isTextMode = ref(false);
const textContent = ref('');
const fileInputRef = ref(null);

function resetParseSteps() {
  parseSteps.value = [
    { id: 'read', message: '读取文件', detail: '', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'validate', message: '流式校验', detail: '检查括号匹配...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'index', message: '构建索引', detail: '扫描键名和结构...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'render', message: '渲染可见区', detail: '格式化前30行...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 },
    { id: 'background', message: '后台格式化', detail: '处理剩余区域...', done: false, active: false, startTime: 0, endTime: 0, duration: 0 }
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

function completeParseStep(stepId, detail = '') {
  const step = parseSteps.value.find(s => s.id === stepId);
  if (step) {
    step.active = false;
    step.done = true;
    step.endTime = performance.now();
    step.duration = Math.round(step.endTime - step.startTime);
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

function parseAndExpandAllFast(text) {
  try {
    self.postMessage({ type: 'parseStart' });
    
    const startTime = performance.now();
    
    const result = parseJSONToFlatArray(text);
    const parseTime = performance.now() - startTime;
    
    self.postMessage({
      type: 'parsed',
      visibleNodes: result.nodes,
      totalNodes: result.total,
      parseTime: parseTime,
      truncated: result.truncated
    });
    
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message });
  }
}

self.onmessage = function(e) {
  const { type, data, nodeId } = e.data;
  
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
    case 'parseAndExpandAll':
      parseAndExpandAllFast(data);
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
  nodes.forEach(node => {
    if (node.type === 4 || node.type === 5) {
      node.collapsed = node.c !== undefined ? node.c : true;
    } else {
      node.collapsed = false;
    }
    delete node.c;
    delete node.d;
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
    const { type, visibleNodes: nodes, totalNodes: cnt, parseTime: pt, tree, message, truncated, estimatedTotal } = e.data;
    
    if (type === 'parsed' || type === 'toggled' || type === 'updated') {
      updateParseStep('render', `${cnt.toLocaleString()} 节点`, true);
      updateParseStep('background', '完成', true);
      
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
      
      completeParseStep('render', `${cnt.toLocaleString()} 节点`);
      completeParseStep('background', '完成');
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
  };
  worker.onerror = (err) => {
    errorMessage.value = err.message;
    parseStatus.value = 'error';
    isParsing.value = false;
  };
  worker.onmessageerror = (err) => {
    errorMessage.value = 'Worker消息处理错误';
    parseStatus.value = 'error';
    isParsing.value = false;
  };
}

function parseJSONContent(content, size, fileId = null) {
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
      completeParseStep('read', `${(size / 1024 / 1024).toFixed(1)} MB`);
      
      startParseStep('validate');
      const indexResult = streamingValidator.process(content);
      completeParseStep('validate', `${content.length.toLocaleString()} 字符`);
      
      startParseStep('index');
      if (!memoryIndex) {
        memoryIndex = new MemoryIndex();
      }
      memoryIndex.loadFromStreamingIndex(indexResult, content);
      
      if (searchController) {
        searchController.destroy();
      }
      searchController = new SearchController(memoryIndex, content);
      completeParseStep('index', `${memoryIndex.keyCount?.toLocaleString() || 0} 键名`);
      
      startParseStep('render');
      
      if (worker) {
        isUsingWorker.value = true;
        isParsing.value = true;
        visibleNodes.value = [];
        totalNodes.value = 0;
        worker.postMessage({ type: 'parseAndExpandAll', data: content });
        currentNodes = [];
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
  
  const oldWorker = worker;
  worker = null;
  
  if (oldWorker) {
    try {
      oldWorker.terminate();
    } catch (e) {
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 10));
  
  initWorker();
  
  visibleNodes.value = [];
  jsonTree.value = null;
  errorMessage.value = '';
  warningMessage.value = '';
  totalNodes.value = 0;
  parseStatus.value = '';
  
  if (parseCache.has(fileId)) {
    const cached = parseCache.get(fileId);
    
    if (cached.visibleNodes && cached.visibleNodes.length > 0) {
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
    parseJSONContent(file.content, file.size, fileId);
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
  let lastFileId = null;
  for (const file of fileList) {
    if (!file.name.endsWith('.json') && file.type !== 'application/json') continue;
    
    const content = await file.text();
    const size = new Blob([content]).size;
    const fileData = {
      id: Date.now() + Math.random(),
      name: file.name,
      content,
      size,
      lastOpen: Date.now()
    };
    
    const existingFile = files.value.find(f => f.name === file.name);
    if (existingFile) {
      existingFile.content = content;
      existingFile.size = size;
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
      
      if (worker) {
        try {
          worker.terminate();
          worker = null;
        } catch (e) {
        }
      }
      
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
  
  if (worker) {
    try {
      worker.terminate();
      worker = null;
    } catch (e) {
      console.warn('Failed to terminate worker:', e);
    }
  }
  
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
  if (worker) {
    worker.terminate();
  }
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
        <SkeletonLoader
          v-if="parseStatus === 'parsing' && !errorMessage"
          :loading="parseStatus === 'parsing'"
          :status-text="parsingPhase"
          :progress="parsingProgress"
        />
        <JsonTreeView
          v-show="!isTextMode && parseStatus !== 'parsing'"
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