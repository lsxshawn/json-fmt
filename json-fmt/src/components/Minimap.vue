<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  visibleNodes: {
    type: Array,
    default: () => []
  },
  totalNodes: {
    type: Number,
    default: 0
  },
  scrollTop: {
    type: Number,
    default: 0
  },
  viewportHeight: {
    type: Number,
    default: 600
  },
  totalHeight: {
    type: Number,
    default: 1000
  },
  isParsing: {
    type: Boolean,
    default: false
  },
  memoryIndex: {
    type: Object,
    default: null
  },
  content: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['jump'])

const minimapRef = ref(null)
const canvasRef = ref(null)
const isDragging = ref(false)

let renderFrameId = null
let isRendering = false
let lastRenderTime = 0
let loadingAnimationFrameId = null

const effectiveTotalHeight = computed(() => {
  const count = props.totalNodes > 0 ? props.totalNodes : props.visibleNodes.length
  return count * 28
})

const maxScroll = computed(() => Math.max(0, effectiveTotalHeight.value - props.viewportHeight))

const scrollRatio = computed(() => {
  if (maxScroll.value <= 0) return 0
  return Math.min(props.scrollTop / maxScroll.value, 1)
})

const sliderStyle = computed(() => {
  const viewportRatio = Math.min(props.viewportHeight / effectiveTotalHeight.value, 1)
  const viewportPercent = viewportRatio * 96
  const maxTop = 96 - viewportPercent
  const top = scrollRatio.value * maxTop
  
  return {
    top: `${Math.max(0, Math.min(top, maxTop))}%`,
    height: `${Math.max(viewportPercent, 3)}%`,
    minHeight: '12px'
  }
})

const MAX_NODES_TO_RENDER = 2000
const RENDER_THROTTLE_MS = 32

function scheduleDrawMinimap() {
  const now = performance.now()
  if (now - lastRenderTime < RENDER_THROTTLE_MS) {
    if (!renderFrameId) {
      renderFrameId = requestAnimationFrame(() => {
        renderFrameId = null
        drawMinimap()
      })
    }
    return
  }
  lastRenderTime = now
  drawMinimap()
}

function drawMinimap() {
  if (isRendering) return
  isRendering = true
  
  try {
    const canvas = canvasRef.value
    if (!canvas) return
    
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    
    canvas.width = (rect.width - 8) * dpr
    canvas.height = rect.height * dpr
    
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    
    const width = rect.width - 8
    const height = rect.height
    
    ctx.clearRect(0, 0, width, height)
    
    const bgColor = getComputedStyle(canvas).getPropertyValue('--bg-primary') || '#0d0d15'
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)
    
    if (!props.visibleNodes || props.visibleNodes.length === 0) {
      // ============================================
      // 当没有数据时，根据parseStatus决定显示内容
      // - parsing状态：显示加载动画
      // - 其他状态：不显示任何内容（保持空白）
      // ============================================
      if (props.isParsing) {
        const centerX = width / 2
        const centerY = height / 2
        const radius = 8
        const lineWidth = 2
        
        ctx.strokeStyle = '#4a90d9'
        ctx.lineWidth = lineWidth
        ctx.lineCap = 'round'
        
        const time = Date.now() / 1000
        const startAngle = -Math.PI / 2
        const endAngle = startAngle + (Math.PI * 2 * (time % 1))
        
        ctx.beginPath()
        ctx.arc(centerX, centerY, radius, startAngle, endAngle)
        ctx.stroke()
        
        ctx.fillStyle = '#666'
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText('Loading...', width / 2, height / 2 + 20)
        
        // 持续更新加载动画
        loadingAnimationFrameId = requestAnimationFrame(() => {
          loadingAnimationFrameId = null
          drawMinimap()
        })
      }
      // 非解析状态：保持空白，不显示任何内容
      return
    }
    
    const totalCount = props.totalNodes > 0 ? props.totalNodes : props.visibleNodes.length
    const rowHeight = height / Math.max(1, totalCount)
    
    if (totalCount > MAX_NODES_TO_RENDER) {
      drawSampledOptimized(ctx, width, height, rowHeight, totalCount)
    } else {
      drawDetailed(ctx, width, height, rowHeight)
    }
  } finally {
    isRendering = false
  }
}

