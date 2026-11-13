# DataEditorY 移动端 UI 设计与适配方案

> 状态：设计稿 · 适用版本：3.4.x（`dev` 分支 `571ad58` 之后）
> 范围：Web 变体（`build:web` / `build:standalone`）在手机与平板上的界面；桌面端（Tauri 与桌面浏览器）界面保持不变
> 关联文档：[web-port.md](./web-port.md) 第 6 节（P5）

---

## 1. 现状诊断

当前界面完全按 1920×1080 桌面设计，没有任何针对窄屏或触控的分支。在 390×844 的手机上实际表现如下。

### 1.1 尺寸：固定宽度相加远超屏幕

| 位置 | 固定尺寸 | 文件 |
|---|---|---|
| Card Explorer | `flex: 0 0 23rem`（两处重复声明） | `modules/card/workbench/CardCollectionWorkbench.svelte` L324、`components/CardList.svelte` L599 |
| 编辑器左列下限 | 卡图 `9.75rem` + 数值区 `min-width: 13.75rem` ≈ 23.9rem | `features/card-editor/components/CardEditorForm.svelte` L379、L415 |
| 编辑器头部 | ID `8rem` + Alias `7.5rem` + 卡名 + 两个按钮，不换行 | `CardEditorHeader.svelte` |
| 类型勾选 | `repeat(5, minmax(0,1fr))` + `nowrap` 省略号 | `CardEditorForm.svelte` L617 |
| 底部按钮 | 6 个按钮 `display:flex` 不换行 | `CardEditorFooter.svelte` L132 |
| 顶栏 | 图标 + 文字导航，不折叠 | `features/shell/components/AppTopBar.svelte` |

各容器普遍是 `overflow: hidden`，所以内容会被裁掉，而不是出现滚动条。

### 1.2 缩放：`--ui-scale` 只会缩小

`routes/+layout.svelte` L38–55 按 `min(w/1920, h/1080)^0.4 × 1.2` 计算缩放，下限 0.82。手机上会钳到 0.82，根字号约 12.3px。这只会让控件更小、更难点，不会改变布局。

### 1.3 交互：依赖鼠标

| 能力 | 当前入口 | 触控下的问题 |
|---|---|---|
| 卡片 / 列表 / 标签菜单 | 只有 `contextmenu` 事件 | iOS Safari 长按不触发，菜单完全不可达 |
| 多选 | Ctrl / Shift + 点击 | 无替代，只能走“选择本页” |
| 最近打开 | hover 打开浮层（`AppTopBar` L96） | 点按直接弹文件选择器，最近列表不可达 |
| 卡图预览 | 双击，单击有 220ms 延时选图 | 双击在移动端不可靠；Web 下选图还会静默失败 |
| 关闭标签 | 中键，或 17px 的 × | 点击区域过小 |
| 表单操作 | 快捷键（Ctrl+Enter 修改、↑↓ 切卡） | 无键盘 |

### 1.4 视口与系统 UI

- 根容器使用 `100vh`（`+layout.svelte` L218）。移动浏览器地址栏伸缩会导致底部被遮挡。
- `<meta viewport>` 没有 `viewport-fit=cover`，也没有处理安全区（`env(safe-area-inset-*)`）。
- 菜单在窗口 `resize` 时关闭（`context-menu/ContextMenu.svelte` L48）。软键盘弹出会触发 resize，菜单一闪即关。
- Toast 固定在右上角，宽 360px，会盖住移动端标题栏。

### 1.5 触控目标偏小

标签 × 17px、分页按钮 26px、链接箭头 1.75rem（缩放后约 21px）、最近记录删除 18px、筛选 chip 0.72rem 字号。本方案统一要求最小触控区域 **44×44 CSS px**。

---

## 2. 设计目标与原则

1. **同一套状态与逻辑，两套外壳。** stores、domain、use case、文档协议、草稿 / 提交 / 保存流程全部复用；移动端只替换布局与交互组件。不 fork `CardEditor` 的业务逻辑。
2. **列表 → 详情的栈式导航。** 手机上一次只显示一个主视图，返回键回到列表。
3. **所有右键 / 修饰键 / hover 能力都有显式入口。** “⋯”按钮、长按、多选模式、底部操作表（Action Sheet）。
4. **触控优先的尺寸。** 44px 触控区，16px 以上输入字号（避免 iOS 聚焦时自动缩放），数字输入用 `inputmode`。
5. **桌面零回归。** 桌面断点下 DOM 与样式和现在一致；移动端代码按需懒加载，不进桌面首屏。
6. **草稿安全。** 返回列表、切换 CDB、页面进入后台（`visibilitychange`）时都提交或保留草稿，规则与桌面的“切卡前提交”一致。

非目标：移动端不做制卡器、Lua 编辑器、AI，也不做拖拽排序标签。

---

## 3. 布局模式与断点

