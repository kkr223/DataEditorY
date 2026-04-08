# DataEditorY 代码审查报告

> 全面审查了前端 (Svelte/TS) 和后端 (Rust/Tauri) 的核心代码，涵盖 Bug、交互问题和性能问题三大类。

---

## 🔴 Bug 类问题

### 1. SQL 注入风险 — `query.ts` 中 setcode 过滤器直接拼接 SQL

**文件**: [query.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/domain/search/query.ts#L164-L176)

`parseSetcodeFilter` 返回的整数值直接拼入 SQL `WHERE` 子句，虽然经过了 `parseInt` 处理看起来安全，但更关键的是 `atkMin`/`atkMax`/`defMin`/`defMax` 等过滤器也通过 `parseInt` → 直接拼接的方式构建 SQL（L108-L123），这虽然在当前场景下安全（因为 `parseInt` 返回的是数字），但一旦有人修改了 `filters.atkMin` 为非预期类型，可能引入问题。

```typescript
// L108-L110 — parseInt 结果直接拼 SQL
if (filters.atkMin !== '' && filters.atkMin !== undefined) {
    const value = parseInt(filters.atkMin.toString(), 10);
    if (!isNaN(value)) conditions.push(`datas.atk >= ${value}`);
}
```

**建议**: 统一使用参数化查询 (`:paramName`) 而非字面值拼接，与 `name`/`desc` 的安全方式保持一致。

---

### 2. `ruleExpression.ts` — 解析器输出直接拼入 SQL，存在恶意构造风险

**文件**: [ruleExpression.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/domain/search/ruleExpression.ts#L337-L388)

`resolveSqlValue` 将 `value.value`（一个数字）直接 `String()` 转换后拼入 SQL。虽然 tokenizer 做了类型限制，但 `parseLeftValue()` 返回的 number token 直接拼为 SQL 字面值 —— 如果 tokenizer 有漏洞（如接受了 `NaN`、`Infinity` 等），可能导致无效 SQL。

```typescript
// L338-L339
if (value.kind === 'number') {
    return String(value.value);  // 直接拼入 SQL
}
```

**风险等级**: 低（因为本地应用，非 Web 服务器），但值得加固。

---

### 3. Undo 操作中的竞态：删除后的 undo 可能丢失变更

**文件**: [db.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/stores/db.ts#L412-L458)

`undoLastOperation` 中，如果 undo 一个 `modify` 操作，其中部分卡片的 `previousCards` 为 `null`（即是新建卡片），undo 时会尝试**删除**这些新建的卡片。但在 `modify_cards` 和 `delete_cards` 之间没有事务保护 —— 如果 `modify_cards` 成功但 `delete_cards` 失败，数据状态将不一致，且操作已从 undo 栈中弹出，无法重试。

```typescript
// L425-L441 — 两个独立的 IPC 调用，无事务保证
if (cardsToRestore.length > 0) {
    await invokeCommand('modify_cards', { ... }); // 步骤 1
}
if (deletedIds.length > 0) {
    await invokeCommand('delete_cards', { ... }); // 步骤 2 — 若失败则部分 undo
}
```

**建议**: 在 Rust 后端添加一个原子的 `undo_operation` 命令，在同一事务中完成 modify + delete。

---

### 4. `openCdbAtPath` — 空 CDB 文件的 `cachedSelectedId` 可能为 `undefined`

**文件**: [db.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/stores/db.ts#L176)

```typescript
cachedSelectedId: response.cachedCards[0]?.code ?? null,
```

如果 `cachedCards` 为空数组，`response.cachedCards[0]` 是 `undefined`，`.code` 也是 `undefined`，`?? null` 正确处理了这个情况。但 `cachedSelectedIds` (L175) 在空数组时会产生 `[undefined]` 的可能性吗？

检查后发现 L175 用了 `.length > 0` 守卫，所以当 `cachedCards` 非空时 `cachedCards[0].code` 一定存在。**这里其实没有 bug**，但建议增加注释说明安全性。

---

### 5. Regex 编译没有缓存 — `cdb.rs` 中的 `regexp` 函数

**文件**: [cdb.rs (repository)](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src-tauri/src/repository/cdb.rs#L92-L96)

每次调用 `regexp` 标量函数都会重新编译正则表达式：

```rust
let regex = Regex::new(&pattern)
    .map_err(|err| rusqlite::Error::UserFunctionError(Box::new(err)))?;
Ok(regex.is_match(&input))
```

SQLite 可能对同一查询中的每一行都调用此函数。对于大表（10k+ 行），这意味着可能编译 10k+ 次同一个正则。

**建议**: 使用 `thread_local!` 或 `RefCell<HashMap<String, Regex>>` 缓存已编译的正则。

---

### 6. `CDB session` 连接频繁开闭

**文件**: [cdb_cards.rs](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src-tauri/src/services/cdb_cards.rs#L19-L42)

每次 `search_cards_page` 都会重新 `open_connection`，这意味着：
1. 每次打开连接都执行 `PRAGMA` 设置和 `CREATE TABLE IF NOT EXISTS`
2. 每次查询都需要创建新的 prepared statement

```rust
with_session_meta(sessions, &request.tab_id, |session| {
    let conn = cdb_repository::open_connection(&session.working_path)?;
    // ... 查询 ...
})
```

**建议**: 将 `Connection` 持久化到 session 中，避免反复打开。

---

## 🟡 交互问题

### 7. Merge CDB 拖拽 — 缺少 `pointer capture` 和 `Escape` 键取消

**文件**: [MergeCdbDialog.svelte](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/features/shell/components/dialogs/MergeCdbDialog.svelte#L53-L115)

拖拽排序实现中：
- 没有调用 `setPointerCapture()` —— 如果鼠标快速移出窗口，可能丢失 `pointerup` 事件导致拖拽状态"卡住"
- 虽然有 `onblur` 取消，但缺少 `Escape` 键处理
- 没有在 `pointerup` 中调用 `releasePointerCapture()`

```svelte
<!-- 建议在 handleItemPointerDown 中添加 -->
(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
```

**建议**:  
1. 添加 `setPointerCapture` / `releasePointerCapture`
2. 添加 `keydown` 监听 `Escape` 键取消拖拽
3. 添加 `pointercancel` 事件处理

---

### 8. CardEditorForm — 使用 Svelte 4 `export let` 语法而非 Svelte 5 `$props()`

**文件**: [CardEditorForm.svelte](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/features/card-editor/components/CardEditorForm.svelte#L14-L47)

项目整体使用 Svelte 5（`$state`, `$derived`, `$props()` 等），但 `CardEditorForm` 仍然使用 Svelte 4 的 `export let` 语法。虽然 Svelte 5 向后兼容，但这会：
- 导致代码风格不一致
- `export let` 的 prop 不是响应式 `$state`，可能导致在某些场景下与 Svelte 5 的反应式系统交互出现微妙 bug

**建议**: 迁移到 `$props()` 语法以保持一致性。

---

### 9. 未保存变更的关闭确认缺失

**文件**: [db.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/stores/db.ts#L257-L280)

`closeTab` 函数在关闭标签时不检查 `isDirty` 状态 —— 即便有未保存的更改也会直接关闭。`scriptEditor.svelte.ts` 中的 `closeScriptTab` 也有相同问题。

```typescript
export async function closeTab(tabId: string) {
    // 没有 if (hasUnsavedChanges(tabId)) { ... confirm ... } 逻辑
    const currentTabs = get(tabs);
    ...
}
```

> [!NOTE]
> 确认是否有上层调用者处理了这个确认逻辑。如果 `closeTab` 是底层 API，确认可能在 UI 层实现。但最好在此处也加一道防线。

---

### 10. 搜索错误状态 在切换标签后不清除

当用户在 Tab A 中产生搜索错误（如无效的 Rule 表达式），然后切换到 Tab B 再切回 Tab A 时，`editorState.searchError` 不会被清除（它不随 tab 缓存恢复），可能导致旧的错误提示持续显示。

**文件**: [+page.svelte](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/routes/+page.svelte#L64-L91)

Tab 切换逻辑中没有 `clearSearchError()` 调用。

---

## 🟠 性能问题

### 11. `Regex::new` 每次 SQL 查询都重编译（同 Bug #5）

这是最严重的性能热点。如果用户搜索使用正则表达式，每条匹配的行都会重新编译正则引擎。在 10,000+ 卡片的数据库中，这会显著拖慢搜索。

---

### 12. `createCardSnapshot` 使用 JSON.stringify 做变更检测

**文件**: [draft.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/domain/card/draft.ts#L50-L71)

```typescript
export function createCardSnapshot(card: CardDataEntry) {
    return JSON.stringify({ ... });
}
```

在 `applyBatchCardEdit`（[ai.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/utils/ai.ts#L940-L950)）中，对每张卡片调用两次 `createCardSnapshot` 进行比较（before/after）。如果批量操作涉及几百张卡片，这会序列化几百个完整卡片对象到 JSON 字符串后再做字符串比较。

**建议**: 实现一个轻量的浅比较函数，逐字段比较而非序列化。

---

### 13. `tabs.update(map(...))` 在每次操作时克隆所有 tab

**文件**: [db.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/stores/db.ts#L350-L361)

```typescript
tabs.update((currentTabs) =>
    currentTabs.map((tab) =>
        tab.id === tabId ? { ...tab, ... } : tab
    )
);
```

每次 `cacheActiveTabSelection`、`markTabDirty`、`syncCachedCardsInTab` 都会通过 `.map()` 克隆整个 tabs 数组。由于 `cachedCards` 是大数组（50个卡片对象），频繁的浅拷贝可能产生较多 GC 压力。

在 `modifyCard` → `modifyCardsInTab` 中，一次保存操作可能触发 `syncCachedCardsInTab` + `markTabDirty` = 2 次 `tabs.update(...map(...))`。

**建议**: 考虑将 tab 数组改为使用 Svelte 5 的 `$state` 或使用更细粒度的 store。

---

### 14. AI Agent — 每次 `getCardByIdInTab` 都是独立 IPC roundtrip

**文件**: [ai.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/utils/ai.ts#L643-L668)

`pickCardFromDb` 在找不到卡片时会遍历   **所有**打开的数据库，为每个 tab 发起一次 IPC 调用：

```typescript
for (const tab of context.listOpenDatabases()) {
    const card = await context.getCardByIdInTab(tab.id, code);
    if (card) { ... }
}
```

如果用户打开了 5 个数据库，最坏情况下单次 `get_card_by_id` 工具调用需要 10 次 IPC roundtrip（5 scopedTabs + 5 allTabs fallback）。

**建议**: 提供后端批量查询接口 `find_card_across_tabs`。

---

### 15. `modifyCardsInTab` — 每次修改前获取所有旧卡片数据

**文件**: [db.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/stores/db.ts#L480-L505)

```typescript
const previousCards = await Promise.all(
    cards.map((card) => getCardByIdInTab(tab.id, card.code))
);
```

对于批量修改（如合并时导入 100 张卡），这会发起 100 个**并行** IPC 调用。虽然是并行的，但 Tauri 后端由于 Mutex 锁竞争（每次都要 lock sessions → open connection → query），实际性能可能远不如一次性批量查询。

**建议**: 添加后端 `get_cards_by_ids` 命令支持批量查询。

---

### 16. AI 的 `searchCards` 可能陷入重复冗余搜索

**文件**: [ai.ts](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/utils/ai.ts#L628-L698)

当 `dbScope` 不是 `'current'` 且没有指定 `dbPath` 时，`getScopedTabs` 返回所有打开的 tab，`searchCards` 会对每个 tab 执行同一个查询。如果用户打开了 5 个数千张卡的数据库，每次搜索工具调用会并发执行 5 次 SQL LIKE 查询。

---

## 📋 其他建议

| 类别 | 建议 |
|------|------|
| **一致性** | `CardEditorForm.svelte` 中混用 `export let` (Svelte 4) 与项目其他部分的 `$props()` (Svelte 5) |
| **类型安全** | `query.ts` 中 `buildSearchQuery` 的 `parsedSetcode` 直接拼入 SQL 模板字符串，应改用参数 |
| **内存泄漏** | `undoHistory`（[db.ts:34](file:///d:/workspace/ygo/DataEditorY/DataEditorY/src/lib/stores/db.ts#L34)）是 module-level `Map`，只在 `closeTab` 时清理。如果 tab 从不关闭，undo 栈可能累积大量卡片快照（上限 100 条，但每条可能包含大量 `previousCards`） |
| **错误处理** | `connectAiProvider` 中 `fetch` 失败（网络错误）不输出用户有意义的消息 —— `error.message` 通常是 `"Failed to fetch"` |
| **安全** | `open_in_system_editor`/`open_in_default_app` 接受任意路径并通过 `cmd /C start` 执行 —— 理论上可以打开任意文件。虽然是本地应用，但建议校验文件扩展名 |
| **健壮性** | `normalizeTemperature` 在前后端有独立实现（Rust 和 TS 各一份），建议保持同步或提取为共享常量 |

---

## 总结

| 严重度 | 数量 | 关键项 |
|--------|------|--------|
| 🔴 Bug | 6 | SQL 拼接、Undo 竞态、Regex 未缓存 |
| 🟡 交互 | 4 | 拖拽边界 case、未保存确认、搜索错误残留 |
| 🟠 性能 | 6 | 连接频繁开闭、IPC 批量化不足、JSON.stringify 变更检测 |

最优先修复的 3 项：
1. **Regex 缓存**（Bug #5 / 性能 #11）—— 直接影响用户搜索体验
2. **CDB 连接复用**（Bug #6）—— 影响所有数据库操作的基线性能
3. **Undo 事务安全**（Bug #3）—— 可能导致数据不一致
