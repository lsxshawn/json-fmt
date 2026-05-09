# UI 设计规范（P2 - 视觉约束）

## 风格方向

高级扁平浅色 Web 风格，参考 Notion / Figma / Linear
禁止 IDE 风格（深色背景、等宽 UI 字体、紧凑行高）

---

## 色彩系统

```css
:root {
  --bg-base: #ffffff;           /* 主背景 */
  --bg-elevated: #fafafa;       /* 卡片/面板 */
  --bg-overlay: rgba(255,255,255,0.95); /* 浮层毛玻璃 */

  --text-primary: #1a1a1a;
  --text-secondary: #6b7280;
  --text-tertiary: #9ca3af;

  --border-light: #f3f4f6;
  --border-medium: #e5e7eb;

  --accent: #6366f1;            /* 靛蓝，唯一强调色 */
  --accent-light: #e0e7ff;
  --accent-hover: #4f46e5;

  --success: #10b981;
  --warning: #f59e0b;
  --error: #ef4444;

  --json-key: #4b5563;
  --json-string: #059669;
  --json-number: #d97706;
  --json-boolean: #6366f1;
  --json-null: #9ca3af;
}
```

## 禁止颜色

- ❌ #0d0d15（深色背景）
- ❌ #111118（深色面板）
- ❌ #c8b88a（暗金）
- ❌ #4a9b8e（青绿）
- ❌ 任何渐变阴影（尤其是白色渐变）

---

## 字体

- UI：`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
- 代码：`'SF Mono', SFMono-Regular, ui-monospace, monospace`
- 禁止：Consolas 作为 UI 字体

---

## 布局

- 顶部导航：48px
- 侧边栏：240px，背景 #fafafa
- 搜索栏：44px
- 状态栏：32px
- 日志面板：最大 160px，绝对定位浮层，毛玻璃

---

## 圆角

- 小：4px（按钮、标签）
- 中：8px（卡片、面板）
- 大：12px（浮层、模态框）
- 禁止：0px（生硬）

---

## 阴影

- 浮层：`0 8px 24px rgba(0,0,0,0.08)`
- 禁止：白色渐变阴影、重阴影
