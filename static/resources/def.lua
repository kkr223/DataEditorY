---@meta

---@class Card
---@field discard_effect Effect
---@field star_knight_summon_effect Effect
---@field Dragon_Ruler_handes_effect Effect
---@field killer_tune_be_material_effect Effect
---@field shadoll_flip_effect Effect
Card = {}

---@class Duel
Duel = {}

---@class Effect
Effect = {}

---@class Group
Group = {}

---@class Debug
Debug = {}

-----

---仪式怪兽的解放过滤条件
---@return boolean
---@param c Card
---@param tp integer
function Card.mat_filter(c,tp) end

---仪式怪兽的解放过滤条件
---@return boolean
---@param g Group
---@param tp integer
function Card.mat_group_check(g,tp) end

---素材检查（烙印融合）
---@param tp integer
---@param sg Group
---@param fc Card
function Card.branded_fusion_check(tp,sg,fc) end

---素材检查（电子负载融合）
---@param tp integer
---@param sg Group
---@param fc Card
function Card.cyber_fusion_check(tp,sg,fc) end

---素材检查（破坏剑士融合）
---@param tp integer
---@param sg Group
---@param fc Card
function Card.destruction_swordsman_fusion_check(tp,sg,fc) end

---素材检查（至爱接触）
---@param tp integer
---@param sg Group
---@param fc Card
function Card.hero_fusion_check(tp,sg,fc) end

---素材检查（真红眼融合）
---@param tp integer
---@param sg Group
---@param fc Card
function Card.red_eyes_fusion_check(tp,sg,fc) end

---素材检查（奇迹同调融合）
---@param tp integer
---@param sg Group
---@param fc Card
function Card.synchro_fusion_check(tp,sg,fc) end

---素材检查（究极融合）
---@param tp integer
---@param sg Group
---@param fc Card
function Card.ultimate_fusion_check(tp,sg,fc) end

---当作装备卡装备（异热同心武器）
---@param c Card
---@param tp integer
---@param tc Card
function Card.zw_equip_monster(c,tp,tc) end


---返回c的当前卡号（可能因为效果改变）
---@return integer
---@return integer|nil
---@param c Card
function Card.GetCode(c) end

---返回c的卡片记载的卡号
---@return integer
---@param c Card
function Card.GetOriginalCode(c) end

---返回c规则上的卡号（这张卡规则上当作...使用）
---@return integer
---@return integer
---@param c Card
function Card.GetOriginalCodeRule(c) end

---返回c作为融合素材时的卡号（包括c原本的卡号）
---@return integer
---@return integer|nil
---@return ...|nil
---@param c Card
function Card.GetFusionCode(c) end

---返回c作为link素材的卡号（包括c原本的卡号）
---@return integer
---@return integer|nil
---@return ...|nil
---@param c Card
function Card.GetLinkCode(c) end

---检查c作为融合素材时能否当作卡号为code的卡，额外参数是其他code
---@return boolean
---@param c Card
---@param code integer
---@param ...? integer
function Card.IsFusionCode(c,code,...) end

---检查c作为link素材时能否当作卡号为code的卡，额外参数是其他code
---@return boolean
---@param c Card
---@param code integer
---@param ...? integer
function Card.IsLinkCode(c,code,...) end

---检查c是否是卡名含有setname的卡
---@return boolean
---@param c Card
---@param ... integer
function Card.IsSetCard(c,...) end

---检查c是否是原本卡名含有setname的卡
---@return boolean
---@param c Card
---@param ... integer
function Card.IsOriginalSetCard(c,...) end

---检查c位置变化之前是否是名字含有setname的卡
---@return boolean
---@param c Card
---@param ... integer
function Card.IsPreviousSetCard(c,...) end

---检查c作为融合素材时能否当作名字含有setname的卡
---@return boolean
---@param c Card
---@param ... integer
function Card.IsFusionSetCard(c,...) end

---检查c作为link素材时能否当作名字含有setname的卡
---@return boolean
---@param c Card
---@param ... integer
function Card.IsLinkSetCard(c,...) end

---返回c的当前类型
---@return integer
---@param c Card
function Card.GetType(c) end

---返回c的卡片记载的类型
---@return integer
---@param c Card
function Card.GetOriginalType(c) end

---返回c用作融合素材时的类型（与GetType的区别在于对于魔陷区的怪兽卡，返回其原本类型）
---@return integer
---@param c Card
function Card.GetFusionType(c) end

---返回c用作同调素材时的类型（与GetType的区别在于对于魔陷区的怪兽卡，返回其原本类型）
---@return integer
---@param c Card
function Card.GetSynchroType(c) end

---返回c用作同调素材时的类型（与GetType的区别在于对于魔陷区的怪兽卡，返回其原本类型）
---@return integer
---@param c Card
function Card.GetXyzType(c) end

---返回c用作link素材时的类型（与GetType的区别在于对于魔陷区的怪兽卡，返回其原本类型）
---@return integer
---@param c Card
function Card.GetLinkType(c) end

---返回c的当前等级
---@return integer
---@param c Card
function Card.GetLevel(c) end

---返回c的当前阶级
---@return integer
---@param c Card
function Card.GetRank(c) end

---返回c的连接标记数量
---@return integer
---@param c Card
function Card.GetLink(c) end

---返回c的对于同调怪兽sc的同调用等级
---此函数除了某些特定卡如调节支援士，返回值与Card.GetLevel(c)相同
---@return integer
---@param c Card
---@param sc Card
function Card.GetSynchroLevel(c,sc) end

---返回c的对于仪式怪兽rc仪式解放等级
---此函数除了某些特定卡如仪式供物，返回值与Card.GetLevel(c)相同
---@return integer
---@param c Card
---@param rc Card
function Card.GetRitualLevel(c,rc) end

---返回c的卡片记载的等级
---@return integer
---@param c Card
function Card.GetOriginalLevel(c) end

---返回c的卡片记载的阶级
---@return integer
---@param c Card
function Card.GetOriginalRank(c) end

---检查c对于XYZ怪兽xyzc的XYZ用等级是否是lv
---@return boolean
---@param c Card
---@param xyzc Card
---@param lv integer
function Card.IsXyzLevel(c,xyzc,lv) end

---返回c的左灵摆刻度
---@return integer
---@param c Card
function Card.GetLeftScale(c) end

---返回c的原本的左灵摆刻度
---@return integer
---@param c Card
function Card.GetOriginalLeftScale(c) end

---返回c的右灵摆刻度
---@return integer
---@param c Card
function Card.GetRightScale(c) end

---返回c的原本的右灵摆刻度
---@return integer
---@param c Card
function Card.GetOriginalRightScale(c) end

---返回c的当前灵摆刻度。如果在左灵摆区域则返回左刻度，在右灵摆区域或是不在灵摆区域则返回右刻度
---@return integer
---@param c Card
function Card.GetCurrentScale(c) end

---检查c是否是连接标记为 dir 的卡
---@return boolean
---@param c Card
---@param dir integer
function Card.IsLinkMarker(c,dir) end

---返回c所连接区的卡片组
---@return Group
---@param c Card
function Card.GetLinkedGroup(c) end

---返回c所连接区的怪兽卡数量
---@return integer
---@param c Card
function Card.GetLinkedGroupCount(c) end

---返回c的[以 player 来看的场上的]连接区域
---@return integer
---@param c Card
---@param player? integer default: c:GetControler()
function Card.GetLinkedZone(c,player) end

---返回和c互相连接状态的卡片组
---@return Group
---@param c Card
function Card.GetMutualLinkedGroup(c) end

---返回和c互相连接状态的卡片组的数量
---@return integer
---@param c Card
function Card.GetMutualLinkedGroupCount(c) end

---返回[以 player 来看的]与卡片 c 互相连接的卡 所在的区域
---@return integer
---@param c Card
---@param player? integer default: c:GetControler()
function Card.GetMutualLinkedZone(c,player) end

---检查c是否是连接状态
---@return boolean
---@param c Card
function Card.IsLinkState(c) end

---检查c是否是额外连接状态
---@return boolean
---@param c Card
function Card.IsExtraLinkState(c) end

---返回与c同一纵列的c以外的卡片组，后2个参数会计算卡片c左边 left 列 和右边 right 列的所有卡，
---比如c在中间的格子，那么 c:GetColumnGroup(2,2) 就相当于获取了除场地魔法以外的 场上的所有卡
---@return Group
---@param c Card
---@param left? integer default: 0
---@param right? integer default: 0
function Card.GetColumnGroup(c,left,right) end

---用法同上，只是返回的是卡片的数量
---@return integer
---@param c Card
---@param left? integer default: 0
---@param right? integer default: 0
function Card.GetColumnGroupCount(c,left,right) end

---返回[以 player 来看的] location 范围内与 c 同一纵列[包含左边 left 列和右边 right 列]的区域，
---location 的值是 LOCATION_MZONE,LOCATION_SZONE,LOCATIOIN_ONFIELD
---@return integer
---@param c Card
---@param location integer
---@param left? integer
---@param right? integer
---@param player? integer
function Card.GetColumnZone(c,location,left,right,player) end

---检查与c同一纵列的区域是否全都有卡
---@return boolean
---@param c Card
function Card.IsAllColumn(c) end

---返回c的当前属性
---注：对某些多属性怪兽如光与暗之龙，此函数的返回值可能是几个属性的组合值
---@return integer
---@param c Card
function Card.GetAttribute(c) end

---返回c的卡片记载的属性
---@return integer
---@param c Card
function Card.GetOriginalAttribute(c) end

---返回c[由player融合召唤时]用作融合素材时的属性
---@return integer
---@param c Card
---@param player? integer
function Card.GetFusionAttribute(c,player) end

---返回c[由player连接召唤时]用作连接素材时的属性
---@return integer
---@param c Card
---@param player? integer
function Card.GetLinkAttribute(c,player) end

---检查c在墓地中会变成什么属性。
---第二个参数可选，指示假设送去墓地是由于哪个玩家。
---@return integer
---@param c Card
---@param reasonPlayer? integer
function Card.GetAttributeInGrave(c,reasonPlayer) end

---返回c的当前种族
---注：对某些多种族怪兽如动画效果的魔术猿，此函数的返回值可能是几个种族的组合值
---@return integer
---@param c Card
function Card.GetRace(c) end

---返回c的卡片记载的种族
---@return integer
---@param c Card
function Card.GetOriginalRace(c) end

---返回c[由player连接召唤时]作为连接素材时的种族
---@return integer
---@param c Card
---@param player? integer
function Card.GetLinkRace(c,player) end

---检查c在墓地中会变成什么种族。
---第二个参数可选，指示假设送去墓地是由于哪个玩家。
---@return integer
---@param c Card
---@param reasonPlayer? integer
function Card.GetRaceInGrave(c,reasonPlayer) end

---返回c的当前攻击力
---@return integer
---@param c Card
function Card.GetAttack(c) end

---返回c的原本攻击力
---@return integer
---@param c Card
function Card.GetBaseAttack(c) end

---返回c的卡片记载的攻击力，返回值是负数表示是"?"
---@return integer
---@param c Card
function Card.GetTextAttack(c) end

---返回c的当前守备力
---@return integer
---@param c Card
function Card.GetDefense(c) end

---返回c的原本守备力
---@return integer
---@param c Card
function Card.GetBaseDefense(c) end

---返回c的卡片记载的守备力，返回值是负数表示是"?"
---@return integer
---@param c Card
function Card.GetTextDefense(c) end

---返回c位置变化之前在场上的卡号
---@return integer
---@return integer|nil
---@param c Card
function Card.GetPreviousCodeOnField(c) end

---返回c位置变化之前在场上的类型
---@return integer
---@param c Card
function Card.GetPreviousTypeOnField(c) end

---返回c位置变化之前在场上的等级
---@return integer
---@param c Card
function Card.GetPreviousLevelOnField(c) end

---返回c位置变化之前在场上的阶级
---@return integer
---@param c Card
function Card.GetPreviousRankOnField(c) end

---返回c位置变化之前在场上的属性
---@return integer
---@param c Card
function Card.GetPreviousAttributeOnField(c) end

---返回c位置变化之前在场上的种族
---@return integer
---@param c Card
function Card.GetPreviousRaceOnField(c) end

---返回c位置变化之前在场上的攻击力
---@return integer
---@param c Card
function Card.GetPreviousAttackOnField(c) end

---返回c位置变化之前在场上的守备力
---@return integer
---@param c Card
function Card.GetPreviousDefenseOnField(c) end

---返回c位置变化之前在场上叠放的卡片数量
---@return integer
---@param c Card
function Card.GetPreviousOverlayCountOnField(c) end

---返回c的持有者
---@return integer
---@param c Card
function Card.GetOwner(c) end

---返回c的当前控制者
---@return integer
---@param c Card
function Card.GetControler(c) end

---返回c的位置变化之前的控制者
---@return integer
---@param c Card
function Card.GetPreviousControler(c) end

---设置c来到当前位置的原因为reason
---@return boolean
---@param c Card
---@param reason integer
function Card.SetReason(c,reason) end

---返回c的位置变化原因
---@return integer
---@param c Card
function Card.GetReason(c) end

---返回导致c的位置变化的卡
---此函数仅在某卡被战斗破坏时，因为上级召唤被解放，或者成为特殊召唤使用的素材时有效
---@return Card
---@param c Card
function Card.GetReasonCard(c) end

---返回导致c的位置变化的玩家
---@return integer
---@param c Card
function Card.GetReasonPlayer(c) end

---返回导致c的位置变化的效果
---@return Effect
---@param c Card
function Card.GetReasonEffect(c) end

---返回c当前的表示形式
---@return integer
---@param c Card
function Card.GetPosition(c) end

---返回c位置变化前的表示形式
---@return integer
---@param c Card
function Card.GetPreviousPosition(c) end

---返回c在本次战斗发生之前的表示形式
---@return integer
---@param c Card
function Card.GetBattlePosition(c) end

---返回c当前的所在位置
---@return integer
---@param c Card
function Card.GetLocation(c) end

---返回c位置变化前的所在的位置
---@return integer
---@param c Card
function Card.GetPreviousLocation(c) end

---返回c在当前位置的序号
---在场上时，序号代表所在的格子，从左往右分别是0-4，场地魔法格的序号为5
---在其它地方时，序号表示的是第几张卡，最下面的卡的序号为0
---@return integer
---@param c Card
function Card.GetSequence(c) end

---返回c位置变化前的序号
---@return integer
---@param c Card
function Card.GetPreviousSequence(c) end

---检查c是否被卡名含有setname的卡特殊召唤
---@return boolean
---@param c Card
---@param ... integer
function Card.IsSpecialSummonSetCard(c,...) end

---返回c的特殊召唤的信息
---SUMMON_INFO_CODE
---SUMMON_INFO_CODE2
---SUMMON_INFO_TYPE
---SUMMON_INFO_LEVEL
---SUMMON_INFO_RANK
---SUMMON_INFO_ATTRIBUTE
---SUMMON_INFO_RACE
---SUMMON_INFO_ATTACK
---SUMMON_INFO_DEFENSE
---SUMMON_INFO_REASON_EFFET
---@return ...
---@param c Card
---@param ... integer
function Card.GetSpecialSummonInfo(c,...) end

---返回c的召唤/特殊召唤的方式
---@return integer
---@param c Card
function Card.GetSummonType(c) end

---返回c的召唤/特殊召唤的位置
---@return integer
---@param c Card
function Card.GetSummonLocation(c) end

---返回召唤/特殊召唤 c 上场的玩家
---@return integer
---@param c Card
function Card.GetSummonPlayer(c) end

---返回c位置变化的目的地
---此函数仅在处理位置转移代替效果时有效
---@return integer
---@param c Card
function Card.GetDestination(c) end

---返回c离场时因改变去向的效果（如大宇宙）的目的地
---@return integer
---@param c Card
function Card.GetLeaveFieldDest(c) end

---返回c转移到当前位置的回合
---@return integer
---@param c Card
function Card.GetTurnID(c) end

---返回c转移到当前位置的时间标识
---此数值唯一，越小表示c是越早出现在那个位置
---卡片从里侧翻开也会改变此数值
---@return integer
---@param c Card
function Card.GetFieldID(c) end

---返回c转移到当前位置的真实的时间标识
---卡片从里侧翻开不会改变此数值
---@return integer
---@param c Card
function Card.GetRealFieldID(c) end

---检查c是否在规则上当做code使用
---@return boolean
---@param c Card
---@param code integer
function Card.IsOriginalCodeRule(c,code) end

