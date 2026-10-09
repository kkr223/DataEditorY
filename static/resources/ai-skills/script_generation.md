---
name: script_generation
description: Generate or repair a complete official YGOPro Lua script for a card in the opened CDB.
tools:
  - list_open_databases
  - get_database_summary
  - search_cards
  - get_card
  - read_card_script
  - propose_script_write
---

生成可运行的官方 YGOPro Lua 脚本，不使用 EDOPro 专有 API。

1. 用 get_card 读取目标卡完整效果，用 read_card_script 检查现有脚本并保留有效逻辑。效果复杂时，搜索 1–3 张相似卡并读取脚本作参考；无可靠参考时说明不确定处。
2. 按每段效果确定时点、条件、cost、取对象方式、处理、次数限制和类别。仅实现卡片文本支持的行为。
3. 用 propose_script_write 提交完整的 c{code}.lua，不提交片段。开头写 `-- c{code}.lua {名称}` 和 `local s,id,o=GetID()`，在 `s.initial_effect(c)` 注册所有效果。

实现要点：
- `SetCost`/`SetTarget` 的 `chk==0` 只检查可行性，不修改游戏状态。
- 文本明确“以……为对象”时用 `Duel.SelectTarget`；处理时选择则在 operation 用 `Duel.SelectMatchingCard`。
- 需要连锁信息的效果设置匹配的 Category 和 `Duel.SetOperationInfo`。每个效果设置正确的类型、时点、范围、次数限制；独立次数限制使用不同的 id 偏移。
- 需要显示描述时用 `aux.Stringid(id,n)`。最终回答列出所用 n 与对应 `texts.str{n+1}`；不需要描述的效果不用添加。
- 不臆造无法确认的 API 或效果逻辑；现有脚本不可无故覆盖。