### 3.1 三种模式

| 模式 | 条件 | 布局 |
|---|---|---|
| `desktop` | 宽 ≥ 1200px | 现有布局，完全不变 |
| `compact`（平板 / 小窗） | 768px ≤ 宽 < 1200px，或宽 ≥ 768px 且高 < 600px | 保留顶栏与标签栏；Explorer 变为可收起的侧边抽屉；编辑器单列自适应 |
| `mobile` | 宽 < 768px，或高 < 500px 的横屏手机 | 移动外壳：栈式导航 + 底部操作栏 + 底部抽屉 |

触控能力（`pointer: coarse`）不决定模式，只决定交互细节：`coarse` 时触控区放大、启用长按、关闭 hover 浮层。这样窄窗口的桌面浏览器也能用移动布局，带键盘的平板也能保留快捷键。

### 3.2 布局状态 store

新增 `src/lib/stores/layoutMode.svelte.ts`：

```ts
export type LayoutMode = 'desktop' | 'compact' | 'mobile';

export const layoutState = $state({
  mode: 'desktop' as LayoutMode,
  coarsePointer: false,
  /** 软键盘弹出时 visualViewport 高度小于布局视口 */
  keyboardInset: 0,
});

export function startLayoutModeSync(): () => void;
```

- 用 `matchMedia('(min-width: 1200px)')`、`(min-width: 768px)`、`(max-height: 500px)`、`(pointer: coarse)` 监听变化，不用每帧计算 `resize`。
- 用 `visualViewport.resize` 计算 `keyboardInset`，写到 CSS 变量 `--keyboard-inset`，让底部操作栏避开软键盘。
- 在 `+layout.svelte` 的 `onMount` 中启动（与 `startDocumentStateSync` 同级）。

### 3.3 `--ui-scale` 调整

`syncUiScale()` 只在 `desktop` 模式下生效；`compact` / `mobile` 固定 `--ui-scale: 1`，根字号 15px。移动端字号用独立 token（见第 8 节），不随窗口缩放。

### 3.4 视口与安全区

- `src/app.html` 与 `src/standalone/index.html` 的 viewport 改为：
  `width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content`
- `.app-container` 的 `height: 100vh` 改为 `height: 100dvh`，并保留 `100vh` 作为回退。
- 移动外壳的顶部、底部栏使用 `padding-top: env(safe-area-inset-top)` / `padding-bottom: max(env(safe-area-inset-bottom), var(--keyboard-inset))`。
- 加 `<meta name="theme-color">`，并按主题切换。

---

## 4. 信息架构（mobile 模式）

```text
                    ┌──────────────── 移动外壳 MobileShell ────────────────┐
                    │                                                     │
   无 CDB ──────────▶  首页 Home        打开 / 新建 / 最近打开 / 设置      │
                    │     │                                               │
                    │     ▼ 打开或新建                                    │
                    │  列表页 ExplorerView  ◀──── 返回 ────┐               │
                    │     │  点按卡片 / ＋新卡             │               │
                    │     ▼                               │               │
                    │  详情页 EditorView  ────────────────┘               │
                    │                                                     │
                    │  覆盖层：CDB 切换抽屉 · 筛选面板 · 操作表 · 工具全屏页  │
                    └─────────────────────────────────────────────────────┘
```

- **Home**：替代桌面空状态和顶栏中的“打开 / 创建 / 最近”。
- **ExplorerView**：替代左侧 Card Explorer，占满屏幕。
- **EditorView**：替代中间的卡片 surface，占满屏幕。
- 桌面顶部的 CDB 标签栏，在移动端变成标题栏上的“CDB 切换器”（底部抽屉）。
- 设置在桌面是工作区标签；在移动端是全屏页，从 Home 或“更多”菜单进入。

### 4.1 路由与返回键

不引入 SvelteKit 路由（standalone 构建也不使用路由）。移动外壳维护一个轻量视图栈：

```ts
type MobileView =
  | { kind: 'home' }
  | { kind: 'explorer'; tabId: string }
  | { kind: 'editor'; tabId: string; cardId: number | null }
  | { kind: 'settings' }
  | { kind: 'tool'; toolId: string };
```

- 进入新视图时 `history.pushState({ deyView })`；`popstate` 时出栈。这样 Android 返回键和 iOS 边缘返回手势都能回到上一层。
- 覆盖层（抽屉、筛选、操作表）同样压一层 history，返回键优先关闭覆盖层。
- 视图栈只存在内存里，刷新后根据已恢复的工作区回到 explorer。

### 4.2 与现有状态的对应关系

| 移动端动作 | 调用的现有逻辑 |
|---|---|
| 列表点按卡片 | `setSingleSelectedCard(code)`，然后推入 editor（先走 `registerCardDraftCommitter` 提交上一张草稿） |
| 详情页“返回” | 调用草稿提交器；严重校验错误时停留在详情页并提示，警告不阻止 |
| 切换 CDB | `shellController.activateWorkspaceDocument(id)` |
| 保存 CDB | `saveWorkspaceDocument()`（Web 下触发下载） |
| 新卡 | 派发现有 `new-card` 事件，然后推入 editor |

