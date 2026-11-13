# DataEditorY Web 移植方案

> 状态：设计稿 · 适用版本：3.4.x（`dev` 分支 `625887e` 之后）
> 目标读者：参与 Web 变体开发的人员

## 1. 目标与范围

### 1.1 目标

新增一个 `web` 构建变体，产物是纯静态站点：

- 不依赖任何后端服务器，静态托管（GitHub Pages、Cloudflare Pages 等）即可运行；
- 首次加载后可离线使用（PWA），可“添加到主屏幕”；
- 先在桌面 Chromium/Firefox/Safari 跑通全部保留功能，再做移动端专用 UI；
- 与桌面版（Tauri `base` / `extra`）共用同一仓库、同一套 domain/stores/i18n 代码。

### 1.2 保留的功能（用户需求层面复原）

| 功能 | 说明 |
|---|---|
| CDB 打开 / 新建 / 关闭 / 多标签 | 打开改为“导入文件”，保存改为“下载”或写回文件句柄 |
| Card Explorer | 快速搜索、高级筛选、规则表达式、筛选 chip、分页、多选 |
| 单卡编辑 | 草稿 / 校验 / 提交 / 撤销，与桌面行为一致 |
| 从草稿搜索、改卡号、复制粘贴卡片、新建异画 | 一致 |
| 卡片分组 | 存于浏览器内的工作区元数据 |
| 批量字段编辑 | 一致（纯前端逻辑） |
| 导出筛选结果为新 CDB | 结果下载 |
| 合并 CDB | 多文件导入；资源合并需导入资源 |
| 打包 zip / ypk | 需导入资源；结果下载 |
| 资源检查 | 需导入资源 |
| 展示图生成 | 需卡图；结果下载 PNG |
| 设置 | 仅保留与上述功能相关的项（语言、主题、快捷键、打包规则、封面） |
| 中英文界面 | 一致 |

### 1.3 不做的功能（本阶段）

- 制卡器（card-image 模块、`yugioh-card-ts`、82 MB 资源）；
- Lua 编辑器、脚本 surface、Lua 批量替换、Lua 智能提示；
- AI surface 及所有 AI 设置；
- 全局搜索 surface；
- 中间的 surface rail（只剩卡片编辑，不需要切换）；
- 桌面专属：在资源管理器中显示、外部编辑器打开、文件关联、单实例、原生拖拽事件。

后续需要时再按模块逐个接回，不影响本方案的结构。

### 1.4 交互模型的变化

| 桌面版 | Web 版 |
|---|---|
| 按路径打开 `.cdb`，同目录自动关联 `pics/`、`script/`、`strings.conf` | 导入 `.cdb`；可选再导入资源（文件夹或 zip） |
| 工作副本在系统临时目录 | 工作副本在内存 + OPFS（崩溃/刷新可恢复） |
| 保存 = 原子写回原文件 | 保存 = 下载；支持 File System Access 的浏览器可写回原文件句柄 |
| `.dey/{stem}.workspace.json` 在 CDB 旁边 | IndexedDB 中按工作区存储，可导出/导入 |
| 设置在 `appConfigDir/settings.json` | `localStorage` / IndexedDB |
| 输出文件选保存路径 | 浏览器下载（或 `showSaveFilePicker`） |

## 2. 现状梳理

### 2.1 前后端边界

前端与 Tauri 的耦合集中在以下位置（`625887e` 之后）：

| 位置 | 内容 |
|---|---|
| `src/lib/infrastructure/tauri/index.ts` | `invokeCommand`、`tauriBridge`（dialog、path、event、convertFileSrc、resolveResource、appConfigDir） |
| `src/lib/infrastructure/tauri/documentHost.ts` | document host 协议：`provider_open/query/execute/save/undo/close` |
| `src/lib/infrastructure/tauri/commands.ts` | 约 25 个直接命令（文件读写、合并、打包、脚本、资源等） |
| `src/lib/native/*Api.ts` | 对上层的类型化 API，内部调用上面两者 |
| `src/lib/platform/appRuntime.ts` | `CodecContext` 绑定 Tauri 文件 IO |
| `src/lib/modules/cdb/index.ts` | 直接 `new TauriDocumentProvider` |
| 直接 import `@tauri-apps/*` | `utils/mediaProtocol.ts`、`features/shell/layoutController.svelte.ts`、`features/shell/dialogsController.svelte.ts` |
| `tauriBridge.*` 散落调用 | stores、application、features、components 中 40+ 处（对话框、`join/dirname`、`ask`、`listen`） |
| 直接 `invokeCommand` | `stores/appSettings.svelte.ts`、`utils/errorLog.ts`、`native/settingsApi.ts` |

### 2.2 Rust 后端需要在 Web 侧复原的能力