---检查c的卡号是否是 code1[, 或者为 code2...]
---@return boolean
---@param c Card
---@param code1 integer
---@param code2? integer
---@param ...? integer
function Card.IsCode(c,code1,code2,...) end

---检查c是否包含type之中任何类型
---@return boolean
---@param c Card
---@param type integer
function Card.IsType(c,type) end

---检查c是否包含type之中全部类型
---@return boolean
---@param c Card
---@param type integer
function Card.IsAllTypes(c,type) end

---检查c用作融合素材时是否属于类型type（与IsType的区别在于对于魔陷区的怪兽卡，用其原本类型作判断）
---@return boolean
---@param c Card
---@param type integer
function Card.IsFusionType(c,type) end

---检查c用作同调素材时是否属于类型type（与IsType的区别在于对于魔陷区的怪兽卡，用其原本类型作判断）
---@return boolean
---@param c Card
---@param type integer
function Card.IsSynchroType(c,type) end

---检查c用作XYZ素材时是否属于类型type（与IsType的区别在于对于魔陷区的怪兽卡，用其原本类型作判断）
---@return boolean
---@param c Card
---@param type integer
function Card.IsXyzType(c,type) end

---检查c用作连接素材时是否属于类型type（与IsType的区别在于对于魔陷区的怪兽卡，用其原本类型作判断）
---@return boolean
---@param c Card
---@param type integer
function Card.IsLinkType(c,type) end

---检查c是否是等级 level1[, 或者为 level2...]
---@return boolean
---@param c Card
---@param level1 integer
---@param level2? integer
---@param ...? integer
function Card.IsLevel(c,level1,level2,...) end

---检查c是否是阶级 rank1[, 或者为 rank2...]
---@return boolean
---@param c Card
---@param rank1 integer
---@param rank2? integer
---@param ...? integer
function Card.IsRank(c,rank1,rank2,...) end

---检查c的连接标记数量是否是 link1[, 或者为 link2...]
---@return boolean
---@param c Card
---@param link1 integer
---@param link2? integer
---@param ...? integer
function Card.IsLink(c,link1,link2,...) end

---检查c的攻击力是否是 atk1[, 或者为 atk2...]，如果c不是怪兽卡，或者不在 LOCATION_MZONE 则都返回false
---@return boolean
---@param c Card
---@param atk1 integer
---@param atk2? integer
---@param ...? integer
function Card.IsAttack(c,atk1,atk2,...) end

---检查c的守备力是否是 def1[, 或者为 def2...]，如果c不是怪兽卡，或者不在 LOCATION_MZONE 则都返回false
---@return boolean
---@param c Card
---@param def integer
---@param atk2? integer
---@param ...? integer
function Card.IsDefense(c,def,atk2,...) end

---检查c是否属于种族race
---@return boolean
---@param c Card
---@param race integer
function Card.IsRace(c,race) end

---检查c[由player连接召唤时]用作连接素材时是否属于种族race
---@return boolean
---@param c Card
---@param race integer
---@param player? integer
function Card.IsLinkRace(c,race,player) end

---检查c是否属于属性attribute
---@return boolean
---@param c Card
---@param attribute integer
function Card.IsAttribute(c,attribute) end

---检查c[由player融合召唤时]用作融合素材是否属于属性attribute
---@return boolean
---@param c Card
---@param attribute integer
---@param player? integer
function Card.IsFusionAttribute(c,attribute,player) end

---检查c[由player连接召唤时]用作连接素材是否属于属性attribute
---@return boolean
---@param c Card
---@param attribute integer
---@param player? integer
function Card.IsLinkAttribute(c,attribute,player) end

---检查c是否有attribute以外的属性
---（如暗黑神鸟同时具有暗和风属性，not IsAttribute(暗)是false，但IsNonAttribute(暗)是true）
---@return boolean
---@param c Card
---@param attribute integer
function Card.IsNonAttribute(c,attribute) end

---检查c原本是否为融合·同调·XYZ·连接怪兽。这个函数只检查类型，不关心被检查的怪兽的现状。
---@return boolean
---@param c Card
function Card.IsExtraDeckMonster(c) end

---检查c是否包含reason之中任何原因
---@return boolean
---@param c Card
---@param reason integer
function Card.IsReason(c,reason) end

---检查c是否包含reason之中全部原因
---@return boolean
---@param c Card
---@param reason integer
function Card.IsAllReasons(c,reason) end

---检查c的召唤类型是否是sumtype
---@return boolean
---@param c Card
---@param sumtype integer
function Card.IsSummonType(c,sumtype) end

---检查c召唤·特殊召唤的位置是否为loc
---@return boolean
---@param c Card
---@param loc integer
function Card.IsSummonLocation(c,loc) end

---检查将c召唤·特殊召唤的玩家是否为player
---@return boolean
---@param c Card
---@param player integer
function Card.IsSummonPlayer(c,player) end

---检查c是否包含某个状态码
---@return boolean
---@param c Card
---@param status integer
function Card.IsStatus(c,status) end

---检查c是否可以当成scard的非调整来使用
---@return boolean
---@param c Card
---@param scard Card
function Card.IsNotTuner(c,scard) end

---检查c是否为scard的调整怪兽。
---除了检查TYPE_TUNER以外，还会检查其身上所有能让其变为调整怪兽的效果。
---@return boolean
---@param c Card
---@param scard Card
function Card.IsTuner(c,scard) end

---检查c是否为记载满足过滤条件filter效果的卡
---@return boolean
---@param c Card
---@param filter function filter(Effect)
function Card.IsOriginalEffectProperty(c,filter) end

---检查c是否为持有满足过滤条件filter效果的卡
---@return boolean
---@param c Card
---@param filter function filter(Effect)
function Card.IsEffectProperty(c,filter) end

---给c设置或者取消状态码
---除非妳清楚的了解每个状态码的含意，否则不要轻易使用此函数
---@param c Card
---@param state integer
---@param enable boolean
function Card.SetStatus(c,state,enable) end

---检查c属否处于再召唤状态
---@return boolean
---@param c Card
function Card.IsDualState(c) end

---把c设置成再召唤状态
---@param c Card
function Card.EnableDualState(c) end

---设置c的回合计数器（光之护封剑等）
---@param c Card
---@param counter integer
function Card.SetTurnCounter(c,counter) end

---返回c的回合计数器
---@return integer
---@param c Card
function Card.GetTurnCounter(c) end

---把g中的所有卡作为c的素材（上级召唤，特殊召唤）
---@param c Card
---@param g Group|nil
function Card.SetMaterial(c,g) end

---返回c出场使用的素材
---@return Group
---@param c Card
function Card.GetMaterial(c) end

---返回c出场使用的素材数量
---@return integer
---@param c Card
function Card.GetMaterialCount(c) end

---返回c当前装备着的卡片组
---@return Group
---@param c Card
function Card.GetEquipGroup(c) end

---返回c当前装备着的卡片数量
---@return integer
---@param c Card
function Card.GetEquipCount(c) end

---返回c当前的装备对象
---@return Card
---@param c Card
function Card.GetEquipTarget(c) end

---返回c之前的装备对象
---@return Card
---@param c Card
function Card.GetPreviousEquipTarget(c) end

---检查c2是否是c1的正确的装备对象
---##由EFFECT_EQUIP_LIMIT效果或同盟状态确定
---@return boolean
---@param c1 Card
---@param c2 Card
function Card.CheckEquipTarget(c1,c2) end

---检查ec是否为c的有效同盟装备对象。会检查EFFECT_UNION_LIMIT影响和新旧同盟影响。
---@return Card
---@param c Card
---@param ec Card
function Card.CheckUnionTarget(c,ec) end

---返回c当前装备的同盟卡数量、旧同盟卡数量
---@return integer
---@return integer
---@param c Card
function Card.GetUnionCount(c) end

---返回c当前叠放着的卡片组
---@return Group
---@param c Card
function Card.GetOverlayGroup(c) end

---返回c当前叠放着的卡片数量
---@return integer
---@param c Card
function Card.GetOverlayCount(c) end

---返回以c为XYZ素材的卡
---@return Card
---@param c Card
function Card.GetOverlayTarget(c) end

---检查玩家player能否以reason为原因，至少移除c叠放的count张卡
---@return boolean
---@param c Card
---@param player integer
---@param count integer
---@param reason integer
function Card.CheckRemoveOverlayCard(c,player,count,reason) end

---以reason为原因，让玩家player移除c叠放的min-max张卡，返回值表示移除的数量
---@return integer
---@param c Card
---@param player integer
---@param min integer
---@param max integer
---@param reason integer
function Card.RemoveOverlayCard(c,player,min,max,reason) end

---返回c本回合攻击过的卡片组
---@return Group
---@param c Card
function Card.GetAttackedGroup(c) end

---返回c本回合攻击过的卡片数量
---@return integer
---@param c Card
function Card.GetAttackedGroupCount(c) end

---返回c本回合攻击过的次数
---注：如果此值与上一个函数的返回值不同，那么说明此卡本回合进行过直接攻击
---@return integer
---@param c Card
function Card.GetAttackedCount(c) end

---返回与c本回合进行过战斗的卡片组
---进行过战斗指发生过伤害的计算，用于剑斗兽等卡的判定
---@return Group
---@param c Card
function Card.GetBattledGroup(c) end

---返回与c本回合进行过战斗的的卡片数量
---@return integer
---@param c Card
function Card.GetBattledGroupCount(c) end

---返回c本回合攻击宣言的次数
---注：攻击被无效不会被计入攻击过的次数，但是会计入攻击宣言的次数
---@return integer
---@param c Card
function Card.GetAttackAnnouncedCount(c) end

---检查c是否直接攻击过
---@return boolean
---@param c Card
function Card.IsDirectAttacked(c) end

---把c2作为c1的永续对象
---c1和c2的联系会在c1或c2任意一卡离场或变成里侧表示时reset
---@param c1 Card
---@param c2 Card
function Card.SetCardTarget(c1,c2) end

---返回c当前所有的永续对象
---@return Group
---@param c Card
function Card.GetCardTarget(c) end

---返回c当前第一个永续对象，没有则返回 nil
---@return Card
---@param c Card
function Card.GetFirstCardTarget(c) end

---返回c当前的永续对象的数量
---@return integer
---@param c Card
function Card.GetCardTargetCount(c) end

---检查c2是否取c1为永续对象
---@return boolean
---@param c1 Card
---@param c2 Card
function Card.IsHasCardTarget(c1,c2) end

---取消c2为c1的永续对象
---@param c1 Card
---@param c2 Card
function Card.CancelCardTarget(c1,c2) end

---返回取c作为永续对象的所有卡
---@return Group
---@param c Card
function Card.GetOwnerTarget(c) end

---返回取c作为永续对象的卡的数量
---@return integer
---@param c Card
function Card.GetOwnerTargetCount(c) end

---返回c的“卡片发动”的效果，即类型为EFFECT_TYPE_ACTIVATE的效果
---仅对魔法和陷阱有效
---@return Effect
---@return ...? Effect
---@param c Card
function Card.GetActivateEffect(c) end

---返回c的可以发动时机正确的“卡的发动”的效果，neglect_con=true则无视发动条件，neglect_cost=true则无视发动cost
---copy_info=false或者自由时点的效果则只返回这个效果 e
---否则还返回这个效果的触发时点的信息 e,eg,ep,ev,re,r,rp
---@return Effect
---@return Group|nil
---@return integer|nil
---@return integer|nil
---@return Effect|nil
---@return integer|nil
---@return integer|nil
---@param c Card
---@param neglect_con boolean
---@param neglect_cost boolean
---@param copy_info boolean
function Card.CheckActivateEffect(c,neglect_con,neglect_cost,copy_info) end

---如果卡片 c 受到同调素材限制效果 EFFECT_TUNER_MATERIAL_LIMIT 影响，则返回 Effect e,function target,int value,int min,int max ;否则返回nil
---@return nil|Effect
---@return function|nil
---@return integer|nil
---@return integer|nil
---@return integer|nil
---@param c Card
function Card.GetTunerLimit(c) end

---如果卡片 c 受到手卡同调效果 EFFECT_HAND_SYNCHRO 影响，则返回 Effect e,function target,int min,int max ;否则返回nil
---@return nil|Effect
---@return function|nil
---@return integer|nil
---@return integer|nil
---@param c Card
function Card.GetHandSynchro(c) end

---把效果e注册给c，返回效果的全局id，并设置e的Handler为c
---默认情况下注册时如果c带有免疫e的效果那么注册会失败
---如果forced为true则不会检查c对e的免疫效果
---@return integer
---@param c Card
---@param e Effect
---@param forced? boolean default: false
function Card.RegisterEffect(c,e,forced) end

---检查c是否受到效果种类是code的效果的影响
---没有则返回nil
---有则返回那些效果
---@return Effect
---@return ...? Effect
---@param c Card
---@param code integer
---@param player? integer
function Card.IsHasEffect(c,code,player) end

---以重置类型为reset_type、重置种类为reset_code手动重置c受到的效果的影响
---reset_type只能是以下类型，对应的重置种类为
---RESET_EVENT       发生事件重置        reset_code为事件
---RESET_PHASE       阶段结束重置        reset_code为阶段
---RESET_CODE        重置指定code的效果  reset_code为效果的种类code，只能重置EFFECT_TYPE_SINGLE的永续型效果
---RESET_COPY        重置复制的效果      reset_code为copy_id
---RESET_CARD        重置卡片的效果      reset_code为效果owner的卡号
---@param c Card
---@param reset_code integer
---@param reset_type integer
function Card.ResetEffect(c,reset_code,reset_type) end

---返回c受到影响的种类是code的效果的数量
---@return integer
---@param c Card
---@param code integer
function Card.GetEffectCount(c,code) end

---为c注册一个标识用效果
---注：注册给卡的标识用效果不会用于系统，
---即使code与内置效果code重合也不会影响，
---并且类型总是EFFECT_TYPE_SINGLE，reset方法，property和一般的效果相同，
---并且不会无效化，不受卡的免疫效果影响
---@return Effect
---@param c Card
---@param code integer
---@param reset_flag integer
---@param property integer
---@param reset_count integer
---@param label? integer
---@param desc? integer
function Card.RegisterFlagEffect(c,code,reset_flag,property,reset_count,label,desc) end

---返回c的种类是code的标识效果的数量
---@return integer
---@param c Card
---@param code integer
function Card.GetFlagEffect(c,code) end

---手动清除c的种类是code的标识效果
---@param c Card
---@param code integer
function Card.ResetFlagEffect(c,code) end

---返回c是否存在种类为code的标识效果，若有则设置第一个的Label属性为label
---@return boolean
---@param c Card
---@param code integer
---@param label integer
function Card.SetFlagEffectLabel(c,code,label) end

---返回c的种类为code的每个标识效果的Label，没有此效果则返回nil
---@return integer
---@return ...? integer
---@param c Card
---@param code integer
function Card.GetFlagEffectLabel(c,code) end

---为c1建立与c2的联系，此联系仅会由于c1发生RESET_EVENT的事件reset
---@param c1 Card
---@param c2 Card
---@param reset_flag integer
function Card.CreateRelation(c1,c2,reset_flag) end

---手动释放c1对于c2的联系
---@param c1 Card
---@param c2 Card
function Card.ReleaseRelation(c1,c2) end

---为卡片c和效果e建立联系
---@param c Card
---@param e Effect
function Card.CreateEffectRelation(c,e) end

---手动释放c与效果e的联系
---@param c Card
---@param e Effect
function Card.ReleaseEffectRelation(c,e) end

---清空c所有联系的效果
---@param c Card
function Card.ClearEffectRelation(c) end

---检查c是否和效果e有联系
---注：每次发动进入连锁的效果时，发动效果的卡，以及发动效果时指定的对象
---（用Duel.SetTargetCard或者Duel.SelectTarget指定的，包括取对象和不取对象）
---会自动与那个效果建立联系，一旦离场，联系会重置
---@return boolean
---@param c Card
---@param e Effect
function Card.IsRelateToEffect(c,e) end

---检查c是否和连锁chainc有联系
---注：每次发动进入连锁的效果时，发动效果的卡，以及发动效果时指定的对象
---（用Duel.SetTargetCard或者Duel.SelectTarget指定的，包括取对象和不取对象）
---会自动与那个效果建立联系，一旦离场，联系会重置
---@return boolean
---@param c Card
---@param chainc? integer default: 0
function Card.IsRelateToChain(c,chainc) end

---检查c1是否和c2有联系
---@return boolean
---@param c1 Card
---@param c2 Card
function Card.IsRelateToCard(c1,c2) end

