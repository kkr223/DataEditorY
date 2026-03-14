# DataEditorY - 现代 YGOPro 数据库编辑器

（本项目尚在开发中）
一个快速、现代且功能齐全的 YGOPro 数据库 (`cards.cdb`) 图形化编辑器。
基于 **Tauri 2** (Rust + Native Shell), **Svelte 5** (Runes) 和 **Vite** 构建。

## 主要特性

- **多标签页编辑** — 支持同时打开和切换多个 `.cdb` 数据库，缓存机制确保切换瞬间完成。
- **内存级 SQL 处理** — 通过 WebAssembly (`sql.js` + `ygopro-cdb-encode`) 加载数据库，所有处理均在浏览器中进行，零延迟。
- **深度搜索与过滤** — 可通过名称、ID、描述、攻击力/守备力、类型、属性、种族等进行精确过滤。
- **全功能卡片编辑器** — 响应式布局支持编辑所有卡片属性。Link 箭头和灵摆刻度面板会根据卡片类型动态显示。
- **可视化图片管理** — 使用原生文件选择器导入卡片原画，通过 Tauri 的资产协议 (`convertFileSrc`) 低开销加载。
- **原生 Setcode 解码** — 自动解析 `strings.conf` 以便将十六进制字段名映射为可读的系列名称（例如 `0x0001` → "盟军次世代"）。
- **国际化 (i18n)** — 基于 `svelte-i18n` 实现的全界面语言适配。

## 环境要求

- [Node.js](https://nodejs.org/) ≥ 18
- [Bun](https://bun.sh/) (推荐) 或 npm
- [Rust](https://rustup.rs/) (用于构建 Tauri 原生外壳)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/)

## 安装与启动

```bash
git clone <repo-url>
cd DataEditorY
bun install          # 或 npm install
```

## 开发模式

```bash
bun tauri dev        # 启动热更新模式
```

前端服务运行在 `http://localhost:1420`，Tauri 会自动打开一个原生窗口。

## 打包

```bash
bun tauri build      # 编译生产环境包及安装程序
```

输出的二进制文件位于 `src-tauri/target/release/`。

## 使用指南

1. **打开数据库** — 点击顶部工具栏的 "打开 CDB" 按钮。支持同时加载多个文件。
2. **搜索与过滤** — 输入卡片名称并回车，或点击 🔍 按钮。点击过滤图标展开高级过滤。
3. **编辑卡片** — 在列表中点击卡片。修改右侧面板中的任何字段后，点击 **修改**。
4. **管理图片** — 点击卡片预览图区域以导入图片。选中的图片将重命名并保存至 `.cdb` 同级目录下的 `pics/` 文件夹中。
5. **保存更改** — 点击 **保存数据库** 将内存中的所有修改写回磁盘。

> **提示：** 所有的编辑在点击 **保存数据库** 之前都是在内存中进行的。

## 项目架构

```
src/
├── lib/
│   ├── components/
│   │   ├── CardEditor.svelte   # 右侧卡片编辑表单
│   │   └── CardList.svelte     # 左侧搜索、过滤及卡组列表
│   ├── stores/
│   │   ├── db.ts               # CDB 分页管理、SQL 查询及 CRUD
│   │   └── editor.svelte.ts    # 基于 Svelte 5 Runes 的状态管理
│   ├── utils/
│   │   └── setcode.ts          # setcode 十六进制↔名称解析
│   ├── i18n/                   # 多语言文件
│   └── types/                  # TypeScript 类型定义
├── routes/
│   ├── +layout.svelte          # 应用外壳、标签页工具栏
│   └── +page.svelte            # 主编辑页面
src-tauri/                      # Rust 后端 (文件 I/O, 原生系统调用)
```

## 技术路线

| 层级 | 技术栈 |
|-------|-----------|
| 原生外壳 | Tauri 2 (Rust) |
| UI 框架 | Svelte 5 (Runes) |
| 编程语言 | TypeScript |
| 数据库引擎 | sql.js (WebAssembly SQLite) |
| CDB 编解码 | [ygopro-cdb-encode](https://github.com/YGO-fbi/ygopro-cdb-encode) |
| 构建工具 | Vite + SvelteKit |

## 推荐 IDE 配置

[VS Code](https://code.visualstudio.com/) + [Svelte](https://marketplace.visualstudio.com/items?itemName=svelte.svelte-vscode) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

