# DataEditorY

DataEditorY 是一个用于编辑 YGOPro `.cdb` 数据库的桌面应用。项目基于 Tauri 2、Svelte 5、TypeScript 和 `sql.js` 构建，界面语言支持中文和英文。

当前版本提供数据库打开、创建、搜索、筛选、规则表达式搜索、卡片编辑、图片导入、卡图制卡器、多标签页切换、基础快捷键操作，以及 AI 辅助功能（稿件解析、脚本生成、卡图翻译）。

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

启动 `base` 变体的前端开发服务器：

```bash
bun run dev:base
```

启动 Tauri 桌面开发模式：

```bash
bun run tauri:dev
```

启动指定变体的 Tauri 桌面开发模式：

```bash
bun run tauri:dev:base
bun run tauri:dev:extra
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

分别构建 `base` / `extra` 前端资源：

```bash
bun run build:base
bun run build:extra
```

构建桌面应用安装包或可执行文件：

```bash
bun run tauri:build
```

构建指定变体或一次构建两个变体：

```bash
bun run tauri:build:base
bun run tauri:build:extra
bun run tauri:build:all
```

如果你习惯使用 `npm`，也可以将上面的 `bun` 命令替换为对应的 `npm` 命令。

变体说明：

- `base`：只保留 cdb 编辑功能，不包含制卡器与 AI 相关功能
- `extra`：包含 cdb 编辑、制卡器与 AI 相关功能
- 两个变体共用同一个主版本号，差异由 build variant 决定，而不是维护两套版本号

Tauri 构建产物通常位于：

- `src-tauri/target/release/`
- `src-tauri/target/release/bundle/`

实际输出内容会根据操作系统和 Tauri 配置有所不同。

GitHub Actions 发布时，Windows 还会额外产出一个便携版压缩包：

- `DataEditorY-windows-portable.zip`

解压后目录结构类似：

```text
DataEditorY-windows-portable/
  DataEditorY.exe
  resources/
    strings.conf
    cover.jpg