| Rust 模块 | 职责 | Web 侧处理 |
|---|---|---|
| `document_host/search.rs` | `CardSearchExpression` → SQL | **移植到 TS**（纯函数） |
| `document_host/cdb.rs` | query/execute/undo/save、写前校验、改卡号资源迁移 | **移植到 TS** |
| `services/cdb_cards.rs`、`cdb_session.rs`、`session/cdb.rs` | 会话、工作副本 | 用内存 `Database` + OPFS 快照替代 |
| `services/merge.rs` | 合并计划与执行 | **移植到 TS**，数据来源改为导入的文件 |
| `services/package.rs` | 打包规则渲染、脚本依赖解析、zip | **移植到 TS**，zip 用 `fflate` |
| `services/assets_check.rs`、`assets.rs` | 资源检查、资源路径规则 | **移植到 TS**，基于虚拟文件系统 |
| `services/metadata.rs` | `.dey` 读写、图片外置 | IndexedDB；Web 版无卡图元数据，图片外置逻辑不需要 |
| `services/settings.rs`、`app_config.rs` | 设置、默认值、规范化 | 规范化逻辑移植到 TS，存储用 localStorage |
| `services/media.rs` | 读写任意路径、`media://` 协议、strings.conf | 虚拟文件系统 + Blob URL；内置 strings 走静态资源 |
| `services/crypto.rs` | API Key 加密 | Web 版无 AI，不需要 |
| `services/lua_replace.rs`、`workspace_*`、`scripts.rs` | 脚本相关 | 不做 |

### 2.3 CDB 编码库

- 桌面：`ygopro-cdb-encode-rs`（rusqlite）。
- Web：`ygopro-cdb-encode`（同一作者体系，Rust 版是其移植；基于 `sql.js`，已在 `node_modules`）。API：`new YGOProCdb(SQL).from(bytes)`、`find(stmt, params)`、`step`、`addCard`、`findById`、`export()`。
- `sql.js` 已是依赖（AI 脚本测试在用），wasm 约 650 KB。

**原则（沿用 AGENTS.md）**：CDB 格式只由编码库处理，Web 端不手写表结构读写；查询拼 WHERE 子句交给库执行。

## 3. 总体架构

```text
┌──────────────────────── UI（Svelte）────────────────────────┐
│ routes / modules / features / components                    │
│   只依赖 native/*Api 与 platform/host（不再 import tauri）   │
└───────────────┬─────────────────────────────┬──────────────┘
                │                             │
        DocumentRuntime                 HostAdapter
        (platform/runtime.ts)           (platform/host/)
                │                             │
     DocumentHostTransport          ┌─────────┴─────────┐
     (platform/transport/)          │                   │
        │              │         TauriHost           WebHost
  TauriTransport   WorkerTransport  (dialog/path/   (File input/FSA/
  (invoke)         (postMessage)     fs/event)       OPFS/IndexedDB)
        │              │
   Rust document   Web Worker: web-host/
   host            ├─ protocol.ts   (与 Rust 同一 JSON 协议)
                   ├─ search.ts     (search.rs 移植)
                   ├─ session.ts    (工作副本、撤销栈)
                   ├─ merge.ts / package.ts / assets.ts
                   └─ sql.js + ygopro-cdb-encode
```

关键点：

1. **协议不变**：Worker 实现与 Rust 完全相同的 `CardCollectionQuery` / `CardCollectionCommand` JSON 协议，`stores/*` 与 `DocumentRuntime` 几乎不用改。
2. **平台能力抽象为 `HostAdapter`**：对话框、文件、路径、事件、媒体 URL、设置存储、错误日志。
3. **工具任务也走 Worker**：合并、打包、资源检查通过 `startTask` 路由到 Worker 的任务处理器，进度用 `postMessage` 回传，复用现有 `BackgroundTaskProgressEvent` 结构。

## 4. 详细设计

### 4.1 HostAdapter 接口

新建 `src/lib/platform/host/types.ts`：

```ts
export type HostKind = 'tauri' | 'web';

export type HostFile = {
  /** 桌面：OS 路径；Web：虚拟路径，如 `vfs://<workspaceId>/cards.cdb` */
  path: string;
  name: string;
};

export type PickFileOptions = {
  multiple?: boolean;
  filters?: Array<{ name: string; extensions: string[] }>;
};

export interface HostAdapter {
  kind: HostKind;
  capabilities: {
    revealInFileManager: boolean;
    openExternalEditor: boolean;
    writeBackToSource: boolean;   // Tauri: true；Web: 取决于 File System Access
    directoryPicker: boolean;
    fileAssociations: boolean;
  };

  dialogs: {
    openFiles(options: PickFileOptions): Promise<HostFile[] | null>;
    openDirectory(): Promise<HostFile | null>;
    /** Tauri 返回路径；Web 返回一个下载目标（文件名 + 可选句柄） */
    saveFile(options: { defaultName: string; filters?: PickFileOptions['filters'] }): Promise<HostFile | null>;
    confirm(message: string, options?: { title?: string; kind?: 'info' | 'warning' | 'error' }): Promise<boolean>;
    message(message: string, options?: { title?: string; kind?: 'info' | 'warning' | 'error' }): Promise<void>;
  };