---

## 5. 页面设计

以下线框以 390×844 为基准，单位为 CSS px。

### 5.1 Home（无活动 CDB）

```text
┌──────────────────────────────┐
│ DataEditorY            ☾  中 │  56
├──────────────────────────────┤
│  ┌────────────┐┌────────────┐│
│  │  📂 打开   ││  ＋ 新建   ││  两个大按钮，高 96
│  └────────────┘└────────────┘│
│                              │
│  最近打开                    │
│  ┌──────────────────────────┐│
│  │ cards.cdb           ⋯   ││  行高 64，⋯ 打开操作表：
│  │ 2 天前 · 1,234 张        ││  打开 / 从列表移除
│  └──────────────────────────┘│
│  ...                         │
│                              │
│  ⚙ 设置                      │
└──────────────────────────────┘
```

- 最近记录复用 `shellController.recentEntries` 与 `handleOpenRecent` / `handleRemoveRecent`。Web 下文件已不在存储中时，沿用现有逻辑提示重新导入。
- 支持系统“分享到 / 用此应用打开”（PWA `file_handlers` / `launchQueue`，见 web-port.md 4.14），在 P4 之后接入。

### 5.2 ExplorerView（列表页）

```text
┌──────────────────────────────┐
│ ☰ cards.cdb ▾        💾  ⋯  │  56  ☰/标题：CDB 切换抽屉；💾 保存；⋯ 更多
├──────────────────────────────┤
│ 🔍 [名称或效果文本……]  ⛃ 2 │  52  ⛃ 筛选（徽标显示已启用条件数）
│ [攻击≥2000 ×] [光属性 ×] →  │  40  条件 chip，横向滚动，高 32
├──────────────────────────────┤
│ 共 1,234 张                  │
│ ┌──────────────────────────┐ │
│ │ 青眼白龙          [怪兽]│ │  行高 56：卡名（主）+ 密码 / 类型 / 属性（次）
│ │ 89631139 · 光 · 龙族 8★ │ │
│ ├──────────────────────────┤ │
│ │ ...                      │ │
│ └──────────────────────────┘ │
│                         (＋) │  FAB 56×56，新建卡片
└──────────────────────────────┘
```

**列表行**

- 桌面的三列表格改为两行卡片式行，高 56。主行是卡名，次行是“密码 · 属性 · 种族 · 等级”或“魔法 / 陷阱子类型”。
- 继续虚拟化：`VIRTUAL_ROW_HEIGHT` 改为参数（桌面 30，移动 56），布局计算逻辑保持不变。
- 修改未保存的卡显示圆点标记（沿用现有 dirty 状态来源）。

**分页 → 连续加载**

- 服务端分页（`CARD_LIST_PAGE_SIZE = 50`）保持不变；移动端在接近底部时自动请求下一页并追加，不显示分页条。
- 需要在 `features/card-editor/controller.ts` 的分页 API 上加 `appendNextPage()`，返回累计结果。桌面仍用替换式分页。
- 追加上限 1,000 行；超过后显示“结果过多，请增加筛选条件”，并提供“跳到第 N 页”入口，避免移动端内存膨胀。

**点按与长按**

| 手势 | 行为 |
|---|---|
| 点按 | 打开该卡详情 |
| 长按 450ms | 进入多选模式，并选中该行（`navigator.vibrate?.(10)`） |
| 行尾 ⋯（`pointer: coarse` 时显示） | 打开该卡操作表（等同桌面右键菜单） |

**多选模式**

```text
┌──────────────────────────────┐
│ ✕  已选 3 张         全选本页 │  标题栏替换为选择栏
├──────────────────────────────┤
│ ☑ 青眼白龙                   │  行首复选框，点按切换
│ ☐ ...                        │
├──────────────────────────────┤
│  复制   批量编辑   展示图  🗑 │  底部批量操作栏，高 56 + 安全区
└──────────────────────────────┘
```

- 选择状态直接用现有 `editorState` 的多选集合（`toggleCardSelection` / `selectCardRange`）。
- 操作项来自 `cardMenu.ts` 的多选菜单（复制名称 / 密码 / 数据、批量编辑分组、展示图、删除），通过统一的菜单模型渲染（见第 6 节）。
- 返回键或 ✕ 退出多选模式并调用 `clearSelection`。

**筛选面板**

- 点 ⛃ 打开全屏筛选页（底部抽屉拉满）。字段与 `CardList.svelte` L333–520 一致，单列排列：
  1. 密码 / 同名、效果描述
  2. 规则表达式（错误提示在字段下方，不用气泡）
  3. 攻击 / 守备区间（两列，`inputmode="numeric"`）
  4. 卡片种类 / 子类型 / 属性 / 种族（原生 `<select>`，移动端会调起系统选择器）
  5. 系列 4 个（单列）
  6. 卡组文本 + 导入 ydk
  7. “按图片目录筛选”在不支持目录选择的移动浏览器中隐藏（`host.capabilities.directoryPicker`）
- 底部固定“重置”和“应用（显示 N 张）”。条件在应用前只写入面板的本地副本；点“应用”才写回 `searchFilters` 并搜索，避免每改一项就触发查询。
- 需要先把筛选表单从 `CardList.svelte` 抽成 `CardFilterForm.svelte`，桌面浮层与移动全屏页共用。

### 5.3 EditorView（详情页）

```text
┌──────────────────────────────┐
│ ←  青眼白龙 ●          ↶  ⋯ │  56  ← 返回（先提交草稿）；● 有未提交修改；↶ 草稿撤销
├──────────────────────────────┤
│ [基本] [类型] [数值] [系列] [文本] [提示] │  44  分段导航，滚动联动高亮
├──────────────────────────────┤
│ ┌──────┐ 密码  [89631139   ] │
│ │ 卡图 │ 同名  [0          ] │  卡图 104×151，点按大图预览
│ │      │ 卡名  [青眼白龙    ] │
│ └──────┘ 许可  [OCG       ▾] │
│ ─── 类型 ─────────────────── │
│ 主类型  (怪兽)(魔法)(陷阱)    │  单选分段
│ 子类型  [效果][调整][同调]…   │  多选 chip，自动换行
│ ─── 数值 ─────────────────── │
│ 属性 [光 ▾]   种族 [龙族 ▾]   │
│ 等级 [8 ▾]                    │
│ 攻击 [3000]   守备 [2500]     │
│ 灵摆 左[ ] 右[ ]（仅灵摆）    │
│ 链接箭头 ↖↑↗ ← · → ↙↓↘（仅链接）│
│ ─── 系列 ─────────────────── │
│ ...                          │
├──────────────────────────────┤
│ [ 保存修改 ]   新卡   删除   │  56 + 安全区；主按钮占一半宽度
└──────────────────────────────┘
```

**分区**

整页单列滚动，按以下顺序分为 6 个区。顶部分段导航点按后滚动到对应区，滚动时用 `IntersectionObserver` 高亮当前区。

| 区 | 内容 | 对应桌面位置 |
|---|---|---|
| 基本 | 卡图、密码、同名、卡名、许可 | `CardEditorHeader` + 左列顶部 |
| 类型 | 主类型单选（怪兽 / 魔法 / 陷阱）+ 当前主类型下的子类型 chip | 右列 `.type-row` 网格 |
| 数值 | 属性、种族、等级、攻 / 守、灵摆刻度、链接箭头 | 左列数值区 + `.compact-link-panel` |
| 系列 | 4 个 `SetcodeField`，单列 | 右列 `.setcode-grid` |
| 文本 | 效果描述（自适应高度，最少 8 行） | 左列 textarea |
| 提示 | str1–str16，默认只显示非空项和下一个空位，“显示全部”展开；效果分类 `fx` | 右列 `.hints-container` + `CardCategoryPopover` |

**类型选择的简化**

桌面把怪兽 / 魔法 / 陷阱的全部子类型放在一个网格里。移动端先选主类型，只显示该主类型的子类型，互斥规则仍由现有 domain 逻辑处理。属性、种族、等级只在“怪兽”时显示，灵摆刻度只在勾选灵摆时显示，链接箭头只在勾选链接时显示，替代桌面的“禁用但可见”，以减少滚动长度。

**链接箭头**

3×3 网格，每格 48×48，中心格显示箭头数量。

**效果分类（category）**

`CardCategoryPopover` 在移动端改为底部抽屉，2 列复选、可搜索，底部显示“已选 N 项 · 完成”。

**卡图**

- 点按打开大图预览（`CardImagePreview`），不再使用单击选图 / 双击预览的 220ms 区分。
- 更换图片放到预览页底部和“⋯”菜单中。Web 版没有图片导入能力（`importCardImageFile` 会抛错）时，隐藏该入口，而不是静默失败。

**底部操作栏**

| 位置 | 按钮 | 对应桌面 |
|---|---|---|
| 主按钮 | 保存修改（新卡时为“添加卡片”） | Footer “修改”（`cardEditor.modify`） |
| 次按钮 | 新卡 | Footer “新卡” |
| 次按钮 | 删除（危险色，二次确认） | Footer “删除” |
| ⋯ 菜单 | 另存为新卡、以当前草稿搜索、重置搜索、复制卡片数据、保存数据库 | Footer 其余按钮 + Header “保存数据库” |