```

其中：

- 安装包适合普通用户直接安装
- 便携版适合解压后直接运行，不需要安装
- 便携版中的 `resources/` 目录包含应用依赖的附加资源文件，请保持与 `DataEditorY.exe` 同级

### 资源文件说明

当前会随应用一起分发的额外资源文件位于：

- `resources/strings.conf`
- `resources/cover.jpg`
- `resources/yugioh-card/`

其中 `cover.jpg` 作为默认卡图占位图使用，`strings.conf` 用于提供 setcode 名称等基础数据，`yugioh-card/` 用于提供制卡器预览和导出所需的静态卡模资源。

### `strings.conf` 说明

构建产物默认会包含一份位于 `resources/strings.conf` 的内置数据文件。

如果你需要自行维护或快速更新这份数据，可以在程序当前目录放置一个外部 `strings.conf`，应用启动时会优先读取当前目录下的文件；只有在外部文件不存在时，才会回退到内置版本。

这意味着：

- 默认安装包或构建产物开箱即用
- 用户可以通过替换当前目录下的 `strings.conf` 来覆盖默认数据
- 不需要重新构建应用即可更新这份配置

## 主要功能

- 打开和创建 `.cdb` 数据库
- 多标签页切换多个数据库
- 通过名称、描述、ID、攻击力、守备力、类型、属性、种族、setcode 和规则表达式进行搜索和筛选
- 编辑卡片基础字段、类型、灵摆刻度、连接标记、提示文本和 setcode
- 导入卡图到数据库同级目录下的 `pics/` 文件夹
- 使用右侧制卡器生成卡图预览，并导出 PNG 或保存 JPG 到当前数据库同级 `pics/` 目录
- 在内存中修改数据库内容，并手动保存到磁盘
- 支持左侧列表多选、批量复制、批量粘贴、批量删除
- 支持跨数据库复制和粘贴卡片
- AI 辅助稿件解析：将自然语言卡片描述自动转换为结构化数据
- AI 辅助脚本生成：根据卡片效果文本自动生成 EDOPro/YGOPro Lua 脚本
- AI 辅助卡图翻译：将卡名、类型、效果翻译为目标语言（日语翻译支持一字一注的注音标注）
- 设置面板：配置 AI 服务商、自定义脚本模板、管理封面图片

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

除了普通筛选外，高级筛选面板还支持“规则文本”搜索。卡片密码、描述文本和规则文本输入框都支持按回车直接触发搜索。

#### 规则文本搜索

规则文本适合表达卡片基本信息之间的比较，或写出比普通筛选更灵活的组合条件。

当前支持的基本信息包括：

- 攻击力：`atk`
- 守备力：`def`
- 等级：`level` | `lv`
- 左灵摆刻度：`scale` | `ls`
- 右灵摆刻度：`rscale` | `rs`
- 属性：`attribute` | `attr`
- 种族：`race` | `rc`
- 卡片类型：`type` | `tp`
- 连接标记：`linkmarker` | `lm`

其中：

- `attribute`、`race`、`type`、`linkmarker` 支持使用 `contains` / `has` / `包含`
- 支持中英文关键字和部分常见别名，例如属性、种族、连接箭头等中文写法

支持的逻辑与比较运算包括：

- `and` / `&&` / `且`
- `or` / `||` / `或`
- `not` / `非`
- `>`
- `<`
- `>=`
- `<=`
- `=`
- `!=`
- `<>`
- `contains`

示例：

- `atk > def and level < 3`
- `atk=def and attr=光`
- `attribute = dark and race = dragon`
- `type contains fusion or type contains synchro`
- `linkmarker contains left and linkmarker contains right`
- `scale >= 1 and rscale <= 8`
- `lm contains left and tp contains link and lv >= 4`

如果规则表达式有误，界面会弹出错误提示，并在规则文本输入框下方显示具体原因。

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

### 7. 制卡器

右侧编辑器底部提供 `编辑卡图` 按钮，用于打开制卡器抽屉。

制卡器支持：

- 基于当前 `cdb` 卡片数据自动预填卡名、卡片类型、属性、种族、效果文本等字段
- 上传卡图素材并使用正方形裁剪框调整中间图区域
- 根据左侧表单实时刷新右侧卡图预览
- 通过比例滑条控制导出 JPG 的缩放比例
- 将渲染结果保存为：
  - `PNG`：通过保存对话框导出最大尺寸 PNG
  - `JPG`：直接保存到 `<数据库所在目录>/pics/<卡片密码>.jpg`

说明：

- 制卡器允许在未上传中间图的情况下直接导出空图框版本卡面
- 当 `pics/` 中已存在同名 JPG 时，应用会先提示是否替换
- 外层编辑器中的单击卡图导入功能会在图片大于 `400 x 580` 时自动等比压缩后再保存为 JPG

### 8. AI 辅助功能

编辑器中提供以下 AI 驱动功能（需在设置面板中配置 AI 服务）：

#### 稿件解析

在编辑器中点击 `AI 解析` 按钮，可以将自然语言的卡片描述文本自动解析为结构化的卡片数据：

- 支持一次性解析多张卡片
- 自动识别卡名、效果文本、类型、属性、种族、攻守值、等级等字段
- 对于稿件中未提及的字段，保持为 null 而不进行猜测
- AI 可以通过工具查阅已打开的数据库作为参考

#### 脚本生成

在编辑器中点击 `AI 生成脚本` 按钮，可以根据当前卡片的效果文本自动生成 EDOPro/YGOPro Lua 脚本：

- 生成完整可运行的 Lua 脚本骨架
- AI 内置了 EDOPro API 常量参考、效果注册模式、常见模式代码示例
- 支持查阅已打开数据库中的相似卡片和现有脚本作为参考
- 对模糊效果文本会生成保守实现并留下 TODO 注释

#### 卡图翻译

在制卡器中点击 `翻译` 按钮，可以将卡名、类型行、效果文本翻译为指定语言：

- 保留换行符和卡片游戏格式（效果分隔符、卡名引号等）
- 使用官方 Yu-Gi-Oh! 术语
- 翻译为日语时，自动为所有汉字添加一字一注式注音（送假名），格式为 `[漢(かん)][字(じ)]`，与制卡器的 ruby 渲染系统兼容

### 9. 设置面板

点击顶部工具栏的设置按钮打开设置面板，可以配置：

- **AI 服务**
  - API Base URL：AI 服务端点（默认为 OpenAI）
  - Model：使用的模型名称
  - Secret Key：API 密钥（加密存储于本地配置目录）
  - 连接测试
- **脚本模板**：新建卡片时使用的 Lua 脚本模板
- **封面图片**：自定义缺省卡图占位图

## 快捷键

### 全局快捷键

- `Ctrl/Cmd + O`：打开数据库
- `Ctrl/Cmd + N`：创建数据库
- `Ctrl/Cmd + Shift + N`：新建卡片草稿
- `Ctrl/Cmd + S`：保存当前数据库
- `Ctrl/Cmd + Z`：撤回上一次数据库操作（会先弹出确认框）
- `Ctrl/Cmd + F`：聚焦左侧搜索框

### 列表相关快捷键

- `Ctrl/Cmd + C`：复制当前选中的卡片
- `Ctrl/Cmd + V`：将已复制的卡片粘贴到当前数据库
- `Ctrl/Cmd + D`：删除当前选中的卡片

说明：

- 复制和粘贴使用应用内剪贴板，可跨标签页、跨数据库使用
- 如果粘贴的卡片在目标数据库中已存在相同密码，应用会先弹出确认
- 当焦点位于输入框、下拉框、文本域或可编辑区域中时，全局快捷键默认不拦截输入行为，只有 `Ctrl/Cmd + S` 仍然可用
- 因此文本输入中的 `Ctrl/Cmd + Z` 会继续使用系统/控件原生撤销，不会触发全局撤回
- 全局 `Ctrl/Cmd + Z` 仅在非文本编辑场景下生效，用于撤回上一次数据库级操作

### 撤回说明

- 当前支持撤回的操作包括单卡编辑、批量修改/粘贴、单张删除和批量删除
- 撤回历史按标签页分别记录，不同数据库标签页互不影响
- 当前撤回栈最多保留 100 次操作，超出后会丢弃最早的记录
- 撤回的是数据库层操作，不包含尚未点击 `修改`/`另存为` 前的文本框草稿编辑

## 数据与保存说明

- 数据库在打开后会被载入到内存中
- 编辑、删除、批量粘贴等操作默认先改内存中的数据
- 点击 `保存数据库` 后才会写回原始 `.cdb` 文件
- 关闭程序前如果没有保存，未写盘的更改不会保留

## 项目结构

```text
src/
  lib/
    components/
      CardEditor.svelte       # 卡片编辑器
      CardList.svelte          # 卡片列表
      CardImageDrawer.svelte   # 制卡器抽屉
      SettingsPanel.svelte     # 设置面板
      Toast.svelte             # 提示通知
    i18n/
    stores/
      appSettings.svelte.ts    # 应用设置状态
      appShell.svelte.ts       # 应用外壳状态
      cardClipboard.svelte.ts  # 卡片剪贴板
      db.ts                    # 数据库操作
      editor.svelte.ts         # 编辑器状态
      toast.svelte.ts          # 提示通知状态
    types/
    utils/
      ai.ts                    # AI 服务集成
      card.ts                  # 卡片数据工具
      cardImage.ts             # 卡图渲染配置
      setcode.ts               # setcode 解析
      shortcuts.ts             # 快捷键定义
  routes/
    +layout.svelte
    +page.svelte