---检查c是否和本次战斗关联
---注：此效果通常用于伤害计算后伤害阶段结束前，用于检查战斗的卡是否离场过
---@return boolean
---@param c Card
function Card.IsRelateToBattle(c) end

---为c添加卡号是code的卡的可复制的效果，并且添加额外的reset条件
---返回值是表示复制效果的代号id
---@return integer
---@param c Card
---@param code integer
---@param reset_flag integer
---@param reset_count? integer default: 1
function Card.CopyEffect(c,code,reset_flag,reset_count) end

---把c的效果替换为卡号是code的卡的效果，并且添加额外的reset条件
---返回值是表示替换效果的代号id
---@return integer
---@param c Card
---@param code integer
---@param reset_flag integer
---@param reset_count? integer default: 1
function Card.ReplaceEffect(c,code,reset_flag,reset_count) end

---为c添加苏生限制
---##实际上是不可复制、不会被无效的EFFECT_UNSUMMONABLE_CARD和EFFECT_REVIVE_LIMIT效果
---@param c Card
function Card.EnableReviveLimit(c) end

---使c完成正规的召唤手续
---##此函数也可通过 c:SetStatus(STATUS_PROC_COMPLETE,true)实现
---@param c Card
function Card.CompleteProcedure(c) end

---检查c是否处于无效状态
---@return boolean
---@param c Card
function Card.IsDisabled(c) end

---检查c是否是可被[效果 e]破坏的
---@return boolean
---@param c Card
---@param e? Effect
function Card.IsDestructable(c,e) end

---检查c是否是可通常召唤的卡
---@return boolean
---@param c Card
function Card.IsSummonableCard(c) end

---检查c是否能以正规方法特殊召唤。
---c必须有可特殊召唤的方式。
---@return boolean
---@param c Card
function Card.IsSpecialSummonableCard(c) end

---检查c是否是可[用 sum_type 方式]融合召唤的卡
---@return boolean
---@param c Card
---@param sum_type? integer
function Card.IsFusionSummonableCard(c,sum_type) end

---检查是否可以对c[用 sum_type 方式]进行特殊召唤手续
---@return boolean
---@param c Card
---@param sum_type? integer
function Card.IsSpecialSummonable(c,sum_type) end

---检查是否可以以tuner作为调整，场上的卡[或mg]为同调素材对c进行同调召唤手续
---如果tuner是nil，此函数与Card.IsSpecialSummonable作用相同
---@return boolean
---@param c Card
---@param tuner Card|nil
---@param mg? Group
function Card.IsSynchroSummonable(c,tuner,mg) end

---检查是否可以在场上的卡[或mg][中选出 min-max 个XYZ素材]对c进行XYZ召唤手续
---如果mg为nil，此函数与 c:IsSpecialSummonable(SUMMON_TYPE_XYZ)作用相同
---@return boolean
---@param c Card
---@param mg Group|nil
---@param min? integer default: 0
---@param max? integer default: 0
function Card.IsXyzSummonable(c,mg,min,max) end

---检查是否可以在场上的卡[或mg][中选出 min-max 个连接素材]对c进行连接召唤手续
---如果mg为nil，此函数与 c:IsSpecialSummonable(SUMMON_TYPE_LINK)作用相同
---@return boolean
---@param c Card
---@param mg Group|nil
---@param min? integer default: 0
---@param max? integer default: 0
function Card.IsLinkSummonable(c,mg,min,max) end

---检查c是否可以进行通常召唤（不包含通常召唤的set)，ignore_count=true则不检查召唤次数限制
---e~=nil则检查c是否可以以效果e进行通常召唤，min表示至少需要的祭品数（用于区分妥协召唤与上级召唤）,zone 表示必须要召唤到的区域
---@return boolean
---@param c Card
---@param ignore_count boolean
---@param e Effect|nil
---@param min? integer default: 0
---@param zone? integer default: 0x1f
function Card.IsSummonable(c,ignore_count,e,min,zone) end

---检查c是否可进行通常召唤的set，ignore_count=true则不检查召唤次数限制
---e~=nil则检查c是否可以以效果e进行通常召唤的set，min表示至少需要的祭品数（用于区分妥协召唤set与上级召唤set）,zone 表示必须要放置到的区域
---@return boolean
---@param c Card
---@param ignore_count boolean
---@param e Effect|nil
---@param min? integer default: 0
---@param zone? integer default: 0x1f
function Card.IsMSetable(c,ignore_count,e,min,zone) end

---检查c是否可以set到魔法陷阱区，ignore_field=true则无视魔陷区格子是否能使用的限制
---@return boolean
---@param c Card
---@param ignore_field? boolean default: false
function Card.IsSSetable(c,ignore_field) end

---检查c是否可以被玩家sumplayer用效果e[以sumtype方式和sumpos表示形式]特殊召唤[到玩家 toplayer 的区域zone]
---如果nocheck是true则不检查c的召唤条件，如果nolimit是true则不检查c的苏生限制
---@return boolean
---@param c Card
---@param e Effect
---@param sumtype integer
---@param sumplayer integer
---@param nocheck boolean
---@param nolimit boolean
---@param sumpos? integer default: POS_FACEUP
---@param toplayer? integer default: sumplayer
---@param zone? integer default: 0xff
function Card.IsCanBeSpecialSummoned(c,e,sumtype,sumplayer,nocheck,nolimit,sumpos,toplayer,zone) end

---检查c是否可以送去手卡
---注：仅当卡片或者玩家受到“不能加入手卡”的效果的影响时（如雷王）此函数才返回false
---##以下几个函数类似
---@return boolean
---@param c Card
function Card.IsAbleToHand(c) end

---检查c是否可以送去卡组
---@return boolean
---@param c Card
function Card.IsAbleToDeck(c) end

---检查c是否可以送去额外卡组
---对于非融合、同调等额外怪兽或者非灵摆怪兽此函数均返回false
---@return boolean
---@param c Card
function Card.IsAbleToExtra(c) end

---检查c是否可以送去墓地
---@return boolean
---@param c Card
function Card.IsAbleToGrave(c) end

---检查c是否可以被玩家player除外
---@return boolean
---@param c Card
---@param player? integer
---@param pos? integer
---@param reason? integer
function Card.IsAbleToRemove(c,player,pos,reason) end

---检查c是否可以作为cost送去手卡
---注：此函数会在Card.IsAbleToHand的基础上追加检测c的实际目的地
---当c送往手卡会被送去其它地方时（如缩退回路适用中，或者c是融合、同调 等额外怪兽的一种），此函数返回false
---##以下几个函数类似
---@return boolean
---@param c Card
function Card.IsAbleToHandAsCost(c) end

---检查c是否可以作为cost送去卡组
---@return boolean
---@param c Card
function Card.IsAbleToDeckAsCost(c) end

---检查c是否可以作为cost送去额外卡组，主卡组的灵摆卡会返回false
---@return boolean
---@param c Card
function Card.IsAbleToExtraAsCost(c) end

---检查c是否可以作为cost送去卡组或额外卡组（用于新宇侠、剑斗兽融合怪兽的召唤手续检测）等价于 (c:IsAbleToDeckAsCost() or c:IsAbleToExtraAsCost())
---@return boolean
---@param c Card
function Card.IsAbleToDeckOrExtraAsCost(c) end

---检查c是否可以作为cost送去墓地
---@return boolean
---@param c Card
function Card.IsAbleToGraveAsCost(c) end

---检查c是否可以作为cost除外
---@return boolean
---@param c Card
function Card.IsAbleToRemoveAsCost(c) end

---检查c是否可以被以原因reason解放（非上级召唤用）
---@return boolean
---@param c Card
---@param reason? integer default: REASON_COST
function Card.IsReleasable(c,reason) end

---检查c是否可以被效果解放
---@return boolean
---@param c Card
function Card.IsReleasableByEffect(c) end

---检查c是否可以以reason原因丢弃
---注：此函数仅用于检测，
---以REASON_DISCARD作为原因把一张手卡送墓并不会导致那张卡不能丢弃
---@return boolean
---@param c Card
---@param reason? integer default: REASON_COST
function Card.IsDiscardable(c,reason) end

---检查c是否可以攻击
---@return boolean
---@param c Card
function Card.IsAttackable(c) end

---检查c是否可以连续攻击，c的攻击宣言次数>=ac则返回false
---monsteronly = true 则表示只能对怪兽攻击
---注：当c因为闪光之双剑等效果进行过多次攻击之后此函数返回false
---@return boolean
---@param c Card
---@param ac? integer
---@param monsteronly? boolean
function Card.IsChainAttackable(c,ac,monsteronly) end

---检查c是否是表侧表示
---@return boolean
---@param c Card
function Card.IsFaceup(c) end

---检查c是否是表侧表示，在手卡墓地主卡组等处始终返回true
---@return boolean
---@param c Card
function Card.IsFaceupEx(c) end

---检查c是否是攻击表示
---@return boolean
---@param c Card
function Card.IsAttackPos(c) end

---检查c是否是里侧表示
---@return boolean
---@param c Card
function Card.IsFacedown(c) end

---检查c是否是守备表示
---@return boolean
---@param c Card
function Card.IsDefensePos(c) end

---检查c是否是表示形式pos
---@return boolean
---@param c Card
---@param pos integer
function Card.IsPosition(c,pos) end

---检查c位置变化之前是否是表示形式pos
---@return boolean
---@param c Card
---@param pos integer
function Card.IsPreviousPosition(c,pos) end

---检查c的当前控制着是否是controler
---@return boolean
---@param c Card
---@param controler integer
function Card.IsControler(c,controler) end

---检查c的上一个控制者是否为player
---@return boolean
---@param c Card
---@param player integer
function Card.IsPreviousControler(c,player) end

---检查c是否在场
---注：当怪兽召唤，反转召唤，特殊召唤时召唤成功之前，此函数返回false
---@return boolean
---@param c Card
function Card.IsOnField(c) end

---检查c当前位置是否是location
---注：当怪兽召唤，反转召唤，特殊召唤时召唤成功之前，
---并且location=LOCATION_MZONE时，此函数返回false
---@return boolean
---@param c Card
---@param location integer
function Card.IsLocation(c,location) end

---检查c之前的位置是否是location
---@return boolean
---@param c Card
---@param location integer
function Card.IsPreviousLocation(c,location) end

---检查c是否是等级level以下（至少为1）
---@return boolean
---@param c Card
---@param level integer
function Card.IsLevelBelow(c,level) end

---检查c是否是等级level以上
---@return boolean
---@param c Card
---@param level integer
function Card.IsLevelAbove(c,level) end

---检查c是否是阶级rank以下（至少为1）
---@return boolean
---@param c Card
---@param rank integer
function Card.IsRankBelow(c,rank) end

---检查c是否是阶级rank以上
---@return boolean
---@param c Card
---@param rank integer
function Card.IsRankAbove(c,rank) end

---检查c是否连接标记数量是link以下（至少为1）
---@return boolean
---@param c Card
---@param link integer
function Card.IsLinkBelow(c,link) end

---检查c是否连接标记数量是link以上
---@return boolean
---@param c Card
---@param link integer
function Card.IsLinkAbove(c,link) end

---检查c是否是攻击力atk以下（至少为0）
---@return boolean
---@param c Card
---@param atk integer
function Card.IsAttackBelow(c,atk) end

---检查c是否是攻击力atk以上
---@return boolean
---@param c Card
---@param atk integer
function Card.IsAttackAbove(c,atk) end

---检查c是否是守备力def以下（至少为0）
---@return boolean
---@param c Card
---@param def integer
function Card.IsDefenseBelow(c,def) end

---检查c是否是守备力def以上
---@return boolean
---@param c Card
---@param def integer
function Card.IsDefenseAbove(c,def) end

---检查c是否持有等级
---@return boolean
---@param c Card
function Card.IsHasLevel(c) end

---检查c是否持有守备力
---@return boolean
---@param c Card
function Card.IsHasDefense(c) end

---检查c是否处于公开状态
---@return boolean
---@param c Card
function Card.IsPublic(c) end

---检查c是否处于被宣言禁止状态
---@return boolean
---@param c Card
function Card.IsForbidden(c) end

---检查c是否可以改变控制权
---注：仅当卡收到了“不能改变控制权”的效果的影响时，此函数返回false
---@return boolean
---@param c Card
function Card.IsAbleToChangeControler(c) end

---检查c的控制权是否可以改变。
---ignore_mzone=true 会忽视转移控制权后的玩家场上是否有空格位， zone 表示必须要使用的位置
---@return boolean
---@param c Card
---@param ignore_mzone? boolean default: false
---@param zone? integer default: 0xff
function Card.IsControlerCanBeChanged(c,ignore_mzone,zone) end

---为c放置count个countertype类型的指示物，singly为true表示逐个添加至上限为止
---@return boolean
---@param c Card
---@param countertype integer
---@param count integer
---@param singly? integer default: false
function Card.AddCounter(c,countertype,count,singly) end

---让玩家player以原因reason移除c上的count个countertype类型的指示物， countertype=0 则清除c的所有指示物
---@param c Card
---@param player integer
---@param countertype integer
---@param count integer
---@param reason integer
function Card.RemoveCounter(c,player,countertype,count,reason) end

---返回c上的countertype类型的指示物的数量， countertype=0 则返回c上所有类型的指示物数量之和
---@return integer
---@param c Card
---@param countertype integer
function Card.GetCounter(c,countertype) end

---允许c[在位置location，满足条件condition]放置那个需要“可以放置”才能放置的指示物countertype
---（location的默认值与c的种类有关，灵摆怪兽需要指定能否在怪兽区域或灵摆区域放置指示物）
---@param c Card
---@param countertype integer
---@param location? integer
---@param condition? function
function Card.EnableCounterPermit(c,countertype,location,condition) end

---设定c放置countertype类型指示物的上限
---@param c Card
---@param countertype integer
---@param count integer
function Card.SetCounterLimit(c,countertype,count) end

---检查c是否可以用效果改变表示形式
---@return boolean
---@param c Card
function Card.IsCanChangePosition(c) end

---检查c是否可以转成里侧表示
---@return boolean
---@param c Card
function Card.IsCanTurnSet(c) end

---检查c是否可以[逐个(singly=true)在 location 区域]放置count个countertype类型的指示物
---@return boolean
---@param c Card
---@param countertype integer
---@param count integer
---@param singly? integer default: false
---@param location? integer
function Card.IsCanAddCounter(c,countertype,count,singly,location) end

---检查玩家player是否可以以原因reason移除c上的count个countertype类型的指示物
---@return boolean
---@param c Card
---@param player integer
---@param countertype integer
---@param count integer
---@param reason integer
function Card.IsCanRemoveCounter(c,player,countertype,count,reason) end

---检查c上是否可以放置countertype类型的指示物
---@return boolean
---@param c Card
---@param countertype integer
function Card.IsCanHaveCounter(c,countertype) end

---检查c是否可以作为XYZ素材
---@return boolean
---@param c Card
---@param player? integer
function Card.IsCanOverlay(c,player) end

---检查c是否可以成为[融合怪兽fc的]融合素材
---@return boolean
---@param c Card
---@param fc? Card
function Card.IsCanBeFusionMaterial(c,fc) end

---检查c是否可以成为[以 tuner 为调整的同调怪兽sc的]同调素材
---@return boolean
---@param c Card
---@param sc? Card
---@param tuner? Card
function Card.IsCanBeSynchroMaterial(c,sc,tuner) end

---检查c是否可以作为[仪式怪兽sc的]仪式素材,没有指定sc的场合，必须填nil
---@return boolean
---@param c Card
---@param sc Card|nil
function Card.IsCanBeRitualMaterial(c,sc) end

---检查c是否可以成为[XYZ怪兽sc的]XYZ素材,没有指定sc的场合，必须填nil
---@return boolean
---@param c Card
---@param sc Card|nil
function Card.IsCanBeXyzMaterial(c,sc) end

---检查c是否可以成为[连接怪兽sc的]连接素材,没有指定sc的场合，必须填nil
---@return boolean
---@param c Card
---@param sc Card|nil
function Card.IsCanBeLinkMaterial(c,sc) end

---检查场上[或g]是否包含了c需要[必须包含gc在内]的一组融合素材
---##根据c的种类为EFFECT_FUSION_MATERIAL的效果的Condition函数检查
---@return boolean
---@param c Card
---@param g? Group|nil
---@param gc? Card|nil
---@param chkf? integer default: PLAYER_NONE
---@param not_material? boolean default: false
function Card.CheckFusionMaterial(c,g,gc,chkf,not_material) end

