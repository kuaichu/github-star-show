# 前端 UI 架构与设计规范

这份文档记录 `GitHub Star Show` 前端的 UI 设计原则、动效规范、已修复的 UI 问题，以及未来修改时应避免的陷阱。

它与 `ARCHITECT.md` 的区别是：

- `ARCHITECT.md` 讲系统架构、数据模型、同步模型
- `FRONTEND_ARCHITECTURE.md` 讲 UI 设计哲学、动画规范、视觉边界条件

---

## 1. 设计定位

这个前端不是：

- 一个花哨的展示页
- 一个移动端 app 式交互
- 一个过度动效的 "AI dashboard"

它是：

> 一个**信息密度优先、操作效率优先**的个人项目库管理界面。
>
> 动效只服务于交互反馈，不为炫技而存在。
> 稳定感 > 流畅感 > 华丽感。

参考风格：Linear / GitHub / Notion database / Raycast — 而非 Dribbble 概念稿。

---

## 2. Motion System（动效系统）

### 2.1 全局节奏

所有 UI 过渡使用统一的 timing，避免有的元素快、有的元素慢。

| 场景 | Duration | Easing | 说明 |
|------|----------|--------|------|
| hover 态切换 | 200ms | ease | button、card、menu-item、chip |
| dropdown 展开/收起 | 200ms | ease | more-actions、sync-history |
| sidebar accordion | 200ms | ease | details 默认展开/收起 |
| drawer 滑入/滑出 | 200ms | ease | ProjectDrawer |
| card 悬停 glow | 250ms | ease | shadow 过渡比 transform 稍慢 |
| grid item 重排 | 120ms | ease-out | TransitionGroup move（克制，不滑行） |
| grid item 进入/离开 | 150ms | ease-out | 以 opacity 为主，transform 为辅 |
| page 过渡（admin 切换） | 200ms | ease | admin-editor / admin-modal |

### 2.2 禁止的动效模式

- ❌ `* { transition: all ... }` — 禁止全局通配过渡
- ❌ 首屏 enter 动画 — 禁止 `Transition appear`、禁止初始加载时触发 fade-in
- ❌ 卡片"滑行"重排 — TransitionGroup move 不超过 150ms
- ❌ 滞后过长的 shadow/glow 过渡 — 不超过 250ms
- ❌ 不同元素使用不一致的 duration（如 card 用 0.32s，button 用 0.15s）

### 2.3 哪些场景不应该有动画

- **首次加载 / 页面刷新** — 稳定直出，不播放任何 enter 动画
- **数据筛选 / 排序** — grid move 用 120ms ease-out，降低存在感
- **guest ↔ user 切换** — 整页切换不需要 Transition（已移除 main-view Transition）
- **空状态 ↔ 内容切换** — 直接替换，不要 fade

---

## 3. Loading & Hydration（加载与首屏）

### 3.1 已修复的首屏白屏问题

**根因**：`index.html` 没有内联背景色，`styles.css` 通过 Vite JS 载入。在 CSS 到达前，浏览器默认白色背景透出。

**修复**：`index.html` 添加 `<style>` 内联区块：

```css
html, body, #app {
  background: #02080d;
  min-height: 100vh;
}
```

**规则**：任何对 `index.html` 的修改必须保留或同步更新此内联样式。不要在 `index.html` 中移除深色背景。

### 3.2 已修复的 Hydration Flicker

**根因**：`currentUser` 初始为 `null`，`isAuthenticated` 为 `false`，因此首次渲染时 **guest-view 先渲染**，auth 解析完成后被 user-view 替换。这个替换过程触发 Transition，产生可见闪屏。

**修复方案**（当前采用）：

1. 添加 `loading` ref，初始值为 `true`
2. loading 期间渲染 **dashboard 骨架屏**（sidebar + hero skeleton + stat skeleton + card skeleton）
3. `onMounted` 中按顺序加载：`loadCurrentUser()` → `loadMeta()` → `loadProjects()` → `loadSyncStatus()`
4. **所有数据加载完成后**设置 `loading = false`，直出真实视图
5. 骨架屏使用 `pointer-events: none`，不响应交互

**关键约束**：

- loading 期间**绝不能**渲染 guest-view（即使用户未登录也要等到确认后才显示）
- loading 期间**绝不能**显示空白/空壳（必须有可视骨架）
- `loading = false` 的时机必须在所有数据（含 projects）加载完成后，避免空状态闪烁
- 骨架屏应与真实 dashboard 布局一致（stats grid + project grid），避免布局跳变

