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

// 基于索引绘制完整的Minimap
function drawFromIndex(ctx, width, height, rowHeight, totalNodes, barWidth) {
  const index = props.memoryIndex
  const content = props.content
  
  if (!index || !content) return
  
  const effectiveSampleCount = Math.min(totalNodes, MAX_NODES_TO_RENDER)
  const step = Math.max(1, Math.floor(totalNodes / effectiveSampleCount))
  
  // 使用索引中的键信息来绘制
  const keyCount = index.keyCount || 0
  const lineCount = index.lineCount || 0
  
  // 为每一行创建一个深度和类型的映射
  const lineInfo = new Map()
  
  // 从结构信息中获取深度变化
  for (let i = 0; i < index.structureCount; i++) {
    const s = index.structures[i]
    const structLine = s >>> 16
    const depth = (s >> 8) & 0xFF
    const action = s & 1 // 0 = open, 1 = close
    
    if (!lineInfo.has(structLine)) {
      lineInfo.set(structLine, { depth: 0, isObject: false, isArray: false })
    }
  }
  
  // 从键信息中获取每一行的深度
  for (let i = 0; i < keyCount; i++) {
    const keyLine = index.keys[i] >>> 8
    const depth = index.keys[i] & 0xFF
    
    if (!lineInfo.has(keyLine)) {
      lineInfo.set(keyLine, { depth: depth, isObject: false, isArray: false })
    } else {
      const info = lineInfo.get(keyLine)
      info.depth = depth
    }
  }
  
  // 扫描内容来确定每一行的类型
  let currentLine = 1
  let currentDepth = 0
  
  for (let i = 0; i < content.length && currentLine <= lineCount; i++) {
    if (content[i] === '\n') {
      currentLine++
      continue
    }
    
    if (content[i] === '{') {
      currentDepth++
      if (!lineInfo.has(currentLine)) {
        lineInfo.set(currentLine, { depth: currentDepth, isObject: true, isArray: false })
      } else {
        const info = lineInfo.get(currentLine)
        info.isObject = true
        info.depth = currentDepth
      }
    } else if (content[i] === '}') {
      currentDepth--
    } else if (content[i] === '[') {
      currentDepth++
      if (!lineInfo.has(currentLine)) {
        lineInfo.set(currentLine, { depth: currentDepth, isObject: false, isArray: true })
      } else {
        const info = lineInfo.get(currentLine)
        info.isArray = true
        info.depth = currentDepth
      }
    } else if (content[i] === ']') {
      currentDepth--
    }
  }
  
  // 绘制采样的行
  for (let i = 0; i < totalNodes; i += step) {
    const lineNum = Math.min(Math.floor(i * lineCount / totalNodes) + 1, lineCount)
    const info = lineInfo.get(lineNum)
    
    let depthOffset = 0
    let color = '#b5cea8'
    let alpha = 0.4
    
    if (info) {
      depthOffset = Math.min(info.depth * 2, width * 0.35)
      
      if (info.isObject || info.isArray) {
        color = '#569cd6'
        alpha = 0.5
      } else {
        // 尝试检测值类型
        const lineStart = index.getLineStart(lineNum)
        const lineEnd = index.getLineEnd(lineNum)
        if (lineStart >= 0 && lineEnd > lineStart) {
          const lineText = content.substring(lineStart, lineEnd).trim()
          if (lineText.startsWith('"')) {
            color = '#ce9178'
            alpha = 0.6
          } else if (!isNaN(parseFloat(lineText))) {
            color = '#89d185'
            alpha = 0.6
          } else if (lineText === 'true' || lineText === 'false') {
            color = '#569cd6'
            alpha = 0.5
          } else if (lineText === 'null') {
            color = '#569cd6'
            alpha = 0.4
          }
        }
      }
    }
    
    const y = i * rowHeight
    const h = Math.min(step * rowHeight, 3)
    
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fillRect(4 + depthOffset, y, barWidth - depthOffset, h)
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