- 栏高 56，底边加 `max(env(safe-area-inset-bottom), var(--keyboard-inset))`。软键盘弹出时，栏贴在键盘上方。
- 文本域聚焦且软键盘弹出时，操作栏收缩为只剩“完成”和“保存修改”，避免占用可见区域。

**草稿规则**

- “返回”、切换卡、切换 CDB、`visibilitychange → hidden`：调用现有草稿提交器。严重错误时阻止离开，并滚动到出错字段；仅有警告时直接提交。
- 详情页标题旁的 ● 来自 `draftDirty`。
- ↶ 调用 `handleDraftUndo`。没有草稿历史时，弹确认后撤销上一次 CDB 操作（与 `global.undoLastOperation` 规则一致）。

**卡间切换**

- 标题栏副标题显示“12 / 1,234”。
- 详情页左右滑动切换上一张 / 下一张（等同 `cardEditor.selectPrevious` / `selectNext`，先提交草稿）。在输入框内或横向可滚动元素上不响应。
- 为避免误触，滑动距离需大于 80px 且水平方向占主导；可在设置中关闭。

### 5.4 CDB 切换抽屉

```text
┌──────────────────────────────┐
│ 已打开的数据库               │
│ ● cards.cdb      1,234   ⋯  │  ⋯：保存 / 另存为 / 关闭 / 关闭其他
│   new.cdb          12    ⋯  │
│ ──────────────────────────── │
│ 📂 打开   ＋ 新建   ⚙ 设置   │
└──────────────────────────────┘
```

- 底部抽屉，最高 70% 视口。数据来自 `workspaceState.documents`（`kind === 'db'`），操作复用 `AppTabBar` 的右键菜单项（Web 下“复制路径 / 打开所在位置”不显示）。
- 有未保存修改的 CDB 显示 ●。关闭时沿用现有未保存确认流程。

### 5.5 “更多”菜单与工具

ExplorerView 的 ⋯ 打开操作表，内容取自 `AppTopBar` 的工具列表与外壳命令：

- 导出筛选结果为新 CDB（`CreateFilteredCdbDialog`）
- 批量编辑（`openBatchCdbEditTool`）
- 展示图（`card.showcase-image`）
- 合并 / 打包 / 资源检查：按现有可见性规则（Web 下不显示）
- 主题、语言、设置

工具对话框在 mobile 模式下以**全屏页**显示：

| 对话框 | 适配方式 |
|---|---|
| `CreateFilteredCdbDialog` | 全屏；主按钮固定底部 |
| `BatchCdbEditDialog` | 全屏；两栏改为“目标 → 字段 → 预览”三步分页，底部“上一步 / 下一步 / 执行” |
| `CardShowcaseImageDialog` | 全屏；设置项单列（已有 680px 媒体查询，扩展即可），预览图在顶部 |
| `CardImagePreview` | 全屏黑底，双指缩放用原生 `touch-action: pinch-zoom` |
| `MergeCdbDialog`（若后续 Web 启用） | 全屏；拖拽排序改为每行“上移 / 下移”按钮，保留拖拽手柄（`touch-action: none`） |

实现上不重写对话框，只新增一个容器组件 `AdaptiveDialog.svelte`：desktop / compact 模式下渲染现有的居中面板，mobile 模式下渲染全屏页（带标题栏和返回）。各对话框逐个迁移到这个容器。

### 5.6 设置页

- 全屏页，顶部分段切换“常规 / 快捷键”。移动端隐藏“快捷键”页（无物理键盘时无意义）；检测到 `pointer: fine` 的平板仍显示。
- 新增“移动端”设置组：左右滑动切卡开关、列表行密度（舒适 56 / 紧凑 44）。

---

## 6. 交互原语

### 6.1 统一菜单模型

现在菜单项由 `cardMenu.ts`、`AppTabBar` 等构造，只能通过 `openContextMenu(event: MouseEvent, items)` 打开。改造为：

```ts
// features/context-menu/menu.svelte.ts
export type MenuAnchor =
  | { kind: 'pointer'; x: number; y: number }
  | { kind: 'element'; element: HTMLElement };

export function openMenu(anchor: MenuAnchor, items: ContextMenuItem[]): MenuToken;
/** 兼容现有调用 */
export function openContextMenu(event: MouseEvent, items: ContextMenuItem[]): MenuToken;
```

- `ContextMenu.svelte` 根据 `layoutState`：`desktop` / `compact` 且 `pointer: fine` 时渲染现有浮动菜单；否则渲染 **ActionSheet**（底部抽屉，项高 52，危险项红色，底部“取消”）。
- 菜单项定义、启用状态异步更新（`updateContextMenu`）、`runMenuItem` 错误 toast 全部不变。
- 修复：mobile 模式下不因 `resize` 关闭菜单（软键盘会触发 resize），改为在 `orientationchange` 时关闭。

### 6.2 长按 action

新增 `src/lib/actions/longPress.ts`：