function drawSampledOptimized(ctx, width, height, rowHeight, totalNodes) {
  const barWidth = Math.max(width - 8, 2)
  
  // 如果有memoryIndex，基于索引绘制完整的Minimap
  if (props.memoryIndex && props.content) {
    drawFromIndex(ctx, width, height, rowHeight, totalNodes, barWidth)
    return
  }
  
  // 回退到使用visibleNodes
  const nodes = props.visibleNodes
  const effectiveSampleCount = Math.min(totalNodes, MAX_NODES_TO_RENDER)
  const step = Math.max(1, Math.floor(totalNodes / effectiveSampleCount))
  
  for (let i = 0; i < totalNodes; i += step) {
    const node = nodes[i]
    if (!node) continue
    
    const y = i * rowHeight
    const h = Math.min(step * rowHeight, 3)
    
    const depthOffset = Math.min((node.depth || 0) * 2, width * 0.35)
    
    const colorInfo = getColorForNode(node)
    
    ctx.fillRect(4 + depthOffset, y, barWidth - depthOffset, h)
  }
  
  ctx.globalAlpha = 1
}

// 根据节点类型获取颜色
function getColorForNode(node) {
  let color = '#b5cea8'
  let alpha = 0.6
  
  if (node.type === 4 || node.type === 5 || node.type === 'array' || node.type === 'object') {
    color = '#569cd6'
    alpha = 0.4
  } else if (node.type === 3 || node.type === 'string') {
    color = '#ce9178'
    alpha = 0.7
  } else if (node.type === 2 || node.type === 'number') {
    color = '#89d185'
    alpha = 0.7
  } else if (node.type === 1 || node.type === 0 || node.type === 'boolean' || node.type === 'null') {
    color = '#569cd6'
    alpha = 0.6
  }
  
  return { color, alpha }
}

// 值类型常量
const TYPE_OBJECT = 0
const TYPE_ARRAY = 1
const TYPE_STRING = 2
const TYPE_NUMBER = 3
const TYPE_BOOLEAN = 4
const TYPE_NULL = 5
const TYPE_OTHER = 6

// 类型颜色映射
const TYPE_COLORS = [
  '#569cd6',  // 对象 - 蓝
  '#4ec9b0',  // 数组 - 青绿
  '#ce9178',  // 字符串 - 橙
  '#b5cea8',  // 数字 - 绿
  '#569cd6',  // 布尔 - 蓝
  '#80868b',  // null - 灰
  '#5a5a6e'   // 其他 - 深灰
]

// 值类型缓存
let lineTypes = null

// 根据索引和内容快速判断值类型
function detectValueType(index, content, keyIdx) {
  if (keyIdx < 0 || keyIdx >= index.keyCount) return TYPE_OTHER
  
  // 支持两种字段名：keyPos/keyLen (StreamingValidator) 和 keyPositions/keyLengths (App.vue)
  const keyPos = (index.keyPos && index.keyPos[keyIdx]) !== undefined 
    ? index.keyPos[keyIdx] 
    : (index.keyPositions ? index.keyPositions[keyIdx] : 0)
  const keyLen = (index.keyLen && index.keyLen[keyIdx]) !== undefined 
    ? index.keyLen[keyIdx] 
    : (index.keyLengths ? index.keyLengths[keyIdx] : 0)
  
  if (keyPos === 0 && keyLen === 0) return TYPE_OTHER
  
  // 找到冒号后的值起始位置（跳过键名、引号、冒号和空格）
  let valPos = keyPos + keyLen + 1
  while (valPos < content.length) {
    const c = content[valPos]
    if (c === ':' || c === ' ' || c === '\t' || c === '\n') {
      valPos++
    } else {
      break
    }
  }
  
  if (valPos >= content.length) return TYPE_OTHER
  
  const firstChar = content[valPos]
  
  if (firstChar === '{') return TYPE_OBJECT
  if (firstChar === '[') return TYPE_ARRAY
  if (firstChar === '"') return TYPE_STRING
  if (firstChar === 't' || firstChar === 'f') return TYPE_BOOLEAN
  if (firstChar === 'n') return TYPE_NULL
  if (firstChar === '-' || (firstChar >= '0' && firstChar <= '9')) return TYPE_NUMBER
  
  return TYPE_OTHER
}

// 二分查找给定行号对应的键索引
function findKeyIndexForLine(index, targetLine) {
  let left = 0
  let right = index.keyCount - 1
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const line = index.keys[mid] >>> 8
    
    if (line === targetLine) return mid
    if (line < targetLine) left = mid + 1
    else right = mid - 1
  }
  
  return -1
}