---检查c能否代替融合怪兽fc的记述卡名的素材
---@return boolean
---@param c Card
---@param fc Card
function Card.CheckFusionSubstitute(c,fc) end

---检查c是否免疫效果e（即不受效果e的影响）
---@return boolean
---@param c Card
---@param e Effect
function Card.IsImmuneToEffect(c,e) end

---检查c的效果是否能被e无效。
---已经被无效的卡，或原本就没有效果的卡，或不受e影响的卡不能被无效。
---第三个参数可选，指示其是否为怪兽效果。
---@return boolean
---@param c Card
---@param e Effect
---@param isMonsterEffect? boolean
function Card.IsCanBeDisabledByEffect(c,e,isMonsterEffect) end

---检查c是否可以成为效果[e的]对象
---@return boolean
---@param c Card
---@param e? Effect
function Card.IsCanBeEffectTarget(c,e) end

---检查c1是否可以成为c2的攻击目标
---@return boolean
---@param c1 Card
---@param c2 Card
function Card.IsCanBeBattleTarget(c1,c2) end

---为魔陷卡c添加怪兽数值,type 为怪兽类型，不能是没有等级的怪兽
---注：在数据库中有记录的数值视为原本数值
---@param c Card
---@param type integer
---@param attribute? integer
---@param race? integer
---@param level? integer
---@param atk? integer
---@param def? integer
function Card.AddMonsterAttribute(c,type,attribute,race,level,atk,def) end

---取消送墓确定状态，cancel=false则重新设置送墓确定状态
---注：送墓确定状态指的是在场上发动的不留场的魔法和陷阱后，这些卡片的状态
---送墓确定状态中的卡无法返回手卡和卡组，并且连锁结束时送去墓地
---此函数的作用是取消此状态使其留场，用于光之护封剑和废铁稻草人等卡
---@param c Card
---@param cancel? boolean default: true
function Card.CancelToGrave(c,cancel) end

---返回通常召唤c所需要的祭品的最小和最大数量
---@return integer
---@return integer
---@param c Card
function Card.GetTributeRequirement(c) end

---返回与c进行战斗的卡，没有则返回nil
---@return Card
---@param c Card
function Card.GetBattleTarget(c) end

---返回c可攻击的卡片组以及能否直接攻击
---@return Group
---@return boolean
---@param c Card
function Card.GetAttackableTarget(c) end

---为c设置类型为type的卡片提示信息
---type只能为以下值，对应的value类型为
---CHINT_TURN              回合数
---CHINT_CARD              卡片id
---CHINT_RACE              种族
---CHINT_ATTRIBUTE         属性
---CHINT_NUMBER            数字
---CHINT_DESC              描述
---@param c Card
---@param type integer
---@param value integer
function Card.SetHint(c,type,value) end

---设置c在卡组中正面表示（POS_FACEUP_DEFENSE）
---@param c Card
function Card.ReverseInDeck(c) end

---设置c以unique_code只能在场上[或怪兽区域或魔陷区域，由unique_location决定]只能存在1张,function 的返回值类型必须是int
---s不为0会检查自己场上的唯一性，o不为0则检查对方场上的唯一性
---@param c Card
---@param s integer
---@param o integer
---@param unique_code function|integer
---@param unique_location? integer default: LOCATIOIN_ONFIELD
function Card.SetUniqueOnField(c,s,o,unique_code,unique_location) end

---检查c在check_player场上的唯一性
---@return boolean
---@param c Card
---@param check_player integer
---@param check_location? integer default: LOCATION_ONFIELD
---@param icard? Card|nil
function Card.CheckUniqueOnField(c,check_player,check_location,icard) end

---重置c受到的卡号为code1[, code2...]的卡片的效果的影响
---@param c Card
---@param code1? integer
---@param ...? any
function Card.ResetNegateEffect(c,code1,...) end

---把c的assume_type的数值当作assume_value使用（基因组斗士）
---@param c Card
---@param assume_type integer
---@param assume_value integer
function Card.AssumeProperty(c,assume_type,assume_value) end

---设置c一回合只能进行1次特殊召唤（灵兽，波动龙）
---相同的spsummon_code共用1个次数
---@param c Card
---@param spsummon_code integer
function Card.SetSPSummonOnce(c,spsummon_code) end

---设置全局标记global_flag
---@param global_flag integer
function Duel.EnableGlobalFlag(global_flag) end

---返回玩家player的当前LP
---@return integer
---@param player integer
function Duel.GetLP(player) end

---设置玩家player的当前LP为lp
---@param player integer
---@param lp integer
function Duel.SetLP(player,lp) end

---返回当前的回合玩家是否为playerid
---@return boolean
---@param playerid integer
function Duel.IsTurnPlayer(playerid) end

---返回当前的回合玩家
---@return integer
function Duel.GetTurnPlayer() end

---返回[player所经过的]当前的回合数
---@return integer
---@param player? integer
function Duel.GetTurnCount(player) end

---返回玩家player每回合的规则抽卡数量
---@return integer
---@param player integer
function Duel.GetDrawCount(player) end

---把效果e作为玩家player的效果注册给全局环境
---@param e Effect
---@param player integer
function Duel.RegisterEffect(e,player) end

---为玩家player注册全局环境下的标识效果，并返回这个效果
---此效果总是影响玩家的(EFFECT_FLAG_PLAYER_TARGET)并且不会被无效化
---其余部分与Card.RegisterFlagEffect相同
---@return Effect
---@param player integer
---@param code integer
---@param reset_flag integer
---@param property integer
---@param reset_count integer default: 1
---@param label? integer
function Duel.RegisterFlagEffect(player,code,reset_flag,property,reset_count,label) end

---返回玩家 player 的 code 标识效果的数量
---@return integer
---@param player integer
---@param code integer
function Duel.GetFlagEffect(player,code) end

---手动reset玩家player的 code 标识效果
---@param player integer
---@param code integer
function Duel.ResetFlagEffect(player,code) end

---返回player是否存在种类为code的标识效果，若有则设置第一个的Label属性为label
---@return boolean
---@param player integer
---@param code integer
---@param label integer
function Duel.SetFlagEffectLabel(player,code,label) end

---返回玩家player的种类为code的每个标识效果的Label，没有此效果则返回nil
---@return integer
---@return ...? integer
---@param player integer
---@param code integer
function Duel.GetFlagEffectLabel(player,code) end

---以reason原因破坏targets去dest，返回值是实际被破坏的数量
---如果reason包含REASON_RULE，则破坏事件将不会检查卡片是否免疫效果，
---不会触发代破效果并且无视“不能破坏”
---如果设置reason_player，则视为被玩家reason_player移动
---@return integer
---@param targets Card|Group
---@param reason integer
---@param dest? integer
---@param reason_player? integer
function Duel.Destroy(targets,reason,dest,reason_player) end

---以reason原因，pos表示形式除外targets，返回值是实际被操作的数量
---如果reason包含REASON_TEMPORARY，那么视为是暂时除外，可以通过Duel.ReturnToField返回到场上
---如果设置reason_player，则视为被玩家reason_player移动
---@return integer
---@param targets Card|Group
---@param pos integer
---@param reason integer
---@param reason_player? integer
function Duel.Remove(targets,pos,reason,reason_player) end

---以reason原因把targets送去墓地，返回值是实际被操作的数量
---如果设置reason_player，则视为被玩家reason_player移动
---@return integer
---@param targets Card|Group
---@param reason integer
---@param reason_player? integer
function Duel.SendtoGrave(targets,reason,reason_player) end

---以reason原因把targets送去玩家player的手卡，返回值是实际被操作的数量
---如果player是nil则返回卡的持有者的手卡
---如果设置reason_player，则视为被玩家reason_player移动
---@return integer
---@param targets Card|Group
---@param player integer|nil
---@param reason integer
---@param reason_player? integer
function Duel.SendtoHand(targets,player,reason,reason_player) end

---以reason原因把targets送去玩家player的卡组，返回值是实际被操作的数量
---如果player是nil则返回卡的持有者的卡组
---如果seq=0，则是返回卡组最顶端；seq=1则是返回卡组最底端；
---其余情况则是返回最顶端并且标记需要洗卡组
---如果设置reason_player，则视为被玩家reason_player移动
---如果设置send_activating，则可以移动发动中的魔法陷阱卡
---@return integer
---@param targets Card|Group
---@param player integer|nil
---@param seq integer
---@param reason integer
---@param reason_player? integer
---@param send_activating? boolean
function Duel.SendtoDeck(targets,player,seq,reason,reason_player,send_activating) end

---以reason原因把灵摆卡targets表侧表示送去玩家player的额外卡组，返回值是实际被操作的数量
---如果player是nil则返回卡的持有者的额外卡组
---@return integer
---@param targets Card|Group
---@param player integer|nil
---@param reason integer
function Duel.SendtoExtraP(targets,player,reason) end

---此函数返回之前一次卡片操作实际操作的卡片组。包括
---Duel.Destroy, Duel.Remove, Duel.SendtoGrave, 
---Duel.SendtoHand, Duel.SendtoDeck, Duel.SendtoExtraP, Duel.Release, 
---Duel.ChangePosition, Duel.SpecialSummon, Duel.DiscardDeck
---@return Group
function Duel.GetOperatedGroup() end

---让玩家 player 以效果e对c[在区域 zone]进行通常召唤(非set)，至少使用min个祭品
---如果e=nil,那么就按照一般的通常召唤规则进行通常召唤
---如果ignore_count=true，则忽略每回合的通常召唤次数限制
---@param player integer
---@param c Card
---@param ignore_count boolean
---@param e Effect|nil
---@param min? integer default: 0
---@param zone? integer default: 0x1f
function Duel.Summon(player,c,ignore_count,e,min,zone) end

---让玩家player对c[用 sumtype 方式]进行特殊召唤手续（？）
---@param player integer
---@param c Card
---@param sumtype? integer default: 0
function Duel.SpecialSummonRule(player,c,sumtype) end

---让玩家player以tuner作为调整,场上的卡[或mg]为素材，对c进行同调召唤手续
---@param player integer
---@param c Card
---@param tuner Card|nil
---@param mg? Group|nil
---@param minc? integer default: 0
---@param maxc? integer default: 0
function Duel.SynchroSummon(player,c,tuner,mg,minc,maxc) end

---让玩家player用场上的卡[或mg][选min-max个素材]对c进行XYZ召唤手续
---mg非空且min为0则直接把mg全部作为XYZ素材
---@param player integer
---@param c Card
---@param mg Group|nil
---@param min? integer default: 0
---@param max? integer default: 0
function Duel.XyzSummon(player,c,mg,min,max) end

---让玩家player以mg[中除lcard以外的最少minc，最多maxc张卡]为素材将pcard连接召唤。
---@param player integer
---@param pcard Card
---@param mg Group|nil
---@param lcard? Card
---@param minc? integer
---@param maxc? integer
function Duel.LinkSummon(player,pcard,mg,lcard,minc,maxc) end

---让玩家 player 以效果e对c[在区域 zone]进行通常召唤的Set，至少使用min个祭品
---如果e=nil,那么就按照一般的通常召唤规则进行通常召唤
---如果ignore_count=true，则忽略每回合的通常召唤次数限制
---@param player integer
---@param c Card
---@param ignore_count boolean
---@param e Effect|nil
---@param min? integer default: 0
---@param zone? integer default: 0x1f
function Duel.MSet(player,c,ignore_count,e,min,zone) end

---让玩家player把targets盖放到target_player的魔法陷阱区， confirm 表示是否需要确认
---若targets为Group，则返回成功操作的数量
---@return integer
---@param player integer
---@param targets Card|Group
---@param target_player? integer default: player
---@param confirm? boolean default: true
function Duel.SSet(player,targets,target_player,confirm) end

---根据code新建一个衍生物并返回，该衍生物的拥有者为player
---@return Card
---@param player integer
---@param code integer
function Duel.CreateToken(player,code) end

---让玩家 sumplayer 以sumtype方式，pos表示形式把targets特殊召唤到target_player场上[的区域 zone]
---如果nocheck为true则无视卡的召唤条件，如果nolimit为true则无视卡的苏生限制
---返回值是特殊召唤成功的卡的数量
---@return integer
---@param targets Card|Group
---@param sumtype integer
---@param sumplayer integer
---@param target_player integer
---@param nocheck boolean
---@param nolimit boolean
---@param pos integer
---@param zone? integer default: 0xff
function Duel.SpecialSummon(targets,sumtype,sumplayer,target_player,nocheck,nolimit,pos,zone) end

---此函数是Duel.SpecialSummon的分解过程，只特殊召唤一张卡c ，其他参数用法和 Duel.SpecialSummon 一样
---此函数用于一个效果同时特殊召唤多张参数不同的卡
---此函数必须和Duel.SpecialSummonComplete一起使用
---返回值表示是否特殊召唤成功
---@return boolean
---@param c Card
---@param sumtype integer
---@param sumplayer integer
---@param target_player integer
---@param nocheck boolean
---@param nolimit boolean
---@param pos integer
---@param zone? integer default: 0xff
function Duel.SpecialSummonStep(c,sumtype,sumplayer,target_player,nocheck,nolimit,pos,zone) end

---此函数在确定复数个Duel.SpecialSummonStep调用完毕之后调用，用于触发事件
---@return nil|integer
function Duel.SpecialSummonComplete() end

---检查玩家player能否向卡片c添加count个countertype类型的指示物，如果 player 不是 0或者1，则返回false
---@return boolean
---@param player integer
---@param countertype? integer
---@param count? integer
---@param c? Card
function Duel.IsCanAddCounter(player,countertype,count,c) end

---让玩家player以reason为原因移除场上存在的countertype类型的count个指示物，返回值表示是否成功
---s表示对player来说的己方的可移除指示物的位置，o表示对player来说的对方的可移除指示物的位置
---@return boolean
---@param player integer
---@param s integer
---@param o integer
---@param countertype integer
---@param count integer
---@param reason integer
function Duel.RemoveCounter(player,s,o,countertype,count,reason) end

---检查玩家player以reason为原因是否能移除场上的countertype类型的count个指示物
---s表示对player来说的己方的可移除指示物的位置，o表示对player来说的对方的可移除指示物的位置
---@return boolean
---@param player integer
---@param s integer
---@param o integer
---@param countertype integer
---@param count integer
---@param reason integer
function Duel.IsCanRemoveCounter(player,s,o,countertype,count,reason) end

---返回场上存在的countertype类型的指示物的数量
---s表示对player来说的己方的可移除指示物的位置，o表示对player来说的对方的可移除指示物的位置
---@return integer
---@param player integer
---@param s integer
---@param o integer
---@param countertype integer
function Duel.GetCounter(player,s,o,countertype) end

---改变targets的表示形式返回实际操作的数量，若只有2个参数，则不管什么表示形式，都变成 第二个参数 代表的形式
---表侧攻击表示 = au
---里侧攻击表示 = ad
---表侧守备表示 = du
---里侧守备表示 = dd
---如果noflip=true则不触发反转效果（但会触发反转时的诱发效果）
---如果setavailable=true则对象之后变成里侧也发动反转效果
---@return integer
---@param targets Card|Group
---@param au integer
---@param ad? integer default: au
---@param du? integer default: au
---@param dd? integer default: au
---@param noflip? boolean default: false
---@param setavailable? boolean default: false
function Duel.ChangePosition(targets,au,ad,du,dd,noflip,setavailable) end

---以reason原因解放targets ，返回值是实际解放的数量
---如果reason含有REASON_COST，则不会检查卡片是否不受效果影响
---如果设置reason_player，则视为被玩家reason_player移动
---@return integer
---@param targets Card|Group
---@param reason integer
---@param reason_player? integer
function Duel.Release(targets,reason,reason_player) end

---让玩家move_player把c移动的target_player的场上，返回值表示是否成功
---dest只能是LOCATION_MZONE或者LOCATION_SZONE，pos表示可选表示形式， enable 表示是否立刻适用c的效果
---@return boolean
---@param c Card
---@param move_player integer
---@param target_player integer
---@param dest integer
---@param pos integer
---@param enable boolean
---@param zone? integer
function Duel.MoveToField(c,move_player,target_player,dest,pos,enable,zone) end

---把c以表示形式pos返回到场上[的区域 zone]，pos默认值是离场前的表示形式，返回值表示是否成功
---c必须是以REASON_TEMPORARY原因离场，并且离场后没有离开过那个位置
---@return boolean
---@param c Card
---@param pos? integer
---@param zone? integer default: 0xff
function Duel.ReturnToField(c,pos,zone) end