### 3.3 禁止的加载模式

- ❌ 不在 loading 时渲染空 div / `min-height` 占位符
- ❌ 不在 loading 时显示 `v-else` 的空状态
- ❌ 不在 auth 确认前渲染 guest-view
- ❌ 不在数据未就绪时渲染真实视图（会导致空状态闪烁）

---

## 4. Layout System（布局系统）

### 4.1 整体结构

```
.layout                        display: grid; grid-template-columns: 296px 1fr
├── .sidebar                   固定宽度 296px，深色半透明，border-right
│   ├── .brand                 GitHub Star Show 标题 + 说明
│   ├── details.side-block     分类导航（手风琴，默认展开）
│   ├── details.side-block     远端状态（手风琴，默认展开）
│   ├── details.side-block     快捷筛选（手风琴，默认展开）
│   └── .sidebar-footnote      关于 / 更新记录
└── .main                      弹性宽度，padding: 28px，渐变背景
    ├── .locale-switcher       右上角语言切换
    ├── .hero-panel            用户信息/同步操作/更多操作
    ├── .stats                 4 个统计卡片
    ├── .search-toolbar        搜索框 + 排序下拉
    ├── .pagination-toolbar    分页信息
    ├── .grid                  项目卡片网格
    └── .pagination-bar        页码导航
```

### 4.2 弹层层叠

| 元素 | z-index | 说明 |
|------|---------|------|
| .more-actions-dropdown | 1000 | 下拉菜单，必须高于 hero-panel |
| .drawer-mask | 30 | 抽屉遮罩 |
| .drawer | 31 | 项目详情抽屉 |
| .modal-mask | 40 | 确认弹窗遮罩 |
| .confirm-modal | 41 | 确认弹窗 |

### 4.3 响应式断点

| 断点 | 变化 |
|------|------|
| ≤1280px | sidebar 宽度从 296 → 272px；grid/stats 列数自适应；admin-layout 单列 |
| ≤920px | sidebar 移到顶部（单列布局）；main padding 28 → 18px；hero-title 46 → 34px |

---

## 5. 已踩坑记录（AI 禁止重犯）

### 5.1 Dropdown 被裁切

**问题**：`.hero-panel` 设置了 `overflow: hidden`，导致内部 `more-actions` 下拉菜单被裁切。

**修复**：
- 移除 `.hero-panel` 的 `overflow: hidden`
- 调整 `::after` glow 尺寸（240px → 180px，偏移从 -80px/-90px 缩至 -10px/-10px），使其不溢出面板
- dropdown 增加 `max-height: min(60vh, 360px); overflow-y: auto` 小屏安全

**原则**：有 `border-radius` 的容器，如果内部有 `position: absolute` 溢出元素，不要设 `overflow: hidden`。考虑用调整伪元素尺寸替代。

### 5.2 TransitionGroup Move 动画过强

**问题**：filter/sort 项目时，卡片重排动画（0.2s ease）导致明显的"滑行/漂移"感，像 mobile app gallery。

**修复**：
- move transition 从 0.2s ease 降到 **0.12s ease-out**
- enter/leave transition 从 0.2s ease 降到 **0.15s ease-out**
- 初始位移距离从 10px 降到 **6px**
- 首次渲染时通过 `animate` ref + CSS 类 `.grid:not(.grid-animate)` 完全禁用 TransitionGroup 动画

**原则**：筛选/排序后的 grid 重排动画应几乎不可感知。Dashboard 不是 gallery。

### 5.3 多段 Transition 时长不一致

**问题**：Card hover 用了 `0.28s / 0.3s / 0.32s` 三段不同时长，view transition 用了 `0.28s / 0.32s`，与其他 0.2s 的元素不协调。

**修复**：全部统一到 0.2s（hover/interaction）/ 0.22s（enter/leave）/ 0.25s（shadow/glow）三档。

### 5.4 搜索框与排序下拉布局失衡

**问题**：搜索框默认 `max-width: 480px`，排序下拉占满剩余空间，flex 容器未正确约束。

**修复**：`.search-toolbar` 使用 `grid-template-columns: 1fr 240px`，搜索框 flex 拉伸，下拉固定宽度。

### 5.5 组件重复渲染导致空状态闪烁