// 基于索引绘制完整的Minimap（优化版）
function drawFromIndex(ctx, width, height, rowHeight, totalNodes, barWidth) {
  const index = props.memoryIndex
  const content = props.content
  
  if (!index || !content) return
  
  const keyCount = index.keyCount || 0
  const lineCount = index.lineCount || 0
  
  if (keyCount === 0 || lineCount === 0) return
  
  // 使用键索引直接映射到高度，确保内容均匀分布
  const sampleCount = Math.min(keyCount, MAX_NODES_TO_RENDER)
  
  for (let j = 0; j < sampleCount; j++) {
    // 均匀采样
    const i = Math.floor((j / sampleCount) * keyCount)
    
    // 获取键的行号和深度
    const keyInfo = index.keys[i]
    const depth = keyInfo & 0xFF  // 深度始终在低8位
    
    // 获取键的位置和长度
    const keyPos = (index.keyPos && index.keyPos[i]) !== undefined 
      ? index.keyPos[i] 
      : (index.keyPositions ? index.keyPositions[i] : 0)
    const keyLen = (index.keyLen && index.keyLen[i]) !== undefined 
      ? index.keyLen[i] 
      : (index.keyLengths ? index.keyLengths[i] : 0)
    
    // 跳过无效键
    if (keyPos === 0 && keyLen === 0) continue
    
    // 找到冒号后的值起始位置
    let valPos = keyPos + keyLen + 1
    while (valPos < content.length) {
      const c = content[valPos]
      if (c === ':' || c === ' ' || c === '\t' || c === '\n') {
        valPos++
      } else {
        break
      }
    }
    
    // 判断值类型
    let type = TYPE_OTHER
    if (valPos < content.length) {
      const firstChar = content[valPos]
      if (firstChar === '{') type = TYPE_OBJECT
      else if (firstChar === '[') type = TYPE_ARRAY
      else if (firstChar === '"') type = TYPE_STRING
      else if (firstChar === 't' || firstChar === 'f') type = TYPE_BOOLEAN
      else if (firstChar === 'n') type = TYPE_NULL
      else if (firstChar === '-' || (firstChar >= '0' && firstChar <= '9')) type = TYPE_NUMBER
    }
    
    // 使用键索引直接映射到 minimap 高度（0 ~ height）
    const color = TYPE_COLORS[type]
    const y = (i / keyCount) * height
    const h = Math.max(height / keyCount, 1)
    const xOffset = Math.min(depth * 1.5, width * 0.3)
    
    ctx.fillStyle = color
    ctx.globalAlpha = 0.7
    ctx.fillRect(xOffset, y, width - xOffset, h)
  }
  
  ctx.globalAlpha = 1
}