---移动c的序号，通常用于在场上换格子或者在卡组中移动到最上方或者最下方
---@param c Card
---@param seq integer
function Duel.MoveSequence(c,seq) end

---交换c1和c2的位置
---@param c1 Card
---@param c2 Card
function Duel.SwapSequence(c1,c2) end

---发动效果e（？）
---@param e Effect
function Duel.Activate(e) end

---设定连锁条件，f的函数原型为 bool f(e,ep,tp)
---e表示要限制连锁的效果，ep表示要限制连锁的玩家，tp表示发动该效果的玩家
---在cost或者target处理中调用此函数可以限制可以连锁的效果的种类（如超融合）
---如果f返回false表示不能连锁，一旦设置连锁条件后发生了新的连锁那么连锁条件将会解除
---@param f function
function Duel.SetChainLimit(f) end

---功能同Duel.SetChainLimit，但是此函数设定的连锁条件直到连锁结束才会解除
---@param f function
function Duel.SetChainLimitTillChainEnd(f) end

---返回玩家player受到的连锁素材的效果，此函数仅用于融合类卡的效果
---@return Effect|nil
---@param player integer
function Duel.GetChainMaterial(player) end

---确认玩家player卡组最上方count张卡
---@param player integer
---@param count integer
function Duel.ConfirmDecktop(player,count) end

---确认玩家player额外卡组里侧的卡 最上方count张卡
---@param player integer
---@param count integer
function Duel.ConfirmExtratop(player,count) end

---给玩家player确认targets
---@param player integer
---@param targets Card|Group
---@param skip_panel? boolean default: false
function Duel.ConfirmCards(player,targets,skip_panel) end

---让玩家sort_player对玩家target_player的卡组最上方count张卡进行排序，最先选的卡在最上面，然后下面是第二张选择的卡，以此类推
---最多只能排序16张卡
---@param sort_player integer
---@param target_player integer
---@param count integer
function Duel.SortDecktop(sort_player,target_player,count) end

---检查当前是否是event时点
---若get_info=true并且是正确的时点，则还返回触发时点的信息 eg,ep,ev,re,r,rp
---@return boolean
---@return Group 可能为空
---@return integer 可能为空
---@return integer 可能为空 
---@return Effect 可能为空
---@return integer 可能为空
---@return integer 可能为空
---@param event integer
---@param get_info? boolean
function Duel.CheckEvent(event,get_info) end

---以eg,ep,ev,re,r,rp触发一个时点 code
---@param eg Group|Card
---@param code integer
---@param re Effect
---@param r integer
---@param rp integer
---@param ep integer
---@param ev integer
function Duel.RaiseEvent(eg,code,re,r,rp,ep,ev) end

---以eg,ep,ev,re,r,rp为卡片ec触发一个单体时点 code
---@param ec Card
---@param code integer
---@param re Effect
---@param r integer
---@param rp integer
---@param ep integer
---@param ev integer
function Duel.RaiseSingleEvent(ec,code,re,r,rp,ep,ev) end

---检查当前是否是timing提示时点
---@return boolean
---@param timing integer
function Duel.CheckTiming(timing) end

---检查场地卡号是否是code [，来源玩家是否是 player][，生效区域是否在 loc 内]
---场地卡号指当前生效的场地卡的卡号，或者海神的巫女把场地变化效果的值
---来源玩家指当前生效的场地卡的控制者，或者海神的巫女等卡的控制者
---@return boolean
---@param code integer
---@param player? integer default: PLAYER_ALL
---@param loc? integer default: LOCATION_ONFIELD
function Duel.IsEnvironment(code,player,loc) end

---当前效果处理完令player以win_reason决斗胜利
---@param player integer
---@param win_reason integer
function Duel.Win(player,win_reason) end

---让玩家player以原因reason抽count张卡，返回实际抽的卡的数量
---如果reason含有REASON_RULE则此次抽卡不受“不能抽卡”的效果的影响
---@return integer
---@param player integer
---@param count integer
---@param reason integer
function Duel.Draw(player,count,reason) end

---以reason原因给与玩家player造成value的伤害，返回实际收到的伤害值
---如果受到伤害变成回复等效果的影响时，返回值为0.
---is_step为true则是伤害/恢复LP过程的分解，需要调用Duel.RDComplete()触发时点
---@return integer
---@param player integer
---@param value integer
---@param reason integer
---@param is_step? boolean default: false
function Duel.Damage(player,value,reason,is_step) end

---以reason原因使玩家player回复value的LP，返回实际的回复值
---如果受到回复变成伤害等效果的影响时，返回值为0.
---is_step为true则是伤害/恢复LP过程的分解，需要调用Duel.RDComplete()触发时点
---@return integer
---@param player integer
---@param value integer
---@param reason integer
---@param is_step? boolean default: false
function Duel.Recover(player,value,reason,is_step) end

---在调用Duel.Damage/Duel.Recover时，若is_step参数为true，则需调用此函数触发时点
function Duel.RDComplete() end

---把c1作为玩家player的装备卡装备给c2，返回值表示是否成功
---up=false则保持装备卡之前的表示形式
---is_step=true则是装备过程的分解，需要配合Duel.EquipComplete使用
---@return boolean
---@param player integer
---@param c1 Card
---@param c2 Card
---@param up? boolean default: true
---@param is_step? boolean default: false
function Duel.Equip(player,c1,c2,up,is_step) end

---在调用Duel.Equip时，若is_step参数为true，则需调用此函数触发时点
function Duel.EquipComplete() end

---让玩家 player [直到 reset_count 次 reset_phase 时][在区域 zone]
---得到 targets 的控制权，返回值表示是否成功
---@return boolean
---@param targets Card|Group
---@param player integer
---@param reset_phase? integer default: 0
---@param reset_count? integer default: 0
---@param zone? integer default: 0xff
function Duel.GetControl(targets,player,reset_phase,reset_count,zone) end

---交换targets1与targets2的控制权，返回值表示是否成功
---第三个第四个参数同 Duel.GetControl
---@return boolean
---@param targets1 Card|Group
---@param targets2 Card|Group
---@param reset_phase? integer default: 0
---@param reset_count? integer default: 0
function Duel.SwapControl(targets1,targets2,reset_phase,reset_count) end

---检查玩家player是否能支付cost点lp，must_pay表示不能用代替支付的效果
---@return boolean
---@param player integer
---@param cost integer
---@param must_pay? boolean default: false
function Duel.CheckLPCost(player,cost,must_pay) end

---让玩家player支付cost点lp，must_pay表示不能用代替支付的效果
---@param player integer
---@param cost integer
---@param must_pay? boolean default: false
function Duel.PayLPCost(player,cost,must_pay) end

---以原因reason把玩家player的卡组最上端count张卡送去墓地，返回实际转移的数量
---@return integer
---@param player integer
---@param count integer
---@param reason integer
function Duel.DiscardDeck(player,count,reason) end

---过滤函数让玩家player选择并以reason原因丢弃满足筛选条件f兵不等于ex的min-max张手卡
---第7个参数开始为额外参数
---@return integer
---@param player integer
---@param f function|nil
---@param min integer
---@param max integer
---@param reason integer
---@param ex Card|Group|nil
---@param ... any
function Duel.DiscardHand(player,f,min,max,reason,ex,...) end

---使下一个操作不检查是否需要洗切卡组或手卡
---注：如果不调用此函数，
---除了调用Duel.DiscardDeck和Duel.Draw之外从卡组中取出卡或者把卡加入手卡
---或者把卡加入卡组（非最上端或最底端）时，系统会自动在效果处理结束时洗切卡组或手卡
---如果不希望如此，比如从卡组顶端除外一张卡等操作，那么需要调用此函数
---此函数仅保证紧接着的一次操作不会进行洗卡检测
---@param disable? boolean default: true
function Duel.DisableShuffleCheck(disable) end

---关闭卡片的自爆检查。不传参或传true为关闭，传false为启用自爆检查
---@param enabled? boolean default: true
function Duel.DisableSelfDestroyCheck(enabled) end

---启用选择卡组时显示真实序号
---@param enabled? boolean default: true
function Duel.RevealSelectDeckSequence(enabled) end

---手动洗切玩家player的卡组
---注：会重置洗卡检测的状态
---@param player integer
function Duel.ShuffleDeck(player) end

---手动洗切玩家player的额外卡组
---@param player integer
function Duel.ShuffleExtra(player) end

---手动洗切玩家player的手卡
---注：会重置洗卡检测的状态
---@param player integer
function Duel.ShuffleHand(player) end

---洗切覆盖的卡片组 g （实例：魔术礼帽），若g中有表侧表示的卡，则此函数无效
---此函数现在可以洗切魔陷区的覆盖卡
---@param g Group
function Duel.ShuffleSetCard(g) end

---将攻击怪兽变为c
---若 ignore_count=true 则原来的攻击怪兽不视为攻击过
---@param c Card
---@param ignore_count? boolean default: false
function Duel.ChangeAttacker(c,ignore_count) end

---将攻击对象变为c，c为nil表示直接攻击，返回值表示是否成功转移攻击对象
---@return boolean
---@param c Card|nil
function Duel.ChangeAttackTarget(c) end

---令c1与c2进行战斗伤害计算（c1 攻击 c2）
---若 new_attack=true 则视为 攻击的卡进行过攻击宣言（？）
---@param c1 Card
---@param c2 Card
---@param new_attack? boolean default: false
function Duel.CalculateDamage(c1,c2,new_attack) end

---返回玩家player在本次战斗中受到的伤害
---@return integer
---@param player integer
function Duel.GetBattleDamage(player) end

---把玩家player在本次战斗中受到的伤害变成value，若 check=false 则原本战斗伤害就算为0也改变伤害
---@param player integer
---@param value integer
---@param check? boolean default: true
function Duel.ChangeBattleDamage(player,value,check) end

---把连锁chainc的对象换成g
---@param chainc integer
---@param g Group
function Duel.ChangeTargetCard(chainc,g) end

---把连锁chainc的对象玩家换成player
---@param chainc integer
---@param player integer
function Duel.ChangeTargetPlayer(chainc,player) end

---把连锁chainc的参数换成param
---@param chainc integer
---@param param integer
function Duel.ChangeTargetParam(chainc,param) end

---中断当前效果，使之后的效果处理视为不同时处理，此函数会造成错时点
function Duel.BreakEffect() end

---把连锁chainc的效果的处理函数换成f，用于实现“把效果变成”等的效果
---f(e,tp,eg,ep,ev,re,r,rp)
---@param chainc integer
---@param f function
function Duel.ChangeChainOperation(chainc,f) end

---使连锁chainc的发动无效，返回值表示是否成功
---@return boolean
---@param chainc integer
function Duel.NegateActivation(chainc) end

---使连锁chainc的效果无效，返回值表示是否成功
---@return boolean
---@param chainc integer
---@param forced? boolean
function Duel.NegateEffect(chainc,forced) end

---使和卡片c有关的连锁都无效化，发生reset事件则重置,reset 默认包含 RESET_CHAIN
---@param c Card
---@param reset integer
function Duel.NegateRelatedChain(c,reset) end

---使正在召唤·反转召唤·特殊召唤的targets的召唤无效
---@param targets Card|Group
function Duel.NegateSummon(targets) end

---手动增加1次玩家[对于卡片c]的已经通常召唤过的次数
---@param c? Card
function Duel.IncreaseSummonedCount(c) end

---检查回合玩家本回合是否还能通常召唤[卡片c]
---@return boolean
---@param c? Card
function Duel.CheckSummonedCount(c) end

---返回玩家player的场上location可用的[区域 zone 里的]空格数
---location只能是LOCATION_MZONE或者LOCATION_SZONE
---reason为LOCATION_REASON_TOFIELD或LOCATION_REASON_CONTROL
---##第三个第四个额外参数与凯撒斗技场等限制格子的效果有关
---@return integer
---@param player integer
---@param location integer
---@param use_player? integer
---@param reason? integer
---@param zone? integer default: 0xff
function Duel.GetLocationCount(player,location,use_player,reason,zone) end

---返回玩家player场上[targets 离开后]可用的[区域 zone 里的]怪兽区数量
---##第三个第四个额外参数与凯撒斗技场等限制格子的效果有关
---@return integer
---@return integer zone
---@param player integer
---@param targets? Group|Card
---@param use_player? integer
---@param reason? integer
---@param zone? integer default: 0xff
function Duel.GetMZoneCount(player,targets,use_player,reason,zone) end

---返回玩家player场上[targets 离开后]可用的[区域 zone 里的]魔陷区数量（不含场地区域）
---##第三个第四个额外参数与凯撒斗技场等限制格子的效果有关
---@return integer
---@return integer zone
---@param player integer
---@param targets? Group|Card
---@param use_player? integer
---@param reason? integer
---@param zone? integer default: 0xff
function Duel.GetSZoneCount(player,targets,use_player,reason,zone) end

---返回玩家player场上[假如因玩家 reason_player 的原因让 targets 离场后，把卡片 sc 在 zone 区域特殊召唤]可用的 能让额外卡组的怪兽 出场的空格数
---@return integer
---@param player integer
---@param reason_player? integer default: player
---@param targets? Group|Card|nil
---@param sc? Card|integer
---@param zone? integer default: 0xff
function Duel.GetLocationCountFromEx(player,reason_player,targets,sc,zone) end

---返回玩家player场上[对于 use_player 来说]可用的怪兽区数量（？）
---@return integer
---@param player integer
---@param use_player? integer
function Duel.GetUsableMZoneCount(player,use_player) end

---返回以玩家player来看的 s_range 和 o_range 区域的处于连接状态的卡片组[其实只要后面2个参数不为0就行，只要不为0，都会变成LOCATION_MZONE]（？）
---@return Group
---@param player integer
---@param s_range integer
---@param o_range integer
function Duel.GetLinkedGroup(player,s_range,o_range) end

---返回以玩家player来看的 s_range 和 o_range 区域的处于连接状态的卡片的数量（？）
---@return integer
---@param player integer
---@param s_range integer
---@param o_range integer
function Duel.GetLinkedGroupCount(player,s_range,o_range) end

---返回以玩家player来看的所有连接区域
---@return integer
---@param player integer
function Duel.GetLinkedZone(player) end

---返回玩家player的场上位于location序号为seq的卡，常用于获得场地区域·灵摆区域的卡
---注：召唤·反转召唤·特殊召唤 之际 的卡无法获取
---@return Card
---@param player integer
---@param location integer
---@param seq integer
function Duel.GetFieldCard(player,location,seq) end

---检查玩家player的场上位于location序号为seq的空格是否可用
---@return boolean
---@param player integer
---@param location integer
---@param seq integer
function Duel.CheckLocation(player,location,seq) end

---返回当前的连锁个数（即正在处理的连锁序号）
---@return integer
function Duel.GetCurrentChain() end

---返回当前已执行Target函数的连锁个数
---@return integer
function Duel.GetReadyChain() end

---返回连锁chainc的信息，如果chainc=0，则返回当前正在处理的连锁的信息
---此函数根据传入的参数个数按顺序返回相应数量的返回值参数可以是:
---CHAININFO_CHAIN_COUNT               连锁序号
---CHAININFO_TRIGGERING_EFFECT         连锁的效果
---CHAININFO_TRIGGERING_PLAYER         连锁的玩家
---CHAININFO_TRIGGERING_CONTROLER      连锁发生位置所属玩家
---CHAININFO_TRIGGERING_LOCATION       连锁发生位置
---CHAININFO_TRIGGERING_SEQUENCE       连锁发生的位置的序号
---CHAININFO_TARGET_CARDS              连锁的对象卡片组
---CHAININFO_TARGET_PLAYER             连锁的对象玩家
---CHAININFO_TARGET_PARAM              连锁的对象参数
---CHAININFO_DISABLE_REASON            连锁被无效的原因效果
---CHAININFO_DISABLE_PLAYER            连锁被无效的原因玩家
---CHAININFO_CHAIN_ID                  连锁的唯一标识
---CHAININFO_TYPE                      连锁卡片的类型（怪兽·魔法·陷阱）
---CHAININFO_EXTTYPE                   连锁卡片的具体类型（例如同调怪兽·永续魔法·反击陷阱）
---举例：
---Duel.GetChainInfo(0,CHAININFO_TRIGGERING_LOCATION,CHAININFO_TARGET_CARDS)
---将会返回当前连锁发生的位置和对象卡
---@return ...
---@param chainc integer
---@param ... any
function Duel.GetChainInfo(chainc,...) end

