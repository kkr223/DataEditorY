# DataEditorY

DataEditorY 是一个用于编辑 YGOPro `.cdb` 数据库的桌面应用，基于 Tauri 2、Svelte 5、TypeScript、Rust 和 SQLite 构建，支持中文与英文界面。

项目提供两个变体：

- `base`：仅保留 `.cdb` 编辑功能
- `extra`：额外包含制卡器与 AI 相关功能

## 功能概览

- 打开、创建、搜索和编辑 `.cdb` 数据库
- 拖拽打开、文件关联打开、最近打开记录、多标签页切换
- 按名称、描述、ID/Alias 前缀、攻守、类型、属性、种族、setcode 和规则表达式搜索
- 支持按**图片文件夹**筛选：选择本地 `pics/` 目录后，自动解析其中的文件名（数字文件名视为卡片密码，非数字文件名视为卡片名称并在数据库中查找对应密码），仅展示目录中存在图片的卡片
- 支持按**卡组文本**筛选：粘贴或导入 `.ydk` / `.txt` 文件，仅展示卡组中包含的卡片；可与图片文件夹筛选同时启用，取两者交集
- 支持 DataEditorX 风格的基础信息快捷搜索：清空为新卡后，可直接根据当前草稿里的基础信息一键检索
- 批量选择、复制、粘贴、删除，以及数据库级撤回
- 内置 Lua 脚本编辑器，支持补全、签名提示、hover、基础诊断与内置手册
- 将数据库与同目录下的 `pics/`、`script/` 一键打包为 ZIP 或 YPK
- 支持多来源数据库合并、冲突分析，以及按优先级覆盖卡图和脚本
- `extra`：导入卡图、制卡器、AI 稿件解析、AI 指令模式、AI 脚本生成、卡图翻译

## 环境要求

- Node.js 18+
- Bun
- Rust 工具链
- Tauri 2 构建依赖