```ts
export function longPress(node: HTMLElement, options: {
  delay?: number;          // 默认 450ms
  moveTolerance?: number;  // 默认 10px，超过视为滚动
  onLongPress: (event: PointerEvent) => void;
}): ActionReturn;
```

- 基于 `pointerdown` / `pointermove` / `pointerup` / `pointercancel`，只对 `pointerType !== 'mouse'` 生效。
- 触发后阻止随后的 `click` 和原生 `contextmenu`，避免 Android 同时弹出系统菜单。
- 节点设置 `-webkit-touch-callout: none; user-select: none`。

### 6.3 底部抽屉 / 全屏页

新增 `src/lib/features/mobile/components/BottomSheet.svelte`：

- 属性：`open`、`title`、`detents`（`'auto' | 'half' | 'full'`）、`onClose`。
- 背景点按、下滑超过 30%、返回键（history 层）关闭。
- 打开时锁定背景滚动，焦点移入抽屉，关闭后焦点回到触发元素；`role="dialog" aria-modal="true"`，现有 `[aria-modal="true"]` 守卫（编辑器快捷键跳过）自动生效。

### 6.4 hover 能力的替代

| 桌面 hover / 修饰键 | 移动替代 |
|---|---|
| “打开”悬停显示最近记录 | Home 最近列表；CDB 抽屉 |
| Explorer 焦点模式悬停展开 | 不适用（栈式导航） |
| Ctrl / Shift 多选 | 长按进入多选模式；“全选本页” |
| 中键关闭标签 | CDB 抽屉行 ⋯ → 关闭 |
| 双击卡图预览 | 点按卡图 |
| `title` 提示 | 关键提示改为可见文字或字段下方说明 |

全局 CSS 中，所有 `:hover` 背景样式包在 `@media (hover: hover)` 中，避免触控后残留高亮。

### 6.5 键盘与输入

- 数字字段：`inputmode="numeric" pattern="[0-9]*"`。攻 / 守支持 `?`（现有 `parseEditableStatInput`），所以用 `inputmode="text"` 并在旁边提供“?”快捷按钮。
- 密码 / 同名使用 `inputmode="numeric"`，`enterkeyhint="next"`；搜索框 `enterkeyhint="search"`。
- 所有输入字号 ≥ 16px，防止 iOS 聚焦时自动放大。
- 移动模式下不注册全局快捷键处理器（`layoutController` 的 keydown 仍注册，但在 `mode === 'mobile' && !hasPhysicalKeyboard` 时跳过；物理键盘按首次 `keydown` 判断）。

---

## 7. compact 模式（平板 / 小窗）

```text
┌──────────────────────────────────────────────┐
│ DataEditorY  打开 新建 工具 ⋯         ☾  中  │  顶栏：仅图标 + 简短文字
│ [cards.cdb ×] [new.cdb ×] +                 │  标签栏保留，× 触控区放大到 32
├────────────┬─────────────────────────────────┤
│ Explorer   │  编辑器（单列可滚动或两列自适应）│
│ 20rem      │                                 │
│ 可收起 ◀   │                                 │
└────────────┴─────────────────────────────────┘
```

- Explorer 宽度 `clamp(17rem, 30vw, 23rem)`，标题处加“收起”按钮；收起后变为从左侧滑出的覆盖抽屉（不是 hover 展开）。
- 编辑器：容器宽 ≥ 760px 时保持两列；小于时切换为单列分区布局（与移动端相同的分区组件，但无底部操作栏，Footer 按钮允许换行）。判断用容器查询 `@container`，而不是视口宽度。
- 菜单：`pointer: coarse` 时用 ActionSheet，否则用浮动菜单。

---

## 8. 视觉规范（移动端 token）

在 `app.css` 中新增，仅在 `[data-layout='mobile']`（由 `layoutMode` 写到 `<html>`）下覆盖：

| Token | 桌面 | mobile |
|---|---|---|
| `--text-base` | 0.92rem × scale | 16px |
| `--text-sm` | 0.84rem | 14px |
| `--text-xs` | 0.78rem | 13px（最小可读字号） |
| `--control-height-md` | 34px × scale | 44px |
| `--touch-target` | — | 44px |
| `--bar-height` | — | 56px |
| `--spacing-md` | 16px × scale | 16px |
| `--radius-sheet` | — | 16px（抽屉上圆角） |

- 颜色、明暗主题沿用现有变量。
- 移动端自定义滚动条样式去掉，使用系统滚动条。
- 列表行、菜单项、chip 的可点按高度不低于 `--touch-target`（chip 视觉高 32，用 padding 扩展点击区）。
- Toast 移到底部操作栏上方居中，宽度 `calc(100vw - 32px)`，避开安全区。

---

## 9. 组件结构与改造清单

### 9.1 新增