---返回连锁 chainc 的相关参数，如果 chainc=0，则返回当前正在处理的连锁的相关参数
---返回6个参数，eg,ep,ev,re,r,rp
---@return Group
---@return integer
---@return integer
---@return Effect
---@return integer
---@return integer
---@param chainc integer
function Duel.GetChainEvent(chainc) end

---返回当前连锁的所有的对象卡，一般只有一个对象时使用
---##多个对象也能使用，剩下的对象依次按顺序返回，但是很容易记错对象的顺序，所以不建议对多个对象使用
---@return Card
---@return ... Card
function Duel.GetFirstTarget() end

---返回当前连锁所有有关联的对象卡
---@return Group
function Duel.GetTargetsRelateToChain() end

---返回当前的阶段是否为phase
---@param phase integer
---@return boolean
function Duel.IsPhase(phase) end

---返回当前的阶段是否为主要阶段
---@return boolean
function Duel.IsMainPhase() end

---返回当前的阶段是否为战斗阶段
---@return boolean
function Duel.IsBattlePhase() end

---返回当前的阶段
---@return integer
function Duel.GetCurrentPhase() end

---跳过玩家player的phase阶段，并在特定的阶段后reset，reset参数和效果相同
---#value只对phase=PHASE_BATTLE才有用，value=1跳过战斗阶段的结束步骤，用于“变成回合结束阶段”等（招财猫王，闪光弹）
---@param player integer
---@param phase integer
---@param reset_flag integer
---@param reset_count integer
---@param value? integer
function Duel.SkipPhase(player,phase,reset_flag,reset_count,value) end

---用于在伤害阶段检查是否已经计算了战斗伤害
---@return boolean
function Duel.IsDamageCalculated() end

---返回此次战斗攻击的卡
---@return Card
function Duel.GetAttacker() end

---返回此次战斗被攻击的卡，如果返回nil表示是直接攻击
---@return Card
function Duel.GetAttackTarget() end

---返回由player操控的正处于战斗中的怪兽。如果没有战斗或没有目标则会返回nil。
---@return Card
---@return Card
---@param player integer
function Duel.GetBattleMonster(player) end

---无效此次攻击，返回值表示是否成功
---此次攻击已经被其他效果无效或导致攻击的卡不能攻击则返回false
---@return boolean
function Duel.NegateAttack() end

---使攻击卡[或卡片c]可以再进行1次攻击（比如 大开辟，破灭的女王）
---@param c? Card
function Duel.ChainAttack(c) end

---刷新场上的卡的信息
---非特定情况或者不清楚原理请勿使用此函数以免形成死循环
function Duel.Readjust() end

---手动刷新场上[受到卡片c影响]的卡的无效状态
---@param c? Card
function Duel.AdjustInstantly(c) end

---立刻刷新场地信息
function Duel.AdjustAll() end

---返回以player来看的指定位置的卡，s代表以player来看的自己的位置，o代表以player来看的对方的位置
---@return Group
---@param player integer
---@param s integer
---@param o integer
function Duel.GetFieldGroup(player,s,o) end

---同 Duel.GetFieldGroup ，只是返回的是卡的数量
---@return integer
---@param player integer
---@param s integer
---@param o integer
function Duel.GetFieldGroupCount(player,s,o) end

---返回玩家player的卡组最上方的count张卡
---@return Group
---@param player integer
---@param count integer
function Duel.GetDecktopGroup(player,count) end

---返回玩家player的额外卡组表侧表示的卡中最上方的count张卡
---@return Group
---@param player integer
---@param count integer
function Duel.GetExtraTopGroup(player,count) end

---过滤函数，返回以player来看的指定位置满足过滤条件f并且不等于ex的卡
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---第6个参数开始为额外参数
---@return Group
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param ex Card|Group|nil
---@param ... any
function Duel.GetMatchingGroup(f,player,s,o,ex,...) end

---过滤函数，返回以player来看的指定位置满足过滤条件f并且不等于ex的卡的数量
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---第6个参数开始为额外参数
---@return integer
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param ex Card|Group|nil
---@param ... any
function Duel.GetMatchingGroupCount(f,player,s,o,ex,...) end

---过滤函数，返回以player来看的指定位置满足过滤条件f并且不等于ex的第一张卡,没有则返回nil
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---第6个参数开始为额外参数
---@return Card
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param ex Card|Group|nil
---@param ... any
function Duel.GetFirstMatchingCard(f,player,s,o,ex,...) end

---过滤函数，检查以player来看的指定位置是否存在至少count张满足过滤条件f并且不等于ex的卡
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---第7个参数开始为额外参数
---@return boolean
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param count integer
---@param ex Card|Group|nil
---@param ... any
function Duel.IsExistingMatchingCard(f,player,s,o,count,ex,...) end

---过滤函数，让玩家sel_player选择以player来看的指定位置满足过滤条件f并且不等于ex的min-max张卡
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---第9个参数开始为额外参数
---@return Group
---@param sel_player integer
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param min integer
---@param max integer
---@param ex Card|Group|nil
---@param ... any
function Duel.SelectMatchingCard(sel_player,f,player,s,o,min,max,ex,...) end

---返回玩家player能以原因reason解放的卡片组， use_hand=true 则包括手卡
---@return Group
---@param player integer
---@param use_hand? boolean default: false
---@param reason? integer default: REASON_COST
function Duel.GetReleaseGroup(player,use_hand,reason) end

---返回玩家player能以原因reason解放的卡片数量， use_hand=true 则包括手卡
---@return integer
---@param player integer
---@param use_hand? boolean default: false
---@param reason? integer default: REASON_COST
function Duel.GetReleaseGroupCount(player,use_hand,reason) end

---检查玩家player场上是否存在至少count张满足过滤条件f并且不等于ex的能以原因REASON_COST解放的卡
---第5个参数开始为额外参数
---@return boolean
---@param player integer
---@param f function|nil
---@param count integer
---@param ex Card|Group|nil
---@param ... any
function Duel.CheckReleaseGroup(player,f,count,ex,...) end

---过滤函数，让玩家sel_player从场上选择min-max张不等于ex的满足条件f的能以原因REASON_COST解放的卡
---第6个参数开始为额外参数
---@return Group
---@param sel_player integer
---@param f function|nil
---@param min integer
---@param max integer
---@param ex Card|Group|nil
---@param ... any
function Duel.SelectReleaseGroup(sel_player,f,min,max,ex,...) end

---检查玩家player场上是否存在至少count张满足过滤条件f并且不等于ex的能以原因reason解放的卡，use_hand则包括手卡
---第5个参数开始为额外参数
---@return boolean
---@param player integer
---@param f function|nil
---@param count integer
---@param reason integer
---@param use_hand boolean
---@param ex Card|Group|nil
---@param ... any
function Duel.CheckReleaseGroupEx(player,f,count,reason,use_hand,ex,...) end

---过滤函数，让玩家player从场上选择min-max张满足过滤条件f并且不等于ex的能以原因reason解放的卡，use_hand则包括手卡
---第6个参数开始为额外参数
---@return Group
---@param player integer
---@param f function|nil
---@param min integer
---@param max integer
---@param reason integer
---@param use_hand boolean
---@param ex Card|Group|nil
---@param ... any
function Duel.SelectReleaseGroupEx(player,f,min,max,reason,use_hand,ex,...) end

---返回场上用于通常召唤c可解放（上级召唤用）的卡片组
---@return Group
---@param c Card
function Duel.GetTributeGroup(c) end

---返回场上[或mg中]用于通常召唤c的祭品数量，ex=true则允许对方场上的怪兽（太阳神之翼神龙-球体形）
---此数量不一定等于Duel.GetTributeGroup的返回值中的卡片数量
---因为某些卡可以作为多个祭品来使用
---@return integer
---@param c Card
---@param mg? Group
---@param ex? boolean default: false
function Duel.GetTributeCount(c,mg,ex) end

---判断场上[或mg中]是否存在用于通常召唤c[到toplayer场上的区域 zone]的min[到max]个祭品
---@return Group
---@param c Card
---@param min integer
---@param max? integer|nil default: min
---@param mg? Group|nil
---@param toplayer? integer|nil default: c:GetControler()
---@param zone? integer|nil default: 0x1f
function Duel.CheckTribute(c,min,max,mg,toplayer,zone) end

---让玩家player从场上[或mg中]选择用于通常召唤c的min-max个祭品，召唤到 toplayer 场上
---@return Group
---@param player integer
---@param c Card
---@param min integer
---@param max integer
---@param mg? Group|nil
---@param toplayer? integer|nil default: c:GetControler()
function Duel.SelectTribute(player,c,min,max,mg,toplayer) end

---基本同Duel.GetMatchingGroupCount ，不同之处在于需要追加判定卡片是否能成为当前正在处理的效果的对象
---@return integer
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param ex Card|Group|nil
---@param ... any
function Duel.GetTargetCount(f,player,s,o,ex,...) end

---基本同Duel.IsExistingMatchingCard ，不同之处在于需要追加判定卡片是否能成为当前正在处理的效果的对象
---@return boolean
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param count integer
---@param ex Card|Group|nil
---@param ... any
function Duel.IsExistingTarget(f,player,s,o,count,ex,...) end

---基本同Duel.SelectMatchingCard ，不同之处在于此函数会同时将当前正在处理的连锁的对象设置成选择的卡
---@return Group
---@param sel_player integer
---@param f function|nil
---@param player integer
---@param s integer
---@param o integer
---@param min integer
---@param max integer
---@param ex Card|Group|nil
---@param ... any
function Duel.SelectTarget(sel_player,f,player,s,o,min,max,ex,...) end

---返回必须作为素材的卡片组
---@return Group
---@param player integer
---@param ecode integer EFFECT_MUST_BE_FMATERIAL等
function Duel.GetMustMaterial(player,ecode) end

---检查卡片组是否满足必须作为素材的条件
---@return boolean
---@param player integer
---@param cards Group|Card
---@param ecode integer EFFECT_MUST_BE_FMATERIAL等
function Duel.CheckMustMaterial(player,cards,ecode) end

---让玩家player从g中选择一组[必须包含gc在内的]融合怪兽c的融合素材
---##根据c的种类为EFFECT_FUSION_MATERIAL的效果的Operation操作
---@return Group
---@param player integer
---@param c Card
---@param g Group|nil 不能为空
---@param gc? Card|nil
---@param chkf? integer default: PLAYER_NONE
---@param not_material? boolean default: false
function Duel.SelectFusionMaterial(player,c,g,gc,chkf,not_material) end

---设置g为需要使用的融合素材
---@param g Group
function Duel.SetFusionMaterial(g) end

---设置g为需要使用的同调素材
---@param g Group
function Duel.SetSynchroMaterial(g) end

---获取玩家可以作为同调素材的卡片组
---@return Group
---@param player integer
function Duel.GetSynchroMaterial(player) end

---让玩家player从场上[或mg中]选择用于同调c需要的[必须包含smat在内（如果有mg~=nil则忽略此参数）]满足条件的一组素材
---f1是 1 只需要满足的过滤条件，f2是 min-max 只需要满足的过滤条件
---f1,f2 之中，至少有一种为调整的条件
---@return Group
---@param player integer
---@param c Card
---@param f1 function|nil
---@param f2 function|nil
---@param min integer
---@param max integer
---@param smat? Card|nil
---@param mg? Group|nil
function Duel.SelectSynchroMaterial(player,c,f1,f2,min,max,smat,mg) end

---检查场上[或mg中]是否存在一组[必须包括smat在内的（如果有mg~=nil则忽略此参数）]满足条件的卡作为同调召唤c的素材
---f1是 1 只需要满足的过滤条件，f2是 min-max 只需要满足的过滤条件
---f1,f2 之中，至少有一种为调整的条件
---@return boolean
---@param c Card
---@param f1 function|nil
---@param f2 function|nil
---@param min integer
---@param max integer
---@param smat? Card|nil
---@param mg? Group|nil
function Duel.CheckSynchroMaterial(c,f1,f2,min,max,smat,mg) end

---让玩家从场上[或mg中]选择用于同调c需要的满足条件的以tuner作为调整的min-max张卡的一组素材
---f1是 1 只需要满足的过滤条件，f2是 min-max 只需要满足的过滤条件
---@return Group
---@param player integer
---@param c Card
---@param tuner Card
---@param f1 function|nil
---@param f2 function|nil
---@param min integer
---@param max integer
---@param mg? Group|nil
function Duel.SelectTunerMaterial(player,c,tuner,f1,f2,min,max,mg) end

---检查场上[或mg中]是否存在一组以tuner作为调整,并且满足条件的卡作为同调召唤c的素材
---f1是 1 只需要满足的过滤条件，f2是 min-max 只需要满足的过滤条件
---@return boolean
---@param c Card
---@param tuner Card
---@param f1 function|nil
---@param f2 function|nil
---@param min integer
---@param max integer
---@param mg? Group|nil
function Duel.CheckTunerMaterial(c,tuner,f1,f2,min,max,mg) end

---返回玩家player可用的用于仪式召唤素材的卡片组
---包含手上，场上可解放的以及墓地的仪式魔人等卡
---@return Group
---@param player integer
function Duel.GetRitualMaterial(player) end

---Duel.GetRitualMaterial并包含无等级怪兽
---@return Group
---@param player integer
function Duel.GetRitualMaterialEx(player) end

---解放仪式用的素材g，如果是墓地的仪式魔人等卡则除外
---@param g Group
function Duel.ReleaseRitualMaterial(g) end

---返回玩家player可用的用于融合召唤素材的卡片组
---@return Group material_all 包含受EFFECT_EXTRA_FUSION_MATERIAL影响的卡
---@return Group material_base 只取那些区域的卡
---@param player integer
---@param location? integer default: LOCATION_HAND + LOCATION_MZONE
function Duel.GetFusionMaterial(player,location) end

---返回当前进行特殊召唤的行为是否可以回滚并撤销。
---@return boolean
function Duel.IsSummonCancelable() end

---设置Duel.CheckWithSum，Group.CheckSubGroup等函数已选择/必须选择的卡片
---@param cards Card|Group
function Duel.SetSelectedCard(cards) end

---清空并返回由Duel.SetSelectedCard设置的卡片或卡片组。
---@return Group
function Duel.GrabSelectedCard() end

---把当前正在处理的连锁的对象设置成targets
---注，这里的对象指的的广义的对象，包括不取对象的效果可能要处理的对象
---@param targets Card|Group
function Duel.SetTargetCard(targets) end

---把当前正在处理的连锁的对象全部清除
function Duel.ClearTargetCard() end

---把当前正在处理的连锁的对象玩家设置成player
---@param player integer
function Duel.SetTargetPlayer(player) end

---把当前正在处理的连锁的对象参数设置成param
---@param param integer
function Duel.SetTargetParam(param) end

---操作信息：效果处理中确定要处理的分类
---比如潜行狙击手需要设置CATEGORY_DICE，但是不能设置CATEGORY_DESTROY，因为不确定
---对于破坏效果，targets需要设置成发动时可能成为连锁的影响对象的卡，
---并设置count为发动时确定的要处理的卡的数量
---比如黑洞发动时，targets需要设定为场上的所有怪兽，count设置成场上的怪的数量
---对于需要移动卡片位置的CATEGORY_SPECIAL_SUMMON,CATEGORY_TOHAND,CATEGORY_TODECK等分类，
---如果要处理的卡是确定的（比如取对象），则设置targets为这些卡，count为数量，
---如果要处理的卡是不确定的（效果处理时才能确定，一般是不取对象的效果），
---则设置targets为nil，count为预计要处理的卡的数量，
---	target_player为预计要处理的卡的持有者（不确定就为0）
---	target_param为预计要处理的卡的位置
---例如增援：SetOperationInfo(0,CATEGORY_TOHAND,nil,1,tp,LOCATION_DECK)
---操作信息用于很多效果的发动的检测，例如星尘龙，王家长眠之谷等

---设置连锁chainc的category分类的操作信息， chainc=0 则是表示当前连锁
---@param chainc integer
---@param category integer
---@param targets Card|Group|nil|0
---@param count integer
---@param target_player integer
---@param target_param integer
function Duel.SetOperationInfo(chainc,category,targets,count,target_player,target_param) end

---返回连锁chainc的category分类的操作信息，存在的话，则返回值为5个， chainc=0 则是表示当前连锁
---第一个返回值是false的话表示不存在该分类
---后4个返回值对应Duel.SetOperationInfo的后4个参数：Card|Group targets, int count, int target_player, int target_param
---@return boolean
---@return Group 可能为空
---@return integer 可能为空
---@return integer 可能为空
---@return integer 可能为空
---@param chainc integer
---@param category integer
function Duel.GetOperationInfo(chainc,category) end