src-tauri/
  src/
    lib.rs                     # Tauri 后端命令
    main.rs
```

## 技术栈

- Tauri 2
- Svelte 5
- TypeScript
- Vite
- SvelteKit
- sql.js
- svelte-i18n
- `ygopro-cdb-encode`
- `cdb2yugiohcard`
- `yugioh-card`

## 依赖声明

本项目在卡片数据读取、结构转换和卡图渲染上直接使用了以下开源库：

- [`ygopro-cdb-encode`](https://www.npmjs.com/package/ygopro-cdb-encode)
  - 用于读取、创建、修改和保存 YGOPro `.cdb` 数据结构
- [`cdb2yugiohcard`](https://www.npmjs.com/package/cdb2yugiohcard)
  - 用于把 `CardDataEntry` 转换成 `yugioh-card` 所需的卡图数据格式
- [`yugioh-card`](https://www.npmjs.com/package/yugioh-card)
  - 用于在前端预览并导出最终卡图

制卡器功能基于上述库组合实现，相关能力与资源文件请遵循对应库的许可证与使用要求。

## 说明

- 本项目主要面向 YGOPro `.cdb` 数据库编辑场景
- 当前 `README` 以仓库中的现有实现为准
- 如果后续功能、脚本或构建流程发生变化，文档也需要同步更新