```text
src/lib/stores/layoutMode.svelte.ts              布局模式、触控、软键盘高度
src/lib/actions/longPress.ts                     长按
src/lib/features/mobile/
  MobileShell.svelte                             视图栈、history 同步、覆盖层宿主
  navigation.svelte.ts                           MobileView 栈与 push/pop/replace
  views/HomeView.svelte
  views/ExplorerView.svelte                      复用 CardList 的数据与选择逻辑
  views/EditorView.svelte                        包装 CardEditor（presentation="mobile"）
  views/SettingsView.svelte                      包装 SettingsPanel
  components/MobileTopBar.svelte
  components/BottomActionBar.svelte
  components/BottomSheet.svelte
  components/ActionSheet.svelte
  components/CdbSwitcherSheet.svelte
  components/SelectionBar.svelte
  components/SectionNav.svelte                   编辑器分段导航
src/lib/components/AdaptiveDialog.svelte         对话框容器（居中 / 全屏）
```

`MobileShell` 及其子组件通过动态 `import()` 加载；桌面首屏不包含这些代码。standalone 构建会把它们内联进单文件，体积增量预计 < 60 KB（未压缩）。

### 9.2 改造（桌面行为不变）

| 文件 | 改造 |
|---|---|
| `routes/+layout.svelte` | 启动 `layoutMode`；`mode === 'mobile'` 时渲染 `MobileShell`，否则渲染现有外壳；`--ui-scale` 仅 desktop 计算；`100dvh` |
| `src/app.html`、`src/standalone/index.html` | viewport 增加 `viewport-fit=cover, interactive-widget=resizes-content`；`theme-color` |
| `src/app.css` | 移动 token；`:hover` 包 `@media (hover: hover)` |
| `components/CardList.svelte` | 抽出 `CardFilterForm.svelte`、`CardResultList.svelte`（行渲染与虚拟化参数化）；chip 抽成组件 |
| `features/card-editor/components/CardEditorForm.svelte` | 拆成分区组件：`BasicFields`、`TypeFields`、`StatFields`、`LinkMarkerField`、`SetcodeFields`、`DescriptionField`、`HintFields`。桌面两列布局只负责摆放；移动端按分区纵向组合。同时把 `export let` 迁到 `$props()`，修改通过显式回调或 `$bindable` 完成 |
| `components/CardEditor.svelte` | 新增 `presentation: 'desktop' \| 'mobile'`；草稿、提交、撤销、生命周期逻辑不变，只切换渲染的头部 / 表单 / 底栏组件；对外暴露 `commitDraft()`、`isDirty` 给 `EditorView` |
| `features/card-editor/controller.ts` | 卡图单击 / 双击区分仅在 `pointer: fine` 时启用；新增 `appendNextPage()` |
| `features/card-editor/components/CardCategoryPopover.svelte` | mobile 时渲染到 `BottomSheet` |
| `features/context-menu/menu.svelte.ts`、`ContextMenu.svelte` | `openMenu(anchor)`；ActionSheet 渲染分支；resize 关闭规则 |
| `features/context-menu/cardMenu.ts` | 菜单项构造与触发事件解耦，导出 `buildCardMenuItems(context)` 供 ⋯ 按钮、长按、批量栏复用 |
| `features/shell/components/AppTabBar.svelte` | 同上：导出标签菜单项构造函数；compact 模式放大 × |
| `features/shell/layoutController.svelte.ts` | 快捷键在移动无键盘时跳过；导出“工具列表”数据供移动“更多”菜单使用 |
| `CreateFilteredCdbDialog` / `BatchCdbEditDialog` / `CardShowcaseImageDialog` / `CardImagePreview` | 外层换成 `AdaptiveDialog`；批量编辑增加分步模式 |
| `components/Toast.svelte` | mobile 位置 |
| `native/assetApi.ts` 调用方 | Web 下无图片导入能力时隐藏入口（按 `host.capabilities`），不再静默失败 |

### 9.3 关键约束

- `MobileShell` 不直接调用 Tauri、文档协议或 `invoke`；只调用 stores 和 application 层命令（与 AGENTS.md 的边界一致）。
- 移动端视图状态（当前视图、筛选面板开关）不写入 `.dey` 工作区元数据；列表筛选、选择等已有的工作区状态照常保存，桌面与移动共享。
- 分区组件只接收数据和回调，不读取全局 store，便于在两种布局中复用和测试。

---