**问题**：`filteredProjects` 依赖的数据（projects、filters）在加载过程中多次变化，导致 ProjectGrid 在"有项目→无项目→有项目"之间切换，每次进入 EmptyState。

**修复**：`loading` 保持 `true` 直到所有数据加载完成，然后一次性渲染。筛选条件的变更不会触发 loading，只在 loaded 状态下流畅切换。

---

## 6. 组件设计边界

### 6.1 EmptyState 组件

- 5 种预设 icon：`search` / `inbox` / `check` / `folder` / `remote`
- 使用 48×48 SVG，纯 outline 线条，2px stroke，品牌色
- 标题使用 `muted-strong`，描述使用 `muted`，最大宽度 380px
- 预留 `action` slot 放置操作按钮

### 6.2 Sidebar 手风琴

- 使用原生 `<details>` / `<summary>` 实现 accordion
- **必须保留 `open` 属性**（默认展开）
- 移除 `<summary>` 默认的三角形 marker（`::-webkit-details-marker { display: none }`）
- 使用 `user-select: none` 防止双击选中文字

### 6.3 More Actions 下拉

- 使用原生 `<details>` 实现，无需 JavaScript
- `<summary>` 移除默认 marker
- `z-index: 1000`，确保浮在 hero-panel 之上
- 小屏支持 `max-height: min(60vh, 360px); overflow-y: auto`
- 分隔线使用 `more-actions-divider` 而不是 border-top

### 6.4 同步历史折叠

- 使用 `<details>` 实现
- 默认只显示最近一条同步记录
- 展开后显示全部 recentRuns

---

## 7. 视觉规范

### 7.1 色板

```css
--bg: #061018
--panel: rgba(8, 18, 28, 0.9)
--line: rgba(94, 247, 197, 0.16)
--line-strong: rgba(94, 247, 197, 0.38)
--brand: #5ef7c5
--brand-2: #4bc7ff
--warn: #ffd166
--text: #eefafc
--muted: #9fb5bf
--muted-strong: #bdd1d9
--shadow: 0 20px 60px rgba(0, 0, 0, 0.35)
--radius: 24px
```

### 7.2 标题层级

| 层级 | 字号 | 字重 | 颜色 |
|------|------|------|------|
| Hero title | 46px (responsive) | normal | var(--text) |
| .content-head h2 | 24px | bold | var(--text) |
| .card h3 | 22px | 750 | #f2faff |
| side-block h2 | 14px | normal | var(--brand) uppercase |
| .stat-value | 32px | 800 | var(--brand) |

### 7.3 卡片设计

- border-radius: 24px
- 背景渐变：`linear-gradient(180deg, rgba(8,18,28,0.96), rgba(4,11,18,0.98))`
- 顶部渐变线：`::before` 伪元素，`linear-gradient(90deg, transparent, rgba(94,247,197,0.5), transparent)`
- hover：translateY(-5px) + `box-shadow` 含 cyan glow
- tag：opacity 0.55，font-size 11px，hover 恢复至 1

---

## 8. 禁止修改（UI 层面）

- **不要重新引入** `<Transition appear>` 到 main-view
- **不要给** `html, body, #app` 移除深色背景
- **不要在** `index.html` 中移除内联 `<style>` 背景色
- **不要在** loading 状态下显示 guest-view 或空白
- **不要使用** `* { transition: all }` 或任何全局通配过渡
- **不要用** JS 管理 dropdown/accordion 状态（使用原生 `<details>`）
- **不要** 在首次渲染时播放 TransitionGroup enter 动画
- **不要** 让卡片排序重排动画超过 150ms
- **不要** 在 hero-panel 上设置 `overflow: hidden`
- **不要** 使用 `position: fixed` 实现 dropdown（除非 escape 机制就绪）
- **不要** 合并 sidebar 与 main 的滚动上下文

---

## 9. 术语表

| 术语 | 含义 |
|------|------|
| Hydration flicker | Vue 初始渲染时因数据未就绪导致视图切换产生的闪屏 |
| Skeleton screen | 加载期间渲染的占位布局，模拟真实页面结构 |
| FLIP animation | Vue TransitionGroup 使用的 First/Last/Invert/Play 动画技术 |
| Accordion | 可折叠内容区块，使用原生 `<details>` 实现 |
| Breathing room | 元素之间的留白与间距，提升可读性与视觉舒适度 |