function drawHeatmap(ctx, width, height, nodes) {
  const bucketCount = Math.min(50, height)
  const bucketSize = nodes.length / bucketCount
  
  for (let i = 0; i < bucketCount; i++) {
    const startIdx = Math.floor(i * bucketSize)
    const endIdx = Math.floor((i + 1) * bucketSize)
    
    let objCount = 0
    let strCount = 0
    let numCount = 0
    
    for (let j = startIdx; j < endIdx && j < nodes.length; j++) {
      const node = nodes[j]
      if (!node || !node.type) continue
      if (node.type === 'object' || node.type === 'array' || node.type === 'object_start' || node.type === 'array_start') {
        objCount++
      } else if (node.type === 'string') {
        strCount++
      } else if (node.type === 'number') {
        numCount++
      }
    }
    
    const total = endIdx - startIdx
    const objRatio = total > 0 ? objCount / total : 0
    const strRatio = total > 0 ? strCount / total : 0
    const numRatio = total > 0 ? numCount / total : 0
    
    let r, g, b
    if (strRatio > 0.5) {
      r = Math.floor(206)
      g = Math.floor(145)
      b = Math.floor(120)
    } else if (numRatio > 0.5) {
      r = Math.floor(137)
      g = Math.floor(209)
      b = Math.floor(133)
    } else if (objRatio > 0.5) {
      r = Math.floor(86)
      g = Math.floor(156)
      b = Math.floor(214)
    } else {
      r = Math.floor(181)
      g = Math.floor(206)
      b = Math.floor(168)
    }
    
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.5)`
    ctx.fillRect(4, (i / bucketCount) * height, width - 8, height / bucketCount)
  }
  
  ctx.globalAlpha = 1
}

function drawSampled(ctx, width, height, rowHeight) {
  drawSampledOptimized(ctx, width, height, rowHeight, props.visibleNodes.length)
}

function drawDetailed(ctx, width, height, rowHeight) {
  props.visibleNodes.forEach((node, index) => {
    const y = index * rowHeight
    const h = Math.max(rowHeight, 1.5)
    
    const depthOffset = Math.min(node.depth * 3, width * 0.35)
    
    let color = '#b5cea8'
    let alpha = 0.6
    
    if (node.type === 4 || node.type === 5 || node.type === 'array' || node.type === 'object') {
      color = '#569cd6'
      alpha = 0.4
    } else if (node.type === 3 || node.type === 'string') {
      color = '#ce9178'
      alpha = 0.7
    } else if (node.type === 2 || node.type === 'number') {
      color = '#89d185'
      alpha = 0.7
    } else if (node.type === 1 || node.type === 0 || node.type === 'boolean' || node.type === 'null') {
      color = '#569cd6'
      alpha = 0.6
    }
    
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fillRect(4 + depthOffset, y, Math.max(width - depthOffset - 8, 2), h)
  })
  
  ctx.globalAlpha = 1
}

function handleClick(e) {
  const rect = e.currentTarget.querySelector('.minimap-content').getBoundingClientRect()
  const y = e.clientY - rect.top
  const ratio = Math.max(0, Math.min(y / rect.height, 1))
  
  const scrollTarget = ratio * maxScroll.value
  emit('jump', scrollTarget)
}

function startDrag(e) {
  e.stopPropagation()
  e.preventDefault()
  isDragging.value = true
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

function onDrag(e) {
  if (!isDragging.value || !minimapRef.value) return
  
  const contentRect = minimapRef.value.querySelector('.minimap-content').getBoundingClientRect()
  const y = Math.max(0, Math.min(e.clientY - contentRect.top, contentRect.height))
  const ratio = y / contentRect.height
  
  const scrollTarget = ratio * maxScroll.value
  
  emit('jump', scrollTarget)
}

function stopDrag() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

watch(() => props.visibleNodes, () => {
  scheduleDrawMinimap()
}, { deep: true })

watch(() => props.totalHeight, () => {
  scheduleDrawMinimap()
})

watch(() => props.totalNodes, () => {
  scheduleDrawMinimap()
})

onMounted(() => {
  scheduleDrawMinimap()
})

onUnmounted(() => {
  if (renderFrameId) {
    cancelAnimationFrame(renderFrameId)
    renderFrameId = null
  }
  // ============================================
  // 取消加载动画
  // ============================================
  if (loadingAnimationFrameId) {
    cancelAnimationFrame(loadingAnimationFrameId)
    loadingAnimationFrameId = null
  }
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
})
</script>

<template>
  <div class="minimap-wrapper">
    <div ref="minimapRef" class="minimap" @click="handleClick">
      <div class="minimap-content">
        <canvas ref="canvasRef" class="minimap-canvas"></canvas>
      </div>
      <div
        class="minimap-slider"
        :style="sliderStyle"
        @mousedown="startDrag"
      >
        <div class="slider-overlay"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.minimap-wrapper {
  width: 80px;
  flex-shrink: 0;
  height: 100%;
}

.minimap {
  width: 100%;
  height: 100%;
  background: #0d0d15;
  border-left: 1px solid #1e1e2e;
  padding: 4px 0;
  position: relative;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
}

.minimap-content {
  position: absolute;
  top: 4px;
  left: 0;
  right: 0;
  bottom: 4px;
  height: calc(100% - 8px);
}

.minimap-canvas {
  width: 100%;
  height: 100%;
}

.minimap-slider {
  position: absolute;
  left: 2px;
  right: 2px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 2px;
  cursor: ns-resize;
  z-index: 100;
  pointer-events: auto;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.1);
}

.slider-overlay {
  position: absolute;
  inset: 0;
  background: rgba(86, 156, 214, 0.08);
  border-radius: 2px;
}

.minimap-slider:hover {
  background: rgba(255, 255, 255, 0.25);
  border-color: rgba(255, 255, 255, 0.6);
}

.minimap-slider:active {
  background: rgba(255, 255, 255, 0.3);
}

[data-theme="light"] .minimap {
  background: #f1f3f4;
  border-left: 1px solid #e5e5e5;
}

[data-theme="light"] .minimap-slider {
  border-color: rgba(0, 0, 0, 0.2);
  background: rgba(0, 0, 0, 0.05);
}

[data-theme="light"] .minimap-slider:hover {
  background: rgba(0, 0, 0, 0.1);
}

[data-theme="light"] .slider-overlay {
  background: rgba(26, 115, 232, 0.15);
}
</style>