Tauri 系统依赖可参考官方文档：[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## 安装

```bash
bun install
```

如果从仓库开始：

```bash
git clone <repo-url>
cd DataEditorY
bun install
```

### Linux / Arch 运行提醒

在部分较新的 Arch Linux 环境中，`AppImage` 版本可能出现启动后白屏，或中文显示异常。

如果遇到白屏，可先尝试：

```bash
LD_PRELOAD=/usr/lib/libwayland-client.so ./DataEditorY*.AppImage
```

如果界面可以正常显示，但中文字体异常或缺字，通常是系统未安装中文字体，可执行：

```bash
sudo pacman -S noto-fonts noto-fonts-cjk
```

## 开发与构建

常用命令：

```bash
# 前端开发
bun run dev
bun run dev:base
bun run dev:extra

# 桌面开发
bun run tauri:dev
bun run tauri:dev:base
bun run tauri:dev:extra

# 检查
bun run check

# 前端构建
bun run build
bun run build:base
bun run build:extra

# 桌面构建
bun run tauri:build
bun run tauri:build:base
bun run tauri:build:extra
bun run tauri:build:all
```

补充说明：

- `check`、`dev`、`build` 前会自动生成 Lua 智能目录
- 开发模式默认使用 `127.0.0.1:43127`，HMR 端口为 `43128`
- `tauri:dev` 与 `tauri:build` 默认构建 `extra` 变体
- 桌面构建产物通常位于 `src-tauri/target/release/` 和 `src-tauri/target/release/bundle/`

## 资源文件

运行时会使用以下附加资源：

- `resources/strings/`
- `resources/cover.jpg`
- `resources/lua-intel/`
- `resources/yugioh-card/`（仅 `extra`）

Lua 编辑器相关资源的维护方式：

- 源文件位于 `static/resources/_functions.txt`、`static/resources/constant.lua`、`static/resources/snippets.json`
- 构建脚本会据此生成 `src/lib/data/lua-intel/`
- 日常维护只需要修改 `static/resources/` 下的源文件，不要直接修改生成产物
- 桌面版运行时会优先读取程序目录下的 `resources/lua-intel/`

字符串资源支持目录聚合：程序会读取 `strings/` 目录下的所有有效文本文件，并与内置资源一起合并使用。

- 内置基础资源位于 `static/resources/strings/`
- 桌面版运行时会额外扫描程序当前目录、程序目录及其 `resources/strings/`
- 目录中的文本文件会按文件名顺序依次合并，方便分模块维护
- 无效 UTF-8、疑似二进制、超大文件和子目录内容会被自动忽略
- 为兼容旧版本，若目录不存在，仍会回退读取单个 `strings.conf`

## 使用概览

### 打开与保存

- 可通过“打开”“创建”、拖拽文件或系统文件关联载入 `.cdb`
- 编辑操作先写入当前标签页的会话工作副本
- 点击“保存数据库”后才会真正写回磁盘
- Lua 脚本标签保存的是 `.lua` 文件本身，不会替代数据库保存

### 搜索与编辑

- 左侧支持名称搜索、高级筛选和分页
- 支持 DataEditorX 风格的快捷搜索：在右下角使用“重置搜索 / 清空为新卡 / 搜索”按钮，可把当前草稿中的名称、描述、攻守、类型、属性、种族、setcode 等基础信息直接带入检索
- 顶部名称搜索与描述搜索默认使用模糊匹配，适合快速缩小结果范围
- `ID / Alias` 输入框使用纯数字前缀匹配：输入 `473` 会匹配密码或同名卡以 `473` 开头的记录
- DEX 风格快捷搜索中的数值字段遵循 YGOPro 常见约定：`-1` 用于匹配原始值为 `0` 的场景，因此像攻击力、守备力、灵摆刻度这类字段在需要搜索 `0` 时应输入 `-1`
- 规则文本搜索适合做组合条件、数值比较和位掩码判断
- 规则文本常用字段包括：`id`、`alias`、`atk`、`def`、`level`、`attribute`、`race`、`type`、`linkmarker`
- 规则文本常用运算包括：`and`、`or`、`not`、`>`、`<`、`>=`、`<=`、`=`、`!=`、`contains`
- `contains` 也可以写成更短的 `&`，例如 `type & fusion`
- **图片文件夹筛选**：在高级筛选面板底部点击"选择文件夹"，选择本地 `pics/` 目录。数字文件名（如 `89631139.jpg`）直接解析为卡片密码；非数字文件名（如 `青眼白龙.jpg`）会在当前数据库中按名称查找对应密码。选定后立即触发搜索，翻页时不会重复扫描目录，结果已缓存；对数据库进行修改或撤回操作后缓存自动失效
- **卡组文本筛选**：在高级筛选面板底部直接粘贴 YDK 格式文本，或点击"导入 YDK"选择 `.ydk` / `.txt` 文件。导入后立即触发搜索，仅展示卡组中出现的卡片密码对应的记录
- 两者可同时启用：搜索结果取图片文件夹与卡组文本的交集，再叠加其他筛选条件

示例：

```text
atk > def and level < 3
id >= 473 and alias = 0
attribute = dark and race = dragon
type contains fusion or type contains synchro
type & effect and linkmarker & up
```

### Lua 脚本编辑器

- 卡片编辑器中可直接打开对应脚本：`<数据库目录>/script/c<密码>.lua`
- 脚本不存在时会按设置中的模板创建
- 支持 `aux.Stringid(id, n)` 对应文本查看与编辑
- 支持内置常量手册与函数手册，可在编辑器中搜索并插入条目
- 默认快捷键：`F9` 打开常量手册，`F10` 打开函数手册
- 可将当前脚本导出为带语法高亮的代码图片，图片顶部会附带卡片基础信息与效果文本
- 默认会将代码图片写入系统剪贴板；若在设置中开启“同时保存到本地”，还会额外保存到当前 `cdb` 所在目录，文件名与脚本同名、后缀为 `.png`
- 若编辑器中存在选区，导出按钮会切换为“导出选中代码”，只导出选中涉及到的行，并保留原始行号
- `snippets.json` 中可定义 `#` 前缀自定义 snippet

### 打包与合并

- 可将当前数据库及同目录资源打包为 ZIP 或 YPK
- 打包时会一并收集同目录下的 `pics/`、`script/` 等资源
- 合并 CDB 时可添加多个数据库来源，也可从文件夹批量收集项目
- 来源列表越靠后优先级越高，后面的来源会覆盖前面的同密码卡片
- 合并前可先分析重复密码、最终卡片数、主卡图、场地图和脚本覆盖计划
- 可选择是否同时覆盖卡图与脚本，合并完成后结果会直接打开

### `extra` 功能

- 导入卡图到 `<数据库目录>/pics/<卡片密码>.jpg`
- 使用制卡器预览并导出 PNG 或 JPG
- 使用 AI 解析稿件、执行自然语言指令、生成脚本、翻译卡图文本
- AI 指令模式适合做批量改卡、按条件替换文本，以及基于当前选择或当前数据库执行批量处理

## 快捷键

- `Ctrl/Cmd + O`：打开数据库
- `Ctrl/Cmd + N`：创建数据库
- `Ctrl/Cmd + Shift + N`：新建卡片草稿
- `Ctrl/Cmd + S`：保存当前数据库
- `Ctrl/Cmd + Enter`：保存当前卡片草稿改动
- `Ctrl/Cmd + Z`：撤回上一次数据库操作
- `Ctrl/Cmd + F`：聚焦搜索框
- `Ctrl/Cmd + C`：复制选中卡片
- `Ctrl/Cmd + V`：粘贴卡片
- `Ctrl/Cmd + D`：删除选中卡片
- `↑ / ↓`：在主编辑器中切换当前页上一张 / 下一张卡片
- `← / →`：在主编辑器中切换上一页 / 下一页
- 在 Lua 编辑器中按住 `Alt/Option`：暂时隐藏当前函数说明，松开后恢复显示
- 在 Lua 编辑器中使用`F9`打开常量手册，`F10`打开函数手册

说明：

- 撤回按数据库标签页分别记录，最多保留 100 次
- 当焦点位于输入区域时，大多数全局快捷键不会拦截原生输入行为
- 方向键导航仅作用于主卡片编辑器，不会覆盖 Lua 脚本编辑器中的上下左右
- 如果当前卡片草稿有未保存修改，使用方向键切卡或翻页前会先弹窗确认

## 项目结构

```text
src/
  lib/
    components/     # 界面组件
    stores/         # 应用状态与数据库编辑状态
    utils/          # AI、卡片处理、快捷键、Lua 编辑器等工具
    data/lua-intel/ # Lua 智能目录生成产物
  routes/           # Svelte 页面入口
scripts/            # 构建与变体脚本
static/resources/   # Lua 补全、常量、snippet 源资源
src-tauri/          # Tauri/Rust 后端
```

## 技术栈与依赖

- Tauri 2
- Svelte 5
- TypeScript
- Vite / SvelteKit
- Rust / SQLite
- `rusqlite`
- `ygopro-cdb-encode-rs`
- `yugioh-card`

其中：

- `ygopro-cdb-encode-rs` 用于 Rust 侧的 YGOPro CDB 读写、查询与字段语义处理，是当前数据库检索与后续 Rust 化能力的基础库
- `yugioh-card` 主要用于制卡器相关的卡图渲染