## 10. 实施阶段

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M0 基础设施** | `layoutMode` store、viewport / dvh / 安全区、移动 token、`:hover` 包裹、`--ui-scale` 规则、Toast 位置 | 桌面截图无差异；手机上外壳不再溢出，无横向滚动 |
| **M1 表单拆分** | `CardEditorForm` 拆分区组件 + `$props()` 化；`CardList` 抽出筛选表单与结果列表 | 桌面功能与快捷键全部回归通过；`bun test` 与 `check:web` 通过 |
| **M2 交互原语** | 统一菜单模型 + ActionSheet、`longPress`、`BottomSheet`、`AdaptiveDialog` | 桌面右键菜单不变；触控设备上长按 / ⋯ 打开操作表 |
| **M3 移动外壳** | `MobileShell` 视图栈与 history、Home、ExplorerView（连续加载、多选、筛选页）、EditorView（分区、底部操作栏、草稿规则）、CDB 切换抽屉、更多菜单、设置页 | 手机上完成：导入 CDB → 搜索筛选 → 编辑 → 新建 → 多选删除 → 保存下载 → 刷新恢复 |
| **M4 工具与 compact** | 工具对话框全屏化、批量编辑分步、分类抽屉、卡图预览；compact 模式（可收起 Explorer、容器查询单列） | 平板横竖屏可用；所有 Web 可用工具在手机上可完成 |
| **M5 打磨** | 左右滑切卡、软键盘避让细节、触感反馈、性能（列表滚动 60fps、首屏）、无障碍 | 见第 11 节测试矩阵 |

M1、M2 是纯重构，可以先合入并在桌面上验证；M3 起才出现移动端可见变化。

---

## 11. 测试

### 11.1 设备与浏览器矩阵

| 设备 | 浏览器 | 视口 |
|---|---|---|
| iPhone SE / 13 / 15 Pro Max | Safari、Chrome | 375×667、390×844、430×932 |
| Android 中端机 | Chrome、Firefox、系统浏览器 | 360×800、412×915 |
| iPad / Android 平板 | Safari、Chrome | 768×1024、1024×1366（横竖屏） |
| 桌面窄窗口 | Chrome、Firefox | 700×900、1000×800 |

另需覆盖：standalone 单文件以 `file://` 在 Android Chrome 中打开；PWA 安装后（P4 完成后）。

### 11.2 自动化

- 单元测试：`layoutMode` 断点判定、视图栈 push/pop 与 history 同步、`longPress` 取消条件（移动超阈值、`pointercancel`）、菜单项构造函数（单选 / 多选 / Web 能力裁剪）、连续加载上限。
- 组件测试：分区组件在 `isLink` / `isPend` / 主类型变化时的显隐；草稿提交被严重错误阻止时，“返回”保持在详情页。
- 端到端（agent-browser，移动视口 + 触控仿真）：
  1. 新建 CDB → ＋ → 填写 → 保存修改 → 返回 → 列表出现该卡
  2. 长按进入多选 → 选 3 张 → 删除 → 撤销
  3. 筛选：攻击 ≥ 2000 + 光属性 → 应用 → chip 删除单条件
  4. 编辑中返回：有效草稿自动提交；无效草稿阻止离开
  5. 切换 CDB 抽屉 → 关闭含未保存修改的 CDB → 出现确认
  6. Android 返回键依次关闭：操作表 → 筛选页 → 详情页
- 桌面回归：现有 agent-browser 流程在 1920×1080 与 1280×800 下截图比对。

### 11.3 人工检查清单

- [ ] 任意页面无横向滚动
- [ ] 软键盘弹出时，当前输入框与底部操作栏均可见
- [ ] 所有可点元素 ≥ 44px
- [ ] 无 hover 残留高亮
- [ ] iOS 聚焦输入框不自动放大
- [ ] 刘海 / 手势条区域无内容被遮挡
- [ ] 横屏手机可用（高 < 500 使用 mobile 模式）
- [ ] 深浅主题对比度达标

---

## 12. 风险与待定事项

1. **iOS 下载体验**：Safari 保存 CDB 会进入“文件”预览，而不是静默下载。需要在保存后提示“已导出，可在‘文件’中查看”；P2 的 OPFS 持久化完成后，主要依赖浏览器存储，导出仅用于分享。可考虑 Web Share API（`navigator.share({ files })`）作为移动端主导出方式。
2. **主线程 CDB（standalone）**：单文件构建的 CDB 宿主在主线程运行，大库搜索可能导致滚动卡顿。移动端优先推荐托管版（Worker）；standalone 需在 2 万张卡的 CDB 上测量搜索耗时。
3. **连续加载与选择范围**：多选“全选”的含义需要确定——当前已加载的结果，还是全部筛选结果。建议提供两种：“全选已加载”和“选择全部 N 张结果”（后者需要文档协议支持按查询选择）。
4. **`CardEditorForm` 拆分的回归面**：表单逻辑分散（类型互斥、等级 / 刻度打包），拆分前需补齐 domain 层测试，以保证桌面行为不变。
5. **左右滑切卡与系统手势冲突**：iOS 边缘返回手势、Android 返回手势都在屏幕边缘，滑动切卡需忽略距边缘 24px 内的起点。
6. **待定**：移动端是否需要“快速编辑”模式（列表中直接修改攻 / 守等少数字段）；暂不纳入本方案。
