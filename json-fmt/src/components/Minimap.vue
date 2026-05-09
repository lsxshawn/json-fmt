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
  const viewportPercent = viewportRatio * 100
  const maxTop = 100 - viewportPercent
  const top = scrollRatio.value * maxTop
  
  return {
    top: `${Math.max(0, Math.min(top, maxTop))}%`,
    height: `${Math.max(viewportPercent, 2)}%`,
    minHeight: '8px'
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
    
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    
    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)
    
    const width = rect.width
    const height = rect.height
    
    ctx.clearRect(0, 0, width, height)
    
    // 背景 - 极淡靛蓝
    ctx.fillStyle = 'var(--minimap-bg)'
    ctx.fillRect(0, 0, width, height)
    
    if (!props.visibleNodes || props.visibleNodes.length === 0) {
      if (props.isParsing) {
        drawLoading(ctx, width, height)
      }
      return
    }
    
    const totalCount = props.totalNodes > 0 ? props.totalNodes : props.visibleNodes.length
    const rowHeight = height / Math.max(1, totalCount)
    
    if (totalCount > MAX_NODES_TO_RENDER) {
      drawSampledOptimized(ctx, width, height, rowHeight, totalCount)
    } else {
      drawDetailed(ctx, width, height, rowHeight)
    }
    
    // 顶部和底部渐变遮罩 - 融入背景（使用白色，因为 Canvas 不支持 CSS 变量）
    const gradientTop = ctx.createLinearGradient(0, 0, 0, 10)
    gradientTop.addColorStop(0, 'rgba(255, 255, 255, 1)')
    gradientTop.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.fillStyle = gradientTop
    ctx.fillRect(0, 0, width, 10)
    
    const gradientBottom = ctx.createLinearGradient(0, height - 10, 0, height)
    gradientBottom.addColorStop(0, 'rgba(255, 255, 255, 0)')
    gradientBottom.addColorStop(1, 'rgba(255, 255, 255, 1)')
    ctx.fillStyle = gradientBottom
    ctx.fillRect(0, height - 10, width, 10)
    
  } finally {
    isRendering = false
  }
}

function drawLoading(ctx, width, height) {
  const centerX = width / 2
  const centerY = height / 2
  
  // 脉冲光点
  const time = Date.now() / 1000
  const alpha = 0.3 + Math.sin(time * 3) * 0.2
  
  ctx.beginPath()
  ctx.arc(centerX, centerY, 3, 0, Math.PI * 2)
  ctx.fillStyle = '#6366f1'  /* 靛蓝 */
  ctx.globalAlpha = alpha
  ctx.fill()
  ctx.globalAlpha = 1
  
  loadingAnimationFrameId = requestAnimationFrame(() => {
    loadingAnimationFrameId = null
    drawMinimap()
  })
}

// 根据深度获取靛蓝色（透明度变化）- 边缘纹理效果
// 使用固定的靛蓝颜色值，因为 Canvas 不支持 CSS 变量
const INDIGO_DEEP = 'rgba(99, 102, 241, 0.15)'    /* 对象/数组 */
const INDIGO_MEDIUM = 'rgba(99, 102, 241, 0.08)'  /* 字符串/数字 */
const INDIGO_LIGHT = 'rgba(99, 102, 241, 0.04)'   /* 空行/空白 */

function getIndigoForDepth(depth, maxDepth = 8) {
  const normalizedDepth = Math.min(depth / maxDepth, 1)
  
  if (normalizedDepth > 0.6) {
    return { color: INDIGO_DEEP, alpha: 1 }
  } else if (normalizedDepth > 0.3) {
    return { color: INDIGO_MEDIUM, alpha: 1 }
  } else {
    return { color: INDIGO_LIGHT, alpha: 1 }
  }
}

function drawSampledOptimized(ctx, width, height, rowHeight, totalNodes) {
  const barWidth = Math.max(width - 4, 2)
  
  if (props.memoryIndex && props.content) {
    drawFromIndex(ctx, width, height, rowHeight, totalNodes, barWidth)
    return
  }
  
  const nodes = props.visibleNodes
  const effectiveSampleCount = Math.min(totalNodes, MAX_NODES_TO_RENDER)
  const step = Math.max(1, Math.floor(totalNodes / effectiveSampleCount))
  
  for (let i = 0; i < totalNodes; i += step) {
    const node = nodes[i]
    if (!node) continue
    
    const y = i * rowHeight
    const h = Math.min(step * rowHeight, 2)
    
    const depth = node.depth || 0
    const { color, alpha } = getIndigoForDepth(depth)
    
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fillRect(2, y, barWidth, h)
  }
  
  ctx.globalAlpha = 1
}

function drawFromIndex(ctx, width, height, rowHeight, totalNodes, barWidth) {
  const index = props.memoryIndex
  const content = props.content
  
  if (!index || !content) return
  
  const keyCount = index.keyCount || 0
  if (keyCount === 0) return
  
  const sampleCount = Math.min(keyCount, MAX_NODES_TO_RENDER)
  
  for (let j = 0; j < sampleCount; j++) {
    const i = Math.floor((j / sampleCount) * keyCount)
    
    const keyInfo = index.keys[i]
    const depth = keyInfo & 0xFF
    
    const y = (i / keyCount) * height
    const h = Math.max(height / keyCount, 1)
    
    const { color, alpha } = getIndigoForDepth(depth)
    
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fillRect(2, y, barWidth, h)
  }
  
  ctx.globalAlpha = 1
}

function drawDetailed(ctx, width, height, rowHeight) {
  props.visibleNodes.forEach((node, index) => {
    const y = index * rowHeight
    const h = Math.max(rowHeight, 1)
    
    const depth = node.depth || 0
    const { color, alpha } = getIndigoForDepth(depth)
    
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    ctx.fillRect(2, y, width - 4, h)
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
        :class="{ dragging: isDragging }"
        :style="sliderStyle"
        @mousedown="startDrag"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.minimap-wrapper {
  width: 60px;  /* 宽度 60px */
  flex-shrink: 0;
  height: 100%;
  margin-left: 12px;  /* 用留白分隔，不用边框 */
}

.minimap {
  width: 100%;
  height: 100%;
  background: var(--minimap-bg);  /* 与主内容区一致 */
  border: none;  /* 去掉边框 */
  position: relative;
  cursor: pointer;
  overflow: hidden;
  box-sizing: border-box;
}

.minimap-content {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  height: 100%;
}

.minimap-canvas {
  width: 100%;
  height: 100%;
}

.minimap-slider {
  position: absolute;
  left: 0;
  right: 0;
  background: var(--minimap-slider);  /* 40% 透明靛蓝 */
  border: 1px solid var(--minimap-slider-border);  /* 1px 边框 */
  border-radius: 2px;
  cursor: ns-resize;
  z-index: 100;
  pointer-events: auto;
  transition: background-color 150ms ease;
}

.minimap-slider:hover,
.minimap-slider.dragging {
  background: rgba(99, 102, 241, 0.5);  /* 加深到 50% */
}
</style>
