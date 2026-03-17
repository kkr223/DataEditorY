# DataEditorY

DataEditorY 是一个用于编辑 YGOPro `.cdb` 数据库的桌面应用。项目基于 Tauri 2、Svelte 5、TypeScript 和 `sql.js` 构建，界面语言支持中文和英文。

当前版本提供数据库打开、创建、搜索、筛选、卡片编辑、图片导入、多标签页切换以及基础快捷键操作。

## 环境要求

开发或构建前需要准备以下环境：

- Node.js 18 或更高版本
- Bun
- Rust 工具链
- Tauri 2 构建依赖

Tauri 的系统依赖请参考官方文档：

- [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## 安装

```bash
bun install
```

如果你是从仓库开始：

```bash
git clone <repo-url>
cd DataEditorY
bun install
```

## 开发

仅启动前端开发服务器：

```bash
bun run dev
```

启动 Tauri 桌面开发模式：

```bash
bun run tauri dev
```

运行类型检查和 Svelte 检查：

```bash
bun run check
```

## 构建

构建前端资源：

```bash
bun run build
```

构建桌面应用安装包或可执行文件：

```bash
bun run tauri build
```

如果你习惯使用 `npm`，也可以将上面的 `bun` 命令替换为对应的 `npm` 命令。

Tauri 构建产物通常位于：

- `src-tauri/target/release/`
- `src-tauri/target/release/bundle/`

实际输出内容会根据操作系统和 Tauri 配置有所不同。

### `strings.conf` 说明

构建产物默认会包含一份内置的 `strings.conf`，用于提供 setcode 名称等基础数据。

如果你需要自行维护或快速更新这份数据，可以在程序当前目录放置一个外部 `strings.conf`，应用启动时会优先读取当前目录下的文件；只有在外部文件不存在时，才会回退到内置版本。

这意味着：

- 默认安装包或构建产物开箱即用
- 用户可以通过替换当前目录下的 `strings.conf` 来覆盖默认数据
- 不需要重新构建应用即可更新这份配置

## 主要功能

- 打开和创建 `.cdb` 数据库
- 多标签页切换多个数据库
- 通过名称、描述、ID、攻击力、守备力、类型、属性、种族、setcode 进行搜索和筛选
- 编辑卡片基础字段、类型、灵摆刻度、连接标记、提示文本和 setcode
- 导入卡图到数据库同级目录下的 `pics/` 文件夹
- 在内存中修改数据库内容，并手动保存到磁盘
- 支持左侧列表多选、批量复制、批量粘贴、批量删除
- 支持跨数据库复制和粘贴卡片

## 使用方式

### 1. 打开或创建数据库

使用顶部工具栏中的：

- `打开`
- `创建`

打开现有 `.cdb` 文件后，应用会在新标签页中载入数据库。创建数据库时会先生成一个新的空数据库文件。

### 2. 搜索和筛选卡片

左侧面板提供：

- 名称搜索
- 高级筛选面板
- 分页浏览

输入名称后按回车，或点击搜索按钮执行查询。高级筛选可以组合多个条件。

### 3. 选择卡片

左侧列表支持以下选择方式：

- 单击：选中单张卡片
- `Ctrl` + 单击：增减多选
- `Shift` + 单击：按当前锚点进行区间选择
- `Ctrl` + `Shift` + 单击：在保留已有选择的基础上追加区间

右侧编辑器会显示当前主选中的卡片。

### 4. 编辑卡片

在右侧编辑器中可以修改：

- 卡片密码、别名、名称、描述
- 攻击力、守备力、等级
- 类型位
- 属性、种族、许可
- 灵摆刻度
- 连接标记
- setcode
- 提示文本

修改后点击：

- `修改`：保存到当前内存数据库
- `另存为`：以当前密码另存一张卡
- `删除`：删除当前主选中卡

这些操作会先作用于内存中的数据库，只有点击 `保存数据库` 后才会写回磁盘。

### 5. 导入卡图

在编辑器中的卡图区域：

- 单击：选择图片文件并导入
- 双击：预览当前卡图

导入的图片会保存为：

- `<数据库所在目录>/pics/<卡片密码>.jpg`

### 6. 保存数据库

点击右上方的 `保存数据库`，或使用快捷键保存当前活动标签页对应的数据库。

## 快捷键

### 全局快捷键

- `Ctrl/Cmd + O`：打开数据库
- `Ctrl/Cmd + N`：创建数据库
- `Ctrl/Cmd + Shift + N`：新建卡片草稿
- `Ctrl/Cmd + S`：保存当前数据库
- `Ctrl/Cmd + F`：聚焦左侧搜索框

### 列表相关快捷键

- `Ctrl/Cmd + C`：复制当前选中的卡片
- `Ctrl/Cmd + V`：将已复制的卡片粘贴到当前数据库
- `Ctrl/Cmd + D`：删除当前选中的卡片

说明：

- 复制和粘贴使用应用内剪贴板，可跨标签页、跨数据库使用
- 如果粘贴的卡片在目标数据库中已存在相同密码，应用会先弹出确认
- 当焦点位于输入框、下拉框或文本域中时，复制、粘贴、删除快捷键不会拦截默认输入行为

## 数据与保存说明

- 数据库在打开后会被载入到内存中
- 编辑、删除、批量粘贴等操作默认先改内存中的数据
- 点击 `保存数据库` 后才会写回原始 `.cdb` 文件
- 关闭程序前如果没有保存，未写盘的更改不会保留
- 应用会默认使用内置的 `strings.conf`
- 如果程序当前目录存在外部 `strings.conf`，则会优先使用外部文件覆盖内置版本

## 项目结构

```text
src/
  lib/
    components/
      CardEditor.svelte
      CardList.svelte
      Toast.svelte
    i18n/
    stores/
      cardClipboard.svelte.ts
      db.ts
      editor.svelte.ts
      toast.svelte.ts
    types/
    utils/
  routes/
    +layout.svelte
    +page.svelte
src-tauri/
  src/
    lib.rs
    main.rs
```

## 技术栈

- Tauri 2
- Svelte 5
- TypeScript
- Vite
- SvelteKit
- sql.js
- `ygopro-cdb-encode`

## 说明

- 本项目主要面向 YGOPro `.cdb` 数据库编辑场景
- 当前 `README` 以仓库中的现有实现为准
- 如果后续功能、脚本或构建流程发生变化，文档也需要同步更新