---返回连锁chainc包含的操作分类的数量
---@return integer
---@param chainc integer
function Duel.GetOperationCount(chainc) end

---将chainc的OperationInfo清除。用于如堕天使复制并使用墓地效果之类，卡片效果不应当被响应的情况。
---@param chainc integer
function Duel.ClearOperationInfo(chainc) end

---检查场上[或mg中]是否存在XYZ召唤c的XYZ用等级为lv的min-max个满足条件f的叠放素材
---@return boolean
---@param c Card
---@param f function|nil
---@param lv integer
---@param min integer
---@param max integer
---@param mg Group|nil
function Duel.CheckXyzMaterial(c,f,lv,min,max,mg) end

---让玩家player为XYZ怪兽c从场上[或mg中]选择XYZ用等级为lv的min-max个满足条件f的叠放素材
---@return Group
---@param player integer
---@param c Card
---@param f function|nil
---@param lv integer
---@param min integer
---@param max integer
---@param mg? Group|nil
function Duel.SelectXyzMaterial(player,c,f,lv,min,max,mg) end

---把ocard作为c的叠放卡叠放
---@param c Card
---@param ocard Card|Group
---@param adjust? boolean default: true
function Duel.Overlay(c,ocard,adjust) end

---返回以player来看的指定位置的所有叠放的卡
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---@return Group
---@param player integer
---@param s integer
---@param o integer
function Duel.GetOverlayGroup(player,s,o) end

---返回以player来看的指定位置的所有叠放的卡的数量
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---@return integer
---@param player integer
---@param s integer
---@param o integer
function Duel.GetOverlayCount(player,s,o) end

---检查player能否以原因reason移除以player来看的指定位置至少count张卡
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---@return boolean
---@param player integer
---@param s integer
---@param o integer
---@param count integer
---@param reason integer
function Duel.CheckRemoveOverlayCard(player,s,o,count,reason) end

---让player以reason原因移除以player来看的指定位置的min-max张叠放卡，返回值表示是否成功
---s代表以player来看的自己的位置，o代表以player来看的对方的位置
---@return integer
---@param player integer
---@param s integer
---@param o integer
---@param min integer
---@param max integer
---@param reason integer
function Duel.RemoveOverlayCard(player,s,o,min,max,reason) end

---给玩家player发送hint_type类型的消息提示，提示内容为desc
---@param hint_type integer
---@param player integer
---@param desc integer
function Duel.Hint(hint_type,player,desc) end

---返回上次给玩家player发送的HINT_SELECTMSG类型的提示内容
---@param player integer
---@return integer
function Duel.GetLastSelectHint(player) end

---手动为g显示被选为对象的动画效果
---@param g Group
function Duel.HintSelection(g) end

---让玩家player选择是否发动卡片c的效果[提示文字可以自行用desc替换，desc 用 aux.Stringid 获取]
---@return boolean
---@param player integer
---@param c Card
---@param desc? integer default: 95
function Duel.SelectEffectYesNo(player,c,desc) end

---让玩家player选择是或否
---@return boolean
---@param player integer
---@param desc integer
function Duel.SelectYesNo(player,desc) end

---让玩家选择选项，从第二个参数开始，每一个参数代表一条选项
---返回选择的选项的序号(从0开始)
---@return integer
---@param player integer
---@param desc1 integer
---@param ... any
function Duel.SelectOption(player,desc1,...) end

---此函数只有一个 check_action_permission 操作，不知何用
function Duel.SelectSequence() end

---让玩家player选择c的表示形式并返回
---@return integer
---@param player integer
---@param c Card
---@param pos integer
function Duel.SelectPosition(player,c,pos) end

---让玩家player选择场地。
---@return integer
---@param player integer
---@param count integer
---@param loc1 integer
---@param loc2 integer
---@param zone integer
---@param code? integer
function Duel.SelectField(player,count,loc1,loc2,zone,code) end

---让玩家player选择指定位置满足标记条件filter的count个可用的空格，并返回选择位置的标记
---常用于选择区域不能使用或移动怪兽格子
---##位置标记的定义如下
---##flag = 0;
---##seq为在玩家p，位置l中选择的格子序号
---##for(int32 i = 0; i < count; ++i) {
---##	flag |= 1 << (seq[i] + (p[i] == player ? 0 : 16) + (l[i] == LOCATION_MZONE ? 0 : 8));
---##}
---@return integer
---@param player integer
---@param count integer
---@param s integer
---@param o integer
---@param filter integer
function Duel.SelectDisableField(player,count,s,o,filter) end

---让玩家player从可选的种族中宣言count个种族
---available是所有可选种族的组合值，可以自行组合
---@return integer
---@param player integer
---@param count integer
---@param available integer
function Duel.AnnounceRace(player,count,available) end

---让玩家player从可选的属性中宣言count个属性
---available是所有可选属性的组合值，可以自行组合
---@return integer
---@param player integer
---@param count integer
---@param available integer
function Duel.AnnounceAttribute(player,count,available) end

---让玩家宣言一个[min-max]等级并返回
---@return integer
---@param player integer
---@param min? integer|nil default: 1
---@param max? integer|nil default: 12
---@param ...? integer
function Duel.AnnounceLevel(player,min,max,...) end

---让玩家player宣言一个满足条件的卡片卡号，条件用后缀表达式...表示
---原名AnnounceCardFilter
---@return integer
---@param player integer
---@param ...? integer
function Duel.AnnounceCard(player,...) end

---让玩家player宣言一个卡片类型（怪兽·魔法·陷阱）
---别想着直接宣言 复合类型（永续魔法 等）
---@return integer
---@param player integer
function Duel.AnnounceType(player) end

---让玩家player宣言一个数字
---从第二个参数开始，每一个参数代表一个可宣言的数字
---第一个返回值是宣言的数字，第二个返回值是宣言数字在所有选项中的位置
---@return integer
---@return integer
---@param player integer
---@param number integer
---@param ... any
function Duel.AnnounceNumber(player,number,...) end

---让玩家player宣言硬币的正反面
---@return integer
---@param player integer
function Duel.AnnounceCoin(player) end

---让玩家player投count(<=20)次硬币，返回值为count个结果，0或者1, 正面是 1，反面是0
---若count=-1，投硬币直到出现反面，返回值为投掷次数
---@return ...
---@param player integer
---@param count integer
function Duel.TossCoin(player,count) end

---让玩家player投count1次骰子[，1-player投count2次骰子](count1+count2<=5)
---返回值为count1+count2个结果，1-6
---@return ...
---@param player integer
---@param count1 integer
---@param count2? integer
function Duel.TossDice(player,count1,count2) end

---猜拳，若 repeated=false 则只猜一次；否则就是直到分出胜负为止。返回胜利的玩家号码
---@return integer
---@param repeated? boolean default: true
function Duel.RockPaperScissors(repeated) end

---返回当前投硬币的结果
---@return integer
---@return integer
---@return integer
---@return integer
---@return integer
function Duel.GetCoinResult() end

---返回当前掷骰子的结果
---@return integer
---@return integer
---@return integer
---@return integer
---@return integer
function Duel.GetDiceResult() end

---强行修改投硬币的结果为res ,最多5个参数，res只能是 0 或 1, ，其他全算作 0
---此函数用于永续的EVENT_TOSS_COIN事件中
---@param res integer
---@param ... any
function Duel.SetCoinResult(res,...) end

---强行修改投骰子的结果为res ,最多5个参数，res只能是 1~255, ，其他数字全算作 1
---此函数用于永续的EVENT_TOSS_DICE事件中
---@param res integer
---@param ... any
function Duel.SetDiceResult(res,...) end

---检查player是否受到种类为code的效果影响，如果有就返回该效果，没有则返回nil
---@return Effect|nil
---@return ...
---@param player integer
---@param code integer
function Duel.IsPlayerAffectedByEffect(player,code) end

---检查玩家player是否可以效果抽[count张]卡
---@return boolean
---@param player integer
---@param count? integer default: 0
function Duel.IsPlayerCanDraw(player,count) end

---检查玩家player是否可以把卡组顶端count张卡送去墓地
---@return boolean
---@param player integer
---@param count integer
function Duel.IsPlayerCanDiscardDeck(player,count) end

---检查玩家player是否能作为Cost把count张卡送去墓地。
---@return boolean
---@param player integer
---@param count integer
function Duel.IsPlayerCanDiscardDeckAsCost(player,count) end

---检查玩家player是否可以通常召唤[c，以sumtype方式]
---如果需要可选参数，则必须全部使用
---仅当玩家收到“不能上级召唤”等效果的影响时返回false
---@return boolean
---@param player integer
---@param sumtype? integer
---@param c? Card
function Duel.IsPlayerCanSummon(player,sumtype,c) end

---检查玩家player是否可以[以sumtype的召唤方式将scard]盖放。
---如果要加入后面的可选参数，则所有两个可选参数都必须加上。
---@return boolean
---@param player integer
---@param sumtype? integer
---@param scard? Card
function Duel.IsPlayerCanMSet(player,sumtype,scard) end

---检查玩家player是否可以[将scard]盖放。
---@return boolean
---@param player integer
---@param scard? Card
function Duel.IsPlayerCanSSet(player,scard) end

---检查玩家player能否特殊召唤[c到target_player场上，以sumtype召唤方式，sumpos表示形式]
---如果需要可选参数，则必须全部使用
---@return boolean
---@param player integer
---@param sumtype? integer
---@param sumpos? integer
---@param target_player? integer
---@param c? Card
function Duel.IsPlayerCanSpecialSummon(player,sumtype,sumpos,target_player,c) end

---检查玩家player是否可以反转召唤c
---@return boolean
---@param player integer
---@param c Card
function Duel.IsPlayerCanFlipSummon(player,c) end

---检查玩家player是否可以[以sumtype 方式][以 pos 表示形式]特殊召唤 给定参数的怪兽到target_player场上
---此函数通常用于判定是否可以特招token和陷阱怪兽
---@return boolean
---@param player integer
---@param code integer
---@param setcode? integer|nil
---@param type? integer|nil
---@param atk? integer|nil
---@param def? integer|nil
---@param level? integer|nil
---@param race? integer|nil
---@param attribute? integer|nil
---@param pos? integer default: POS_FACEUP
---@param target_player? integer default: player
---@param sumtype? integer default: 0
---@param zone? integer
function Duel.IsPlayerCanSpecialSummonMonster(player,code,setcode,type,atk,def,level,race,attribute,pos,target_player,sumtype,zone) end

---检查玩家player能否特殊召唤count次
---@return boolean
---@param player integer
---@param count integer
function Duel.IsPlayerCanSpecialSummonCount(player,count) end

---检查玩家player是否能解放[以原因reason解放c]
---@return boolean
---@param player integer
---@param c? Card
---@param reason? integer default: REASON_COST
function Duel.IsPlayerCanRelease(player,c,reason) end

---检查玩家player是否能除外c
---@return boolean
---@param player integer
---@param c? Card
function Duel.IsPlayerCanRemove(player,c) end

---检查玩家是否能把c送去手卡
---@return boolean
---@param player integer
---@param c Card
function Duel.IsPlayerCanSendtoHand(player,c) end

---检查玩家是否能把c送去墓地
---@return boolean
---@param player integer
---@param c? Card
function Duel.IsPlayerCanSendtoGrave(player,c) end

---检查玩家是否能把c送去卡组
---@return boolean
---@param player integer
---@param c Card
function Duel.IsPlayerCanSendtoDeck(player,c) end

---检查玩家player是否有通常召唤外的召唤次数。
---@return boolean
---@param player integer
function Duel.IsPlayerCanAdditionalSummon(player) end

---检查当前是处于连锁处理中，还是不入连锁的效果处理中
---@return boolean
function Duel.IsChainSolving() end

---检查连锁chainc的发动能否被无效
---@return boolean
---@param chainc integer
function Duel.IsChainNegatable(chainc) end

---检查连锁chainc的效果能否被无效
---@return boolean
---@param chainc integer
function Duel.IsChainDisablable(chainc) end

---检查连锁chainc是否已被无效
---@return boolean
---@param chainc integer
function Duel.IsChainDisabled(chainc) end

---检查c是否是连锁chainc的效果的正确的对象
---@return boolean
---@param chainc integer
---@param c Card
function Duel.CheckChainTarget(chainc,c) end

---检查当前连锁中是否存在同名卡的发动，返回true表示无同名卡
---@return boolean
function Duel.CheckChainUniqueness() end

---返回player进行对应的activity_type操作的次数
---@return integer
---@return ...
---@param player integer
---@param activity_type integer
---@param ... any
function Duel.GetActivityCount(player,activity_type,...) end

---检查玩家在当前阶段是否有操作（是否处于阶段开始时，如七皇之剑）
---@return boolean
function Duel.CheckPhaseActivity() end

---设置操作类型为activity_type、代号为counter_id的计数器，放在initial_effect函数内
---f为过滤函数，以Card类型为参数，返回值为false的卡片进行以下类型的操作，计数器增加1（目前最多为1）
---@param counter_id integer
---@param activity_type integer
---@param f function
function Duel.AddCustomActivityCounter(counter_id,activity_type,f) end

---代号为counter_id的计数器的计数，返回player进行以下操作的次数（目前最多为1）
---@return integer
---@param counter_id integer
---@param player integer
---@param activity_type integer
function Duel.GetCustomActivityCount(counter_id,player,activity_type) end

---返回玩家player这回合战斗过的次数
---@return integer
---@param player integer
function Duel.GetBattledCount(player) end

---检查回合玩家能否进入战斗阶段
---@return boolean
function Duel.IsAbleToEnterBP() end

---现世与冥界的逆转专用。把玩家player的卡组和墓地交换
---@param player integer
function Duel.SwapDeckAndGrave(player) end

---救世星龙专用。把c2记述的效果复制给c1
---强制发动的效果可以选择是否发动
---@param c1 Card
---@param c2 Card
function Duel.MajesticCopy(c1,c2) end

---新建一个空效果
---并且效果的Owner为c
---@return Effect
---@param c Card
function Effect.CreateEffect(c) end

---新建一个全局效果
---@return Effect
function Effect.GlobalEffect() end

---新建一个效果e的副本
---@return Effect
---@param e Effect
function Effect.Clone(e) end

---把效果e重置，重置之后不可以再使用此效果
---@param e Effect
function Effect.Reset(e) end

---获取效果e的id
---@return integer
---@param e Effect
function Effect.GetFieldID(e) end

---为效果e设置效果描述
---@param e Effect
---@param desc integer
function Effect.SetDescription(e,desc) end

---为效果e设置Code属性
---@param e Effect
---@param code integer
function Effect.SetCode(e,code) end

---为效果e设置Range属性，即e的生效位置
---@param e Effect
---@param range integer
function Effect.SetRange(e,range) end

---为效果e设置Target Range属性
---	s_range指影响的我方区域
---	o_range值影响的对方区域
---	如果property属性中指定了EFFECT_FLAG_ABSOLUTE_RANGE标志，
---		那么s_range指玩家1受到影响的区域，o_range指玩家2受到影响的区域
---	如果这是一个召唤(覆盖)/限制召唤(覆盖)/特殊召唤手续
---	(EFFECT_SUMMON_PROC/EFFECT_LIMIT_SUMMON_PROC/EFFECT_SPSUMMON_PROC等)的效果，
---		并且property指定了EFFECT_FLAG_SPSUM_PARAM标志，
---		那么s_range表示特殊召唤到的哪个玩家的场地，
---	o_range表示可选择的表示形式
---@param e Effect
---@param s_range integer
---@param o_range integer
function Effect.SetTargetRange(e,s_range,o_range) end

---设置target range属性并设置 EFFECT_FLAG_ABSOLUTE_TARGET 标志
---	playerid != 0 s_range和o_range反转
---@param e Effect
---@param playerid integer
---@param s_range integer
---@param o_range integer
function Effect.SetAbsoluteRange(e,playerid,s_range,o_range) end

---设置一回合可以发动的次数count（仅触发型效果有效），相同的code(不等于0或1时)共用1个次数
---code包含以下数值具有特殊的性质
---EFFECT_COUNT_CODE_OATH          誓约使用次数
---EFFECT_COUNT_CODE_DUEL          决斗中使用次数
---EFFECT_COUNT_CODE_SINGLE        同一张卡多个效果公共使用次数（不限制同名卡）
---@param e Effect
---@param count integer default: 1
---@param code? integer default: 0
function Effect.SetCountLimit(e,count,code) end