  fs: {
    readBinary(path: string): Promise<Uint8Array>;
    readText(path: string): Promise<string>;
    writeBinary(path: string, data: Uint8Array): Promise<void>;
    writeText(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    listDirectory(path: string): Promise<string[]>;
  };

  paths: {
    join(...parts: string[]): string;     // 同步纯函数，兼容 `\` 与 `/`
    dirname(path: string): string;
    basename(path: string): string;
    identity(path: string): string;       // 替代 getCdbPathIdentity
  };

  events: {
    onOpenRequest(listener: (paths: string[]) => void): () => void;   // Web：无
    onFileDrop(listener: (files: HostFile[]) => void): () => void;     // Web：HTML5 drop
    onCloseRequested(listener: () => Promise<boolean>): () => void;    // Web：beforeunload
  };

  media: {
    /** Tauri: convertFileSrc；Web: Blob URL（带 LRU 回收） */
    toDisplayUrl(path: string, cacheBust?: number): Promise<string>;
    release(url: string): void;
  };

  settings: {
    load(): Promise<unknown>;
    save(values: unknown): Promise<unknown>;
  };

  errorLog: {
    append(entry: unknown): Promise<string | null>;
  };
}
```

约束：

- 只有 `platform/host/tauri.ts` 与 `infrastructure/tauri/*` 可以 import `@tauri-apps/*`。用 ESLint `no-restricted-imports` 或一条测试来强制。
- `paths.*` 必须是同步纯函数，替换现在所有异步 `tauriBridge.join/dirname`，这也顺带去掉了展示图、卡图解析中的大量 IPC。

### 4.2 DocumentHostTransport

新建 `src/lib/platform/transport/`：

```ts
export interface DocumentHostTransport {
  open(request: ProviderOpenWireRequest): Promise<ProviderOpenResponse>;
  query<T>(request: ProviderQueryWireRequest): Promise<T>;
  execute<T>(request: ProviderExecuteWireRequest): Promise<CommandResult<T>>;
  save(request: ProviderSaveWireRequest): Promise<{ sourceUri: string; bytes?: Uint8Array }>;
  undo(request: ProviderDocumentWireRequest): Promise<CommandResult>;
  close(request: ProviderDocumentWireRequest): Promise<void>;
  runTask<T>(request: StartTaskRequest, onProgress?: (event: BackgroundTaskProgressEvent) => void): Promise<T>;
}
```

- `TauriTransport`：现有 `documentHost.ts` 的 `invokeCommand` 调用；`runTask` 映射到现有 Tauri 命令。
- `WorkerTransport`：`postMessage({ id, method, params })`，响应 `{ id, ok, result | error }`，进度 `{ id, progress }`。二进制用 `Transferable` 传输，不走 JSON 数组。

`modules/cdb/index.ts` 改为工厂：

```ts
export const createCdbModule = (transport: DocumentHostTransport): ExtensionModule => ({ ... });
```

`DataProvider` 增加可选 `save(documentId, destination)`，CDB 的保存从 codec 移回 provider（当前 `cdbCodec.encode` 调 `saveProviderDocument` 是绕路实现）。

### 4.3 Web Worker：`src/lib/web-host/`

```text
src/lib/web-host/
  worker.ts            入口：消息分发、错误包装
  protocol.ts          与 document_host/models.rs 对应的 TS 类型（可从现有 modules/card/types.ts 复用）
  search.ts            search.rs 的逐行移植
  session.ts           CdbSession：Database、路径、撤销栈、待提交资源变更
  cdb.ts               query / execute / undo / save（document_host/cdb.rs 移植）
  vfs.ts               虚拟文件系统（见 4.5）
  assets.ts            资源路径规则、扫描（services/assets.rs 移植）
  assetsCheck.ts
  merge.ts
  package.ts
  persist.ts           OPFS 快照与恢复
  *.test.ts            对应 Rust 测试的 TS 版本
```

#### 4.3.1 会话

```ts
class CdbSession {
  db: YGOProCdb;              // ygopro-cdb-encode 实例
  path: string;               // vfs 路径
  undo: UndoEntry[];          // 上限 100，FIFO
  pendingAssets: Array<{ change: CardAssetIdChange; applied: boolean }>;
  revision: number;
}
```

- `open`：从 VFS 读字节 → `new YGOProCdb(SQL).from(bytes)`，返回 `{ title, metadata: { total, initialCards } }`，与 Rust 一致（前 50 张卡）。
- `create`：空库 + 可选初始卡片。
- `save`：`db.export()`；Tauri 路径不变，Web 下写入 VFS 并返回字节给主线程触发下载 / 写回句柄。
- 同一文档内的 execute/undo 天然串行（Worker 单线程），保持与 Rust 新的每文档操作锁语义一致。

#### 4.3.2 查询与命令

逐项对应 `CardCollectionQuery` / `CardCollectionCommand`：

| 协议项 | 实现要点 |
|---|---|
| `search {expression, page, pageSize}` | `compileSearch` → `count` + `LIMIT/OFFSET`；`pageSize` 夹在 1..200 |
| `searchAll {expression}` | `ORDER BY datas.id` |
| `getById` / `getByIds` | `getByIds` 400 一组分块 |
| `findByNames` | `texts.name IN (...)` |
| `all` | 全量（仅展示图使用，后续可改分页） |
| `upsert {cards, expectedCards}` | 读取旧卡 → 校验 `expectedCards`（按字段值相等）→ `addCard` → 压撤销栈 |
| `delete {cardIds}` | 先取快照再删 |
| `replaceCardId` | 校验 `expectedTarget`；有资源时做资源迁移（见 4.5.3） |
| `workspaceSearch` / `workspaceReplacePreview` | Web 版不注册，返回 `Unsupported query` |

**行为一致性要求**（`search.rs` 当前语义，移植时必须保持）：

- `TextContains`：`LIKE '%v%'`，按 `name` 或 `desc`；
- `IdPrefix`：
  - `"0"`、空串、超长、非数字、前导 0 → `1=0`；
  - 否则按位数展开为若干 `BETWEEN` 区间，同时匹配 `datas.id` 与 `datas.alias`；
- `MaskContains`：`(col & v) = v`；`MaskExcludes`：`(col & v) = 0`；
- `SetcodeContains`：`v & 0xffff`，为 0 时返回 `1=0`；匹配 4 个 16 位槽；
- `InIds`：过滤非正数、去重、400 一组 `IN`，组间 `OR`；空集 → `1=0`；
- `Compare` / `RuleCompare` / `RuleMaskContains`：字段映射与 Rust `numeric_column` / `mask_column` 一致，link marker 使用库提供的 CASE 表达式；
- `And` 空集 → `1=1`，`Or` 空集 → `1=0`。

验证方式：把 `search.rs` 现有 4 个测试和 `document_host/cdb.rs` 的 12 个测试改写为 TS 测试；另做一组**跨实现对拍**测试：同一个 fixture CDB、同一组表达式，比较 Rust 与 TS 返回的卡片 ID 列表（在 CI 中用 `cargo test` 生成期望文件，TS 测试读取比较）。

#### 4.3.3 字段映射

前端 `CardDataEntry`（Rust `CardDto` 的 JSON 形态）字段：`code, alias, setcode[], type, attack, defense, level, race, attribute, category, ot, name, desc, strings[], lscale, rscale, linkMarker, ruleCode`。

`ygopro-cdb-encode` 的 `CardDataEntry` 继承自 `ygopro-msg-encode` 的 `CardData`。实现 `toWire(card)` / `fromWire(dto)` 两个函数，并对以下差异做测试：

- `setcode` 的 bigint ↔ number 数组；
- `level` 中打包的 lscale/rscale；
- `ruleCode` 的解析规则（Rust 侧 `resolve_rule_codes`）；
- `strings` 固定 16 项。

### 4.4 构建变体

在 `scripts/build-variant-config.mjs` 增加：

```js
web: {
  key: 'web',
  productName: 'DataEditorY Web',
  features: { cardImage: false, lua: false, ai: false, tauri: false },
}
```

并：

- `normalizeBuildVariant` 识别 `web`；
- 新增 `src/lib/modules/web.ts`，只组合 `settings`、`card`（无 Script/Image/AI/Search surface）、`cdb`（使用 `WorkerTransport`）、`context-menu`（Web 版菜单项）、`merge`、`package`；
- `vite.config.js` 增加 `define: { __DEY_HOST__: JSON.stringify(variant.features.tauri ? 'tauri' : 'web') }`，host 选择、Monaco、TextEditorWorkbench 等通过 `if (__DEY_HOST__ === 'tauri')` 静态分支，使 web 产物 tree-shake 掉；
- `package.json` 增加 `dev:web`、`build:web`、`check:web`；
- `prepare-build-assets.mjs` 按变体决定拷贝哪些资源（web 只需 `strings/`、`cover.jpg`）；
- CI 增加一步：`build:web` 后 grep 产物，禁止出现 `@tauri-apps`、`yugioh-card-ts`、`monaco-editor`。

### 4.5 虚拟文件系统（VFS）

#### 4.5.1 工作区结构

每个打开的 CDB 是一个工作区：

```text
vfs://<workspaceId>/
  <name>.cdb                 工作副本（真实字节保存在 OPFS）
  pics/<id>.<ext>            导入的卡图（可选）
  pics/field/<id>.<ext>
  script/c<id>.lua           导入的脚本（只用于打包、资源检查、合并、改卡号迁移）
  strings.conf               导入的 strings（可选）
```

- 路径规则与桌面版一致，这样 `assets.ts`、`package.ts`、`merge.ts` 可以直接沿用“相对 CDB 目录”的逻辑。
- 存储后端：
  - OPFS（`navigator.storage.getDirectory()`）：主存储，所有现代浏览器（含 iOS Safari 15.2+）可用；
  - 无 OPFS 时退化为 IndexedDB；
  - Worker 内优先使用 `createSyncAccessHandle` 提升大文件写入性能。
- 同时维护一份内存索引（路径 → 大小、类型），资源检查和扫描只查索引，不逐个打开文件。
- 首次写入前调用 `navigator.storage.persist()` 申请持久化，并在设置页显示已用空间与“清理工作区”入口。

#### 4.5.2 导入方式

| 入口 | 实现 | 兼容性 |
|---|---|---|
| 打开 CDB | `<input type="file" accept=".cdb">`；支持时用 `showOpenFilePicker` 以获得可写回的句柄 | 全平台 |
| 导入资源文件夹 | `showDirectoryPicker`；退化为 `<input webkitdirectory>` | 桌面浏览器；移动端多数不支持 |
| 导入资源 zip | `<input type="file" accept=".zip">` + `fflate` 解压到 VFS | 全平台（移动端主路径） |
| 拖拽 | HTML5 `drop`，支持文件与文件夹（`webkitGetAsEntry`） | 桌面浏览器 |
| 单文件补充 | 卡图导入、strings.conf 导入 | 全平台 |

导入 zip 时识别两种结构：`pics/`、`script/` 位于根目录，或位于唯一一级子目录下。

#### 4.5.3 改卡号的资源迁移

沿用 Rust 新语义（`services/assets.rs`）：

- 迁移卡图（6 种扩展名、主图与场地图）和脚本；
- 目标已存在则拒绝；
- 移动模式下迁移时直接重命名 VFS 条目；
- 回滚前比较内容指纹（Web 端用 `size + SHA-256`，`crypto.subtle.digest`），用户改过的文件不删除；
- 保存后清除撤销项中的资源引用；关闭不保存时只回滚仍处于 applied 的变更。

#### 4.5.4 导出

| 输出 | 方式 |
|---|---|
| 保存 CDB | 有可写句柄：`createWritable()` 写回（浏览器内部即临时文件 + 替换，具备原子性）；否则下载 `<name>.cdb` |
| 另存为 | `showSaveFilePicker` 或下载 |
| 筛选导出 / 合并结果 | 下载 `.cdb`；可选“在新标签中打开” |
| 打包 | 下载 `.zip` / `.ypk` |
| 展示图 | 单页直接下载 PNG；多页打包为 zip 下载 |
| 工作区元数据 | 下载 `<stem>.workspace.json`，可再导入 |

下载统一走 `host.dialogs.saveFile` + `host.fs.writeBinary`，Web 实现内部用 `URL.createObjectURL` + `<a download>`，下载后释放 URL。

### 4.6 工作区元数据（`.dey` 替代）

- `native/metadataApi.ts` 改为调用 `host`：Tauri 端不变，Web 端存 IndexedDB `workspaces` 表，键为工作区 ID，值结构与 `.dey/{stem}.workspace.json` 相同（`version, cdbPath, ui, cardGroups, tasks` 等）。
- Web 版不写 `image`、`ai`、`scripts` 字段，但读取时保留未知字段，避免以后接回模块时丢数据。
- 同一 CDB 再次导入时，按“文件名 + 大小 + 前 64 KB 的哈希”匹配已有工作区，提示“恢复上次的工作区”还是“新建”。
- `features/workspace-metadata/state.svelte.ts` 中已有的防抖、顺序写入、失败重试逻辑保留，只替换底层 load/save。

### 4.7 设置

- `stores/appSettings.svelte.ts` 中直接的 `invokeCommand('load_app_settings' | 'save_app_settings' | 'set_cover_image' | 'clear_cover_image')` 全部移到 `native/settingsApi.ts`，后者再调用 `host.settings`。
- 默认值与规范化（`normalize_*`、`DEFAULT_PACKAGE_INCLUDE_PATTERNS`、快捷键规范化）在 TS 侧已有部分实现，补齐后作为两端共享规则，Tauri 端继续以 Rust 为准，TS 只用于 Web。
- 自定义封面：存 IndexedDB Blob，显示用 Blob URL。
- Web 版设置页只保留：语言、主题、UI 缩放、快捷键、打包包含规则、卡图最大体积、封面。设置分节改为模块 contribution（见 5.1 P1），AI、脚本相关分节由各自模块提供，Web 版自然不出现。

### 4.8 strings / 系列名

- 内置 `static/resources/strings/` 已通过 `fetch('/resources/strings/...')` 加载（`services/setcodeCatalog.ts`），Web 版直接可用。
- 用户导入的 `strings.conf` 存入工作区 VFS；`load_strings_conf` 在 Web 下改为：工作区 strings 优先，再合并内置。

### 4.9 合并

- 输入：多个已导入的 CDB（可以是当前打开的工作区，也可以是临时导入的文件），每个来源可附带资源。
- “从文件夹收集”：
  - 桌面浏览器用 `showDirectoryPicker` 递归查找 `.cdb`；
  - 其他环境改为“导入 zip / 多选文件”。
- 计划与执行逻辑移植 `merge.rs`（摘要阶段只读 id/type；执行阶段按来源顺序逐个加载、只保留胜出卡）。
- 已打开且有未保存修改的来源：直接使用 Worker 中的工作副本（Web 版无需先保存，这比桌面更简单）。
- 输出：新 CDB + 合并后的 `pics/`、`script/`，打包为 zip 下载，或直接作为新工作区打开。

### 4.10 打包

- 移植 `package.rs`：
  - 包含规则渲染（`{code}`、`{name}`、`{cdb_name}`、通配符 `*`，只遍历字面前缀目录）；
  - `Duel.LoadScript("...")` 依赖递归收集；
  - 路径安全检查（拒绝绝对路径、`..`）。
- 数据源：工作区 VFS + 当前工作副本（Web 版直接用未保存的工作副本，不需要“先保存再打包”）。
- zip：`fflate` 的 `zip`（store 模式，与桌面一致），在 Worker 中生成，产物以 `Transferable` 返回主线程下载。
- 未导入资源时提示：“当前工作区没有资源文件，仅打包 CDB”，并提供“导入资源”入口。

### 4.11 资源检查

- 基于 VFS 索引：主图检查 6 种扩展名，脚本检查 `script/c<id>.lua`。
- 未导入资源时，对话框提示先导入，不执行检查。

### 4.12 展示图

- `features/shell/cardShowcaseRenderer.ts` 是纯 canvas 实现，可直接复用。
- 卡图来源：工作区 VFS 的 `pics/`，通过 `host.media.toDisplayUrl` 获取 Blob URL，渲染完成后释放。
- 解析卡图改为分页、限制并发（例如每次 8 张），避免整库同时创建上万个 Blob URL。
- 复制到剪贴板改为用户勾选项（`navigator.clipboard.write` 需要用户手势，且 iOS 支持有限）。

### 4.13 文件拖拽、多标签、关闭保护

- 拖拽：`layoutController` 中 Tauri `DRAG_DROP` 事件替换为 `host.events.onFileDrop`。
- 关闭保护：有未保存工作区时注册 `beforeunload`。Web 端工作副本已持久化到 OPFS，即使关闭页面也能恢复；提示文案改为“有修改尚未下载/写回”。
- 多个浏览器标签同时打开同一站点：用 `BroadcastChannel` + Web Locks（`navigator.locks`）保证同一工作区同时只有一个标签可写，其余标签只读并提示。

### 4.14 PWA 与离线

- 使用 SvelteKit 的 `src/service-worker.ts`：预缓存应用壳、`sql-wasm.wasm`、`strings`、`cover.jpg`。
- `manifest.webmanifest`：名称、图标、`display: standalone`、`file_handlers`（Chromium 安装版可直接用应用打开 `.cdb`）。
- `adapter-static` 已在用；`paths.base` 按部署环境配置（GitHub Pages 子路径）。
- 所有资源引用改为相对 `base` 的路径，排查 `fetch('/resources/...')` 这类绝对路径。

### 4.14.1 关于直接双击 `file:///.../index.html`

`build:web`（SvelteKit 产物）**不能**用 `file://` 打开：它由多个 ES module chunk 组成，浏览器在 `file://` 下按 CORS 规则拒绝加载 `/_app/...` 模块（Chrome 报 `已拦截跨源请求`），Worker、wasm 和 `fetch()` 同样受限。

为此提供独立的单文件构建：

```bash
bun run build:standalone   # 输出 build-standalone/index.html（约 2.2 MB）
```

`build-standalone/index.html` 可直接双击运行，也可拷到手机用浏览器打开。实现要点（`vite.standalone.config.js`）：

- 不经过 SvelteKit 路由，`src/standalone/main.ts` 直接挂载 `routes/+layout.svelte` + `+page.svelte`；`$app/env` 用 shim 替换。
- 关闭代码分割，JS/CSS 内联进 HTML，图片、字体、`sql-wasm.wasm` 全部转为 data URL；`sql.ts` 检测到 data URL 时直接以 `wasmBinary` 初始化。
- CDB 宿主改用主线程 `platform/transport/inline.ts`（协议与 Worker 版一致），因为 `file://` 无法加载 module worker。
- `static/resources` 访问统一经 `core/bundledResources.ts`；单文件构建换成 `bundledResources.standalone.ts`，strings 与封面在构建时内联。
- 文本工作台（Monaco）在单文件构建中替换为空组件。

代价：首屏需解析整个包；CDB 操作在主线程执行，超大 CDB 时界面可能短暂卡顿。托管部署仍推荐 `build:web` + `preview:web`/静态托管。

### 4.15 安全与隐私

- 所有数据只存在用户本机浏览器存储中，不上传。
- CSP：`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:`。
- 导入 zip 时防御 zip slip（拒绝 `..`、绝对路径）与 zip 炸弹（限制解压总大小，可配置，默认 2 GB，并显示进度）。

## 5. 实施计划

### 5.1 阶段划分

| 阶段 | 内容 | 产出 | 预估 |
|---|---|---|---|
| **P0 前置重构** | 见 5.2，全部在桌面版上完成并保持行为不变 | 桌面版 PR，测试全绿 | 1～1.5 周 |
| **P1 Web 骨架** | `web` 变体、`WebHost`、`WorkerTransport`、Worker 中的 open/search/get/upsert/delete/undo/save | 能导入 CDB、浏览、编辑、撤销、下载 | 1～1.5 周 |
| **P2 编辑完整性** | 改卡号、复制粘贴、新建异画、分组、批量编辑、筛选导出、元数据持久化、OPFS 恢复、多标签锁 | 与桌面版单卡/批量编辑功能对齐 | 1 周 |
| **P3 工具** | VFS 资源导入（文件夹/zip/拖拽）、资源检查、打包、合并、展示图 | 全部保留工具可用 | 1～1.5 周 |
| **P4 发布** | PWA、离线、部署流水线、兼容性测试、文档 | 可公开访问的站点 | 0.5 周 |
| **P5 移动端 UI** | 独立移动外壳（见第 6 节） | 移动端可用 | 1～2 周 |

### 5.2 P0 前置重构清单

按依赖顺序：

1. **路径工具**：新增同步 `src/lib/core/path.ts`（`join/dirname/basename/extname/identity`），替换所有 `tauriBridge.join/dirname` 与手写正则（`stores/tabs.ts`、`textEditor.svelte.ts`、`recentHistory.ts`、`mergeController.ts`、`cardImageService.ts`、`ai/context.ts` 等）。
2. **HostAdapter 抽象**：建 `platform/host/{types,tauri}.ts`，把 `tauriBridge` 的对话框、事件、媒体、窗口能力迁入；三处直接 import `@tauri-apps/*` 的文件改为走 host；`stores/appSettings`、`utils/errorLog` 的 `invokeCommand` 移到 `native/`。
3. **Transport 抽象**：`documentHost.ts` → `TauriTransport`；`modules/cdb` 改为工厂；`DataProvider.save`；`appRuntime.ts` 成为唯一注入点。
4. **二进制传输**：`readCdbFile/readImageFile/writeBinaryFile` 统一 `Uint8Array`，Tauri 命令改用 `ipc::Response` / raw body。
5. **模块边界（关键）**：
   - Script/Image/AI/Search surface 全部改为各自模块的 `workbenchContributions`；`CardCollectionWorkbench` 不再硬编码 `'script'`；只有一个 surface 时不渲染 rail；
   - 顶栏工具全部改为 `globalTools`（LuaReplace 归 lua 模块，AssetCheck/BatchCdb/Merge/FilteredCdb/Showcase 归各自模块）；
   - 右键菜单改为 `cardMenuContributions`（打开脚本、定位脚本、打开制卡器由对应模块提供）；
   - 设置页分节改为 `settingsSections`（snippets、AI、脚本模板由对应模块提供）；
   - `packageController` 不再直接读取 `activeScriptTab` / `appShellState.mainView`，改为由 workbench 注入“当前上下文 CDB”；
   - `aiProposalExecution.ts` → `card-image/layout.ts` 的静态依赖拆开（纯数据部分移到独立文件），否则 base 和 web 都会被带进 `yugioh-card-ts`；
   - `core/workspace/*`、`commandBus.ts`、`WorkbenchHost.svelte` 中对 `CARD_IMAGE_CONFIG_TYPE` 的引用移到共享常量。
6. **搜索与选择状态**：
   - 每个 tab 一个 `ExplorerState`（`draftFilters`、`appliedFilters`、`page`、`results`、`selection`）作为唯一来源，合并 `editorState` 与 `stores/search.ts` 的两套请求序号；
   - 选择保存全集，渲染时再求可见子集，修复跨页选择被裁剪的问题；
   - `cachedFilters` 由 JSON 字符串改为对象。
7. **草稿会话**：`CardEditor.svelte` 的草稿状态抽成每工作区一个 `DraftSession`（`$state` class），切 tab 只换实例；提交入口按 tabId 调用，不依赖组件挂载（修复后台 tab 保存时草稿未提交的问题）。
8. **工具公共件**：`resolveCardTargets(tabId, target)`、`CardTargetPicker.svelte`、`ToolDialog.svelte`，替换 5 处目标解析和 7 份对话框外壳。
9. **协议补充**（Rust 与 Worker 同步实现）：
   - `searchIds {expression}`：只返回 ID，给资源检查、批量编辑、展示图用；
   - `exportBytes`：返回工作副本字节，替代读取磁盘原文件（AI 脚本测试也受益）；
   - `undoInfo`：返回撤销标签栈，前端不再单独维护 `stores/undo.ts`。

P0 每一项单独提交，保持 `bun test`、`cargo test`、`check:*`、`build:*` 全绿。

### 5.3 P1～P4 任务清单

**P1**
- [ ] `build-variant-config.mjs` 加 `web`；`modules/web.ts`；`dev:web` / `build:web` / `check:web`
- [ ] `platform/host/web.ts`：文件选择、下载、`confirm`（应用内对话框组件）、`paths`、`media`
- [ ] `platform/transport/worker.ts` + `web-host/worker.ts` 消息框架、错误序列化、取消
- [ ] `web-host/search.ts` + 测试（移植 `search.rs` 测试）
- [ ] `web-host/cdb.ts`：open/create/search/searchAll/getById/getByIds/findByNames/all/upsert/delete/undo/save + 测试（移植 `cdb.rs` 测试）
- [ ] 字段映射 `toWire/fromWire` + 测试
- [ ] 跨实现对拍测试（Rust 生成期望 → TS 比较）
- [ ] Web 版顶栏：导入 CDB、新建、保存/下载、另存为
- [ ] 产物检查：不含 `@tauri-apps`、`yugioh-card-ts`、`monaco-editor`

**P2**
- [ ] `replaceCardId`（无资源时）
- [ ] 复制/粘贴/删除选择、新建异画
- [ ] IndexedDB 元数据：分组、Explorer 状态、任务历史；导入/导出 JSON
- [ ] OPFS 工作副本持久化与启动恢复
- [ ] 多标签锁（Web Locks + BroadcastChannel）
- [ ] 批量编辑、筛选导出
- [ ] `beforeunload` 保护

**P3**
- [ ] VFS：OPFS 后端、IndexedDB 退化、内存索引、配额显示与清理
- [ ] 资源导入：目录、zip（fflate，防 zip slip / 炸弹）、拖拽、单文件
- [ ] `replaceCardId` 资源迁移（指纹校验）
- [ ] 资源检查
- [ ] 打包（规则渲染、依赖解析、zip/ypk）
- [ ] 合并（文件/文件夹/zip 来源、计划、执行、输出）
- [ ] 展示图（分页加载卡图、PNG/zip 下载）
- [ ] 工作区 strings.conf

**P4**
- [ ] service worker 预缓存、离线、更新提示
- [ ] manifest、图标、`file_handlers`
- [ ] `paths.base` 与部署流水线（GitHub Actions → Pages）
- [ ] CSP
- [ ] 兼容性测试矩阵（见 7.3）
- [ ] 用户文档：导入资源、保存方式、数据存储位置、清理方法

## 6. 移动端 UI（P5）

> 详细设计已移至 [mobile-ui.md](./mobile-ui.md)，以下为最初的概要。

### 6.1 布局

按视口宽度切换外壳（`< 768px` 为移动端）：

```text
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ CDB ▾  ⋯      │   │ ← 卡名    保存 │   │ 工具          │
│ [搜索……] 筛选 │   │ 卡图 / 基本   │   │ · 批量编辑    │
│ ───────────── │   │ 类型 / 属性   │   │ · 导出筛选    │
│ 卡片列表      │ → │ 数值 / 系列   │   │ · 合并        │
│ (无限滚动)    │   │ 效果文本      │   │ · 打包        │
│               │   │ 提示文本      │   │ · 资源检查    │
│        ＋     │   │ 撤销 删除 ⋯   │   │ · 展示图      │
└───────────────┘   └───────────────┘   └───────────────┘
   列表页              详情页（编辑）       工具抽屉
```

- 列表页：顶部 CDB 切换（替代桌面标签栏）、搜索框、筛选按钮（全屏筛选面板）、浮动“新建卡”按钮；列表用无限滚动替代分页。
- 详情页：复用 `CardEditorForm` 的字段组件，按分组折叠；底部固定操作栏（保存、撤销、删除、更多）。
- 多选：长按进入多选模式，底部出现批量操作栏。
- 工具：从“更多”菜单打开，各工具对话框全屏显示。

### 6.2 复用原则

- 所有 store、domain、use case 原样复用，只新增移动端外壳与少量布局组件；
- 表单字段组件需要先完成 runes 化与显式回调改造（`CardEditorForm.svelte` 目前直接修改父组件 prop），桌面与移动共用；
- 触控优化：最小点击区域 44px、输入框 `inputmode="numeric"`、避免 hover 依赖；
- 快捷键在移动端不注册。

## 7. 测试策略

### 7.1 单元测试

- `web-host/*`：Bun 测试，直接加载 `sql.js`（Node 环境可用）。
- 移植 Rust 测试：`search.rs`（4 个）、`document_host/cdb.rs`（12 个）、`cdb_session.rs` 中与行为相关的用例、`merge.rs`、`package.rs`、`assets.rs`。

### 7.2 一致性测试

- 固定 fixture：一个包含各类卡（怪兽、魔陷、灵摆、连接、同名卡、多系列、16 条提示文本）的 CDB，放在 `tests/fixtures/`。
- Rust 侧新增测试：对一组表达式与命令序列输出 JSON 期望文件。
- TS 侧读取期望并比较。CI 中两者都跑，任何一侧行为变化都会被发现。

### 7.3 浏览器兼容矩阵

| 浏览器 | 必测项 |
|---|---|
| Chrome / Edge 最新 | 全部，含 File System Access 写回、目录导入 |
| Firefox 最新 | 无 FSA：下载保存、`webkitdirectory`、OPFS |
| Safari 最新（macOS） | OPFS、下载、wasm |
| iOS Safari 17+ | zip 导入、OPFS 恢复、下载、PWA 安装 |
| Android Chrome | zip 导入、下载、PWA 安装 |

### 7.4 端到端

- 使用 Playwright（或项目已有的 agent-browser 工作流）：导入 fixture → 搜索 → 编辑 → 撤销 → 下载 → 重新导入比较字节内容中的卡片数据。

## 8. 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| TS 移植与 Rust 行为不一致 | 搜索结果、撤销结果不同 | 跨实现对拍测试；先移植测试再移植实现 |
| `ygopro-cdb-encode` 与 Rust 版字段/规则细节差异 | 卡片数据错位 | 字段映射测试；必要时向上游提 issue 或在映射层修正 |
| 大 CDB（数万张）在主线程卡顿 | 体验差 | 全部 SQL 在 Worker；结果分页；只传当前页 |
| OPFS 配额或被浏览器清理 | 工作区丢失 | `storage.persist()`；明确提示“下载才是保存”；启动时检测恢复 |
| iOS 对 OPFS/下载/剪贴板支持差异 | 部分功能不可用 | 能力检测 + 降级路径；兼容矩阵覆盖 |
| 资源导入体积大（完整 ygopro 目录） | 导入慢、占空间 | 导入时只收集 `pics/`、`script/`、`strings.conf`；显示进度；支持只导入当前 CDB 相关的 ID |
| 模块边界改造牵动面大 | 桌面版回归 | P0 每项单独提交并保持测试全绿；先补测试再改结构 |
| 多标签并发写同一工作区 | 数据覆盖 | Web Locks 独占写；其余标签只读 |

## 9. 目录与文件变更预览

```text
docs/web-port.md                         本文档
scripts/build-variant-config.mjs         + web 变体
vite.config.js                           + __DEY_HOST__ define
src/service-worker.ts                    新增（P4）
static-web/manifest.webmanifest          新增（P4）
src/lib/core/path.ts                     新增（P0）
src/lib/platform/host/{types,tauri,web}.ts        新增
src/lib/platform/transport/{types,tauri,worker}.ts 新增
src/lib/platform/appRuntime.ts           改为注入 host + transport
src/lib/modules/web.ts                   新增
src/lib/modules/cdb/index.ts             改为工厂
src/lib/web-host/**                      新增（Worker 端实现）
src/lib/features/mobile-shell/**         新增（P5）
tests/fixtures/*.cdb                     新增
```

## 10. 待确认事项

1. 部署位置：GitHub Pages（子路径）还是独立域名？影响 `paths.base` 与 `file_handlers` 配置。
2. Web 版是否需要“最近打开”列表（基于 IndexedDB 中的工作区）？建议需要。
3. 导入资源的大小上限默认值（建议 2 GB，可在设置中调整）。
4. 展示图多页导出：zip 还是逐张下载？建议 zip。
5. 后续若要接回 Lua 编辑器：Monaco 在移动端体验差，届时是否换 CodeMirror 6。