---设置reset参数
---@param e Effect
---@param reset_flag integer
---@param reset_count? integer default: 1
function Effect.SetReset(e,reset_flag,reset_count) end

---为效果e设置Type属性
---@param e Effect
---@param type integer
function Effect.SetType(e,type) end

---设置Property属性
---@param e Effect
---@param prop1 integer
---@param prop2? integer
function Effect.SetProperty(e,prop1,prop2) end

---设置Label属性
---@param e Effect
---@param ... integer
function Effect.SetLabel(e,...) end

---设置LabelObject属性
---@param e Effect
---@param labelobject Card|Group|Effect
function Effect.SetLabelObject(e,labelobject) end

---设置Category属性
---@param e Effect
---@param cate integer
function Effect.SetCategory(e,cate) end

---设置提示时点，第二个和第三个参数分别表示 自己 和对方的回合
---@param e Effect
---@param s_time integer
---@param o_time? integer default: s_time
function Effect.SetHintTiming(e,s_time,o_time) end

---设置Condition属性
---@param e Effect
---@param con_func function
function Effect.SetCondition(e,con_func) end

---设置Target属性
---@param e Effect
---@param targ_func function
function Effect.SetTarget(e,targ_func) end

---设置Cost属性
---@param e Effect
---@param cost_func function
function Effect.SetCost(e,cost_func) end

---设置Value属性
---@param e Effect
---@param val function|integer|boolean
function Effect.SetValue(e,val) end

---设置Operation属性
---@param e Effect
---@param op_func nil|function
function Effect.SetOperation(e,op_func) end

---设置OwnerPlayer属性为player
---@param e Effect
---@param player? integer default: 0
function Effect.SetOwnerPlayer(e,player) end

---返回效果描述
---@return integer
---@param e Effect
function Effect.GetDescription(e) end

---返回code属性
---@return integer
---@param e Effect
function Effect.GetCode(e) end

---返回Type属性
---@return integer
---@param e Effect
function Effect.GetType(e) end

---返回Property属性
---@return integer
---@return integer
---@param e Effect
function Effect.GetProperty(e) end

---返回Label属性
---@return ... integer
---@param e Effect
function Effect.GetLabel(e) end

---返回LabelObject属性
---@return Card|Group|Effect
---@param e Effect
function Effect.GetLabelObject(e) end

---返回Category属性
---@return integer
---@param e Effect
function Effect.GetCategory(e) end

---返回Range属性
---@return integer
---@param e Effect
function Effect.GetRange(e) end

---返回Owner属性
---@return Card
---@param e Effect
function Effect.GetOwner(e) end

---返回效果在哪一张卡上生效(通常是用Card.RegisterEffect注册该效果的卡)
---@return Card
---@param e Effect
function Effect.GetHandler(e) end

---返回condition属性
---@return function
---@param e Effect
function Effect.GetCondition(e) end

---返回target属性
---@return function
---@param e Effect
function Effect.GetTarget(e) end

---返回cost属性
---@return function
---@param e Effect
function Effect.GetCost(e) end

---返回value属性
---@return function|integer
---@param e Effect
function Effect.GetValue(e) end

---返回operation属性
---@return function
---@param e Effect
function Effect.GetOperation(e) end

---返回e的效果类型（怪兽·魔法·陷阱）
---与发动该效果的卡的类型不一定相同，比如灵摆效果视为魔法卡的效果
---@return integer
---@param e Effect
function Effect.GetActiveType(e) end

---检查e的效果类型（怪兽·魔法·陷阱）是否有type
---@return boolean
---@param e Effect
---@param type integer
function Effect.IsActiveType(e,type) end

---返回OwnerPlayer属性（发动效果、建立效果的玩家）
---若無OwnerPlayer属性，则是Owner的控制者
---@return integer
---@param e Effect
function Effect.GetOwnerPlayer(e) end

---返回当前玩家，一般是Handler的控制者
---@return integer
---@param e Effect
function Effect.GetHandlerPlayer(e) end

---检查效果是否含有标志prop1[和prop2]
---@return boolean
---@param e Effect
---@param prop1 integer
---@param prop2? integer
function Effect.IsHasProperty(e,prop1,prop2) end

---检查效果是否含有效果分类cate
---@return boolean
---@param e Effect
---@param cate integer
function Effect.IsHasCategory(e,cate) end

---检查效果是否属于类型type
---@return boolean
---@param e Effect
---@param type integer
function Effect.IsHasType(e,type) end

---检查效果是否含有区域range
---@return boolean
---@param e Effect
---@param range integer
function Effect.IsHasRange(e,range) end

---检查效果e能否由player发动
---neglect_loc=true 为不检测发动位置(手卡)， neglect_target=true 为不检测对象要求
---@return boolean
---@param e Effect
---@param player integer
---@param neglect_loc? boolean default: false
---@param neglect_target? boolean default: false
function Effect.IsActivatable(e,player,neglect_loc,neglect_target) end

---检查效果e是否是已发动的效果
---@return boolean
---@param e Effect
function Effect.IsActivated(e) end

---检查效果e是否检查过cost，即是否是被复制的
---@return boolean
---@param e Effect
function Effect.IsCostChecked(e) end

---设置效果e的cost检查标记为b
---@param e Effect
---@param b boolean
function Effect.SetCostCheck(e,b) end

---返回效果e的发动区域
---@return integer
---@param e Effect
function Effect.GetActivateLocation(e) end

---返回效果e的发动区域序号
---@return integer
---@param e Effect
function Effect.GetActivateSequence(e) end

---检测玩家 p 是否还有可以发动的效果 e 的次数
---@return boolean
---@param e Effect
---@param p integer
function Effect.CheckCountLimit(e,p) end

---手动减少玩家 p 对效果 e 的 count 个可用次数[ oath_only 为 该效果是否是 EFFECT_FLAG_OATH]
---@param e Effect
---@param p integer
---@param count? integer default: 1
---@param oath_only? boolean default: false
function Effect.UseCountLimit(e,p,count,oath_only) end

---@class Group
---@operator add(Group|Card): Group

---@class Group
---@operator sub(Group|Card): Group

---新建一个空的卡片组
---@return Group
function Group.CreateGroup() end

---让卡片组持续，把卡片组设置为效果的LabelObject需要设置
---@param g Group
function Group.KeepAlive(g) end

---删除卡片组g
---@param g Group
function Group.DeleteGroup(g) end

---新建卡片组g的副本
---@return Group
---@param g Group
function Group.Clone(g) end

---不定参数，把传入的所有卡组合成一个卡片组并返回，所有参数只能是 Card 类型。
---没有参数时，相当于Group.CreateGroup()
---@return Group
---@param ... Card
function Group.FromCards(...) end

---清空卡片组
---@param g Group
function Group.Clear(g) end

---往g中增加c
---@param g Group
---@param c Card
function Group.AddCard(g,c) end

---把c从g中移除
---@param g Group
---@param c Card
function Group.RemoveCard(g,c) end

---使指针指向下一张卡并返回这张卡，如果不存在则返回nil
---@return Card
---@param g Group
function Group.GetNext(g) end

---返回g中第一张卡，并重置当前指针到g中第一张卡
---如果g中不存在卡则返回nil
---@return Card
---@param g Group
function Group.GetFirst(g) end

---返回g中卡的数量
---@return integer
---@param g Group
function Group.GetCount(g) end

---以g中的每一张卡作为参数调用一次f ,第三个参数开始为额外参数
---@param g Group
---@param f function
---@param ... any
function Group.ForEach(g,f,...) end

---过滤函数，从g中筛选满足筛选条件f并且不等于ex的卡
---从第4个参数开始为额外参数
---@return Group
---@param g Group
---@param f function
---@param ex Card|Group|nil
---@param ... any
function Group.Filter(g,f,ex,...) end

---过滤函数，和Group.Filter基本相同，不同之处在于此函数只返回满足条件的卡的数量
---@return integer
---@param g Group
---@param f function
---@param ex Card|Group|nil
---@param ... any
function Group.FilterCount(g,f,ex,...) end

---过滤函数，让玩家player从g中选择 min-max 张满足筛选条件f并且不等于ex的卡
---从第7个参数开始为额外参数
---@return Group
---@param g Group
---@param player integer
---@param f function
---@param min integer
---@param max integer
---@param ex Card|Group|nil
---@param ... any
function Group.FilterSelect(g,player,f,min,max,ex,...) end

---让玩家player从g中选择min-max张不等于ex的卡
---@return Group
---@param g Group
---@param player integer
---@param min integer
---@param max integer
---@param ex Card|Group|nil
function Group.Select(g,player,min,max,ex) end

---让玩家 player 从 cg 中选择 1 张卡放入 sg ，并返回选的卡。  
---btok 表示是否可以点击完成选择的按钮， cancelable 表示是否可以取消整个选择返回 nil， 
---minc 和 maxc 是客户端的文字缓冲提示，表示需要选择 minc-maxc 张卡，但是这个只是影响视觉效果，并不代表必须要选择那个数量
---@return Card|nil
---@param cg Group
---@param sg Group|nil 已选的卡，可以从中取消选择
---@param player integer
---@param btok boolean default: false
---@param cancelable boolean default: false
---@param minc integer
---@param maxc integer
function Group.SelectUnselect(cg,sg,player,btok,cancelable,minc,maxc) end

---让玩家player从g中随机选择count张卡
---因为是随机选择，所以参数player基本无用，由系统随机选取
---@return Group
---@param g Group
---@param player integer
---@param count integer
function Group.RandomSelect(g,player,count) end

---让玩家player从g中选择min-max张不等于ex的卡，可以取消并返回nil
---@return Group
---@param g Group
---@param player integer
---@param min integer
---@param max integer
---@param ex Card|Group|nil
function Group.CancelableSelect(g,player,min,max,ex) end

---过滤函数，检查g中是否存在至少count张满足筛选条件f并且不等于ex的卡
---从第5个参数开始为额外参数
---@return boolean
---@param g Group
---@param f function
---@param count integer
---@param ex Card|Group|nil
---@param ... any
function Group.IsExists(g,f,count,ex,...) end

---子集求和判定函数，f为返回一个interger值的函数
---检查g中是否存在一个数量为min-max的子集满足以f对子集的每一个元素求值的和等于sum，从第6个参数开始为额外参数
---	比如：g:CheckWithSumEqual(Card.GetSynchroLevel,7,2,99)
---	检查g中是否存在一个子集满足子集的同调用等级之和等于7
---@return boolean
---@param g Group
---@param f function
---@param sum integer
---@param min integer default: 0
---@param max integer
---@param ... any
function Group.CheckWithSumEqual(g,f,sum,min,max,...) end

---让玩家player从g中选取一个数量为min-max的子集使子集的特定函数的和等于sum，从第7个参数开始为额外参数
---@return Group
---@param g Group
---@param player integer
---@param f function
---@param sum integer
---@param min integer
---@param max integer
---@param ... any
function Group.SelectWithSumEqual(g,player,f,sum,min,max,...) end

---子集求和判定函数之二，f为返回一个interger值的函数
---检查g中是否存在一个子集满足以f对子集的每一个元素求值的和刚好大于或者等于sum，从第4个参数开始为额外参数
---比如：g:CheckWithSumGreater(Card.GetRitualLevel,8)
---	检查g中是否存在一个子集满足子集的仪式用等级之和大于等于8
---	注：判定必须是“刚好”大于或者等于
---	以等级为例，要使等级合计大于等于8，可以选择LV1+LV7而不可以选择LV1+LV4+LV4
---@return boolean
---@param g Group
---@param f function
---@param sum integer
---@param ... any
function Group.CheckWithSumGreater(g,f,sum,...) end

---让玩家player从g中选取一个子集使子集的特定函数f的和大于等于sum，从第5个参数开始为额外参数
---@return Group
---@param g Group
---@param player integer
---@param f function
---@param sum integer
---@param ... any
function Group.SelectWithSumGreater(g,player,f,sum,...) end

---f为返回一个interger值的函数，从g中筛选出具有最小的f的值的卡
---第2个返回值为这个最小值，从第3个参数开始为额外参数
---要使用第2个返回值注意检查g非空
---@return Group
---@return integer
---@param g Group
---@param f function
---@param ... any
function Group.GetMinGroup(g,f,...) end

---f为返回一个interger值的函数，从g中筛选出具有最大的f的值的卡
---第2个返回值为这个最大值，从第3个参数开始为额外参数
---要使用第2个返回值注意检查g非空
---@return Group
---@return integer
---@param g Group
---@param f function
---@param ... any
function Group.GetMaxGroup(g,f,...) end

---计算g中所有卡的取值的总和，f为为每张卡的取值函数，从第3个参数开始为额外参数
---@return integer
---@param g Group
---@param f function
---@param ... any
function Group.GetSum(g,f,...) end

---计算g中所有卡的种类数量，f为分类的依据，返回相同的值视为同一种类，从第3个参数开始为额外参数
---比如 g:GetClassCount(Card.GetCode()) 就是计算g中卡名不同的卡的数量
---@return integer
---@param g Group
---@param f function
---@param ... any
function Group.GetClassCount(g,f,...) end

---从g中移除满足筛选条件f并且不等于ex的所有卡，第4个参数开始是额外参数
---@param g Group
---@param f function
---@param ex Card|nil
---@param ... any
function Group.Remove(g,f,ex,...) end

---把g2中的所有卡合并到g1，若g1中原本就有属于g2的卡，那些卡将不会重复
---注：g2本身不会发生变化
---@param g1 Group
---@param g2 Group
function Group.Merge(g1,g2) end

---从g1中移除属于g2中的卡
---注：g2本身不会发生变化
---@param g1 Group
---@param g2 Group
function Group.Sub(g1,g2) end

---判断g1和g2是否相同
---@return boolean
---@param g1 Group
---@param g2 Group
function Group.Equal(g1,g2) end

---检查g中是否存在卡片c
---@return boolean
---@param g Group
---@param c Card
function Group.IsContains(g,c) end

---过滤函数，返回g中满足筛选条件f的第一张卡，若没有则返回nil，从第3个参数开始为额外参数
---@return Card
---@param g Group
---@param f function
---@param ... any
function Group.SearchCard(g,f,...) end

---和 Group.GetClassCount 类似，但是算法不同(使用位运算)
---@return integer
---@param g Group
---@param f function
---@param ... any
function Group.GetBinClassCount(g,f,...) end

---显示消息。
---注意，只会在本地生效，在服务器端不会生效。
---@param msg any
function Debug.Message(msg) end

---添加卡片，将卡号为code的卡片的持有者设置为owner，以表示形式pos放置在player的场上位于location上序号为seq的格子处
---proc=true则完成正规召唤程序(即解除苏生限制)
---@return Card
---@param code integer
---@param owner integer
---@param player integer
---@param location integer
---@param seq integer
---@param pos integer
---@param proc? boolean default: false
function Debug.AddCard(code,owner,player,location,seq,pos,proc) end

---设置玩家信息，基本分为lp，初始手卡为startcount张，每回合抽drawcount张
---在残局当中， playerid ：自己=0,对方=1
---@param playerid integer
---@param lp integer
---@param startcount integer
---@param drawcount integer
function Debug.SetPlayerInfo(playerid,lp,startcount,drawcount) end

---设置卡片c的召唤信息：以 sum_type 方法(通常召唤、特殊召唤等)[从 sum_location]出场
---@param c Card
---@param sum_type integer
---@param sum_location? integer default: 0
function Debug.PreSummon(c,sum_type,sum_location) end

---为target添加装备equip_card ，返回值表示是否成功
---@return boolean
---@param equip_card Card
---@param target Card
function Debug.PreEquip(equip_card,target) end

---把target选为c的永续对象
---@param c Card
---@param target Card
function Debug.PreSetTarget(c,target) end

---为c添加count个counter_type的指示物
---@param c Card
---@param counter_type integer
---@param count? integer default: 0
function Debug.PreAddCounter(c,counter_type,count) end

---以选项flag开始布局
---	flag 残局： DUEL_ATTACK_FIRST_TURN|DUEL_SIMPLE_AI
---		 大师规则1： DUEL_OBSOLETE_RULING
---	rule=5 是大师规则2020
---@param flag integer
---@param rule? integer default: 5
function Debug.ReloadFieldBegin(flag,rule) end

---布局结束
function Debug.ReloadFieldEnd() end

---设置AI的名字，最大长度 100 个字符（1个汉字2个字符）
---@param name string
function Debug.SetAIName(name) end

---显示消息提示框，最大长度 1024 个字符（1个汉字2个字符）
---注意，只会在本地生效，在服务器端不会生效。
---@param msg string
function Debug.ShowHint(msg) end
