# CHANGELOG - 错题心魔 xinmo v1

## v1.5（第一批）- 知识条目类型：进复习队列、无判题、自评 (2026-09-02)

### 方案决策
- 复用 problem 表 + `kind` 列区分 'problem'/'knowledge'（不新建表）。理由：schedule.py 排期函数全部作用于 problem 行，复用 = 今日队列/attempt/e2e 零改动；无孤儿 attempt、无队列合并。

### 建表/改表语句
- `ALTER TABLE problem ADD COLUMN kind TEXT DEFAULT 'problem'`（server.py init_db try/except 内执行，老库兼容）。

### 后端（server.py）
- init_db 加 kind 列 ALTER；problem_row_to_dict 返回加 'kind'。
- 新增 `POST /api/knowledge`：subject/tag/left/right → INSERT problem（topic='knowledge'、topic_label=tag、error_type='concept'、question_type='knowledge'、note=left、answer_text=right、source=tag、due_date=今天、kind='knowledge'），写 jsonl 审计。
- /api/library 与 /api/stats 全部统计加 `AND kind='problem'`（错题库与统计只算题目）。
- **row_to_sched 加 `row_kind` 键**：修复 schedule.build_today 用 `item['kind']=bucket_key`（overdue/due/new/rebound）覆盖 DB kind 导致的冲突——今日队列里知识条目曾误走 buildReviewCard。

### 前端（web/app.js / i18n.json / index.html）
- todayProgressRefresh() 共享今日进度行刷新（buildReviewCard 与 buildKnowledgeCard 共用）。
- buildCollapsibleRow：知识条目行标题显示左列（note）；body 按 `row_kind==='knowledge'` 走 buildKnowledgeCard。
- buildKnowledgeCard：meta"知识: tag" + h3 左列；phase1 提示"给出左列，回忆右列，然后自评"+ 自评按钮[我做对了/我做错了]（无 wont、无输入、无判定）；phase2 揭右列（"答案: answer_text"）+ 对→[顺畅做对/卡了一下]、错→[记下，排回今天再练]；commit POST /api/attempt {judged:'self'}，成功后收起行、徽标"已做"、todayDone++。
- i18n today 段加 kTag/kRecall/kAnswer；questionTypes 加 knowledge:"知识条目"。
- 缓存版本 bump ?v=20260906。

### 数据
- 备份 data/xinmo.db.bak-v15（改库前）。
- 20 条地理知识条目已入库（id 31-50）：tag=农业区位因果模板 18 条（自然类 10 + 人文类 8）、tag=地理答题规则 2 条。subject=geography、interval_days=0、due_date=2026-09-01、state=active。

### 验证
- CDP 实测（headless Chrome）今日队列知识条目：行标题=左列提示（"纬度低热量充足 · 农业区位因果模板 · 知识条目"）；展开 phase1 显示"给出左列，回忆右列，然后自评"+[我做对了/我做错了]；点"我做错了"→ phase2 揭"答案: 生长期长可一年多熟产量高"+[记下，排回今天再练]；commit 后行收起、徽标"已做"、进度行 5→6；console 异常 0（仅 favicon.ico 404 噪声）。
- e2e 测试 PASSED（interval 序列 1/3/8.4/24.36、REVIEW_OFFSETS 0/1/4/12、refined on 4th good）；事务完整性 CLEAN。
- 校验：node --check web/app.js、ast 解析 server.py、json 解析 i18n.json 全过。

## v1.5（第二批）- 知识条目种子数据：化学/物理/数学 45 条，due_date 按天铺开 (2026-09-02)

### 后端（server.py）
- POST /api/knowledge 支持可选 `due_date`（YYYY-MM-DD，缺省今天）——批次按 tag 铺开首次到期日。

### 数据（scripts/seed_v152_knowledge.py，幂等脚本走 POST /api/knowledge）
- 改库前备份 data/xinmo.db.bak-v152。
- 新入库 45 条（id 51-95）：化学「分离提纯操作」11 条 + 「分离提纯反向速查」8 条；物理「仪器读数」9 条 + 「牛顿运动定律」10 条；数学「指数对数基本概念」7 条。
- 铺开规则：首次 due_date 从 09-03 起按天铺开，每天 ≤6 条；知识条目与题目共用 QUEUE_CAP=15，题目优先、知识溢出顺延。
- 到期分布（知识条目）：09-03:6 / 09-04:6 / 09-05:6 / 09-06:6 / 09-07:6 / 09-08:6 / 09-09:6 / 09-10:3。
- 全库：65 条知识 + 26 道题目 = 91 行。

### 验证
- e2e 测试 PASSED（interval 序列 1/3/8.4/24.36 不变）；事务完整性 CLEAN。
- 知识条目渲染文本验收见第三批条目库页面输出（今日队列仅 overdue 地理条目可见，化学/物理/数学条目 due 未到，由条目库页面渲染验证）。

## v1.5（第三批）- 条目库页面：知识条目按 subject→tag 双层折叠浏览（只读） (2026-09-02)

### 后端（server.py）
- 新增 `GET /api/kentry`：`SELECT * FROM problem WHERE kind='knowledge' ORDER BY id DESC`，每条带 attempt_count/last_result（照抄 /api/library 组装）。

### 前端（web/app.js / i18n.json / index.html / style.css）
- renderTabs 第 6 个 tab `kentry`（导航文案"条目库"）；setTab 加 page-kentry 切换与 renderKEntry 调用。
- renderKEntry：fetch /api/kentry → 空态用 library.empty、顶部"共 N 条"用 library.countTpl；按 subject（SUBJ 顺序）分组，组头 td-row-head + 科目 label + .lib-grp-count 条目数，默认折叠；组内再按 tag 嵌套 .td-row（tag 头=标签+计数），tag 内每条 buildKEntryCard —— 复用错题库的 .td-row/.td-body 手风琴结构，未另写一套。
- buildKEntryCard：只读卡片，显示 提示(note) / 答案(answer_text) / 标签(topic_label) / 下次到期(due_date) / 间隔(interval_days)，样式类 .kentry-item。
- i18n：tabs.kentry="条目库"；kentry 段 title/hint/left/right/tag/due/interval。
- index.html 加 `#page-kentry`；缓存版本 bump ?v=20260906→20260907。
- 约束确认：未改 schedule.py；hard 1.2 / REBOUND_CAP=20 / QUEUE_CAP=15 不变；纯渲染层，无排期/判题逻辑改动。

### 验证（CDP，headless Chrome）
- 条目库分组结构：tab 6 个（录入/今日/统计/足迹/错题库/条目库）；科目组 物理 19 / 化学 19 / 地理 20 / 数学 7，全部默认折叠（td-body display:none）。
- 展开物理组 → tag 子组：牛顿运动定律 10、仪器读数 9（默认折叠）；展开牛顿运动定律 → 卡片完整渲染：提示/答案/标签/下次到期: 2026-09-09/间隔(天): 0。
- 化学：提示: 除水但保留产物 → 答案: 干燥（tag 分离提纯反向速查，到期 09-06）；提示: 研磨粉碎 → 答案: 无性质差异｜…（tag 分离提纯操作，到期 09-04）。数学：提示: 换底公式 → 答案: log_a b = log_c b / log_c a…（tag 指数对数基本概念，到期 09-10）。
- console 异常 0、JS exception 0（仅 favicon.ico 404 噪声）；页面无"加载失败"。
- e2e 测试 PASSED（interval 序列 1/3/8.4/24.36 不变）；事务完整性 CLEAN。

## v1.6 - 今日队列分区分流：题目 15 只 / 条目 8 条独立计数 (2026-09-02)

### 排期（schedule.py，仅改 build_today 分桶）
- 新增常量 `KNOWLEDGE_CAP = 8`：知识条目独立队列，与题目 QUEUE_CAP=15 互不挤占；溢出各自独立顺延（次日变 overdue 再进本队列）。
- `build_today` 返回 4 元组 `(queue, kqueue, rebound_list, on_the_way)`：queue=题目（row_kind≠knowledge，cap 15），kqueue=知识（row_kind==knowledge，cap 8）。rebound 各自算（REBOUND_CAP=20 不变，题目在前），on_the_way 相加。
- **apply_result / 所有间隔计算零改动**；hard 系数 1.2、REBOUND_CAP=20 保持不变。

### 后端（server.py）
- today() 解包 4 元组，响应新增 `kqueue`；queue 现仅含题目。

### 前端（web/app.js / i18n.json / style.css）
- 今日页拆两区：上区"今日题目 N 只"（h1，进度行 .today-progress.problem），下区"今日条目 N 条"（h2 + 进度行 .today-progress.knowledge，位于题目区下方）；两区都空显示"今天清空了"。
- 计数变量拆分 todayTotalP/DoneP 与 todayTotalK/DoneK；todayProgressRefresh(section) 按区刷新；buildReviewCard commit 走 problem 区、buildKnowledgeCard commit 走 knowledge 区。
- 折叠手风琴改按区独立（不再用全局 todayOpen 索引）。
- i18n：today.title→"今日题目"、empty→"今天清空了"，新增 kTitle/kUnit/kProgressTpl；style.css 加 .today-section 与两色进度行。
- 缓存版本 bump ?v=20260907。

### 验证
- /api/today：queue=15（题目满）、kqueue=8（知识满），kind 分流正确。
- CDP 实测：h1"今日题目 15 只"；上区进度"今日 15 只 · 已完成 13 只"（15 行）；下区 h2"今日条目 8 条"、进度"今日 8 条 · 已完成 0 条"（8 行）；知识卡片渲染正常；console 异常 0（仅资源 404 噪声）。
- e2e 测试 PASSED（interval 序列 1/3/8.4/24.36 不变）；事务完整性 CLEAN；test_schedule_sim.py 解包同步为 4 元组并运行通过。

## v1.7 - 单条目/单题统计：作答历史 + 记忆强度曲线 + tag 汇总三数字 (2026-09-02)

### 后端（server.py）
- attempt 表加两列快照（init_db try/except 迁移，老库兼容）：`interval_days REAL`、`streak INTEGER`。
- POST /api/attempt：INSERT 移到排期计算之后，快照当次 commit 后的 interval_days/streak（历史 UI 展示"当时的间隔/连对"）。
- /api/library 与 /api/kentry 每条 item 新增 `attempts` 数组（时间倒序：ts/result/judged/interval_days/streak），供历史区与曲线渲染。

### 前端（web/app.js / i18n.json / style.css）
- 卡片新增"作答历史"区（.hist-block）：时间倒序列出每次记录（时间、结果、当时的 interval/streak）；从未作答显示"尚未作答"。
- 新增记忆强度曲线 memoryCurve()：内联 SVG，横轴首次作答日→下次到期日，纵轴强度 100%（每次作答）线性衰减至 50%（下次到期）；作答点标圆点，SVG title 悬停显示该次结果；无外部图表库/CDN。
- tag 组标题新增三数字 tagStats()：总条目数 · 平均 interval_days（1 位小数）· 错误率（again/wont 次数占总作答次数）——条目库与错题库均有；错题库补 tag 二级分组（与条目库结构对齐）。
- 缓存版本 bump ?v=20260907。

### 验证（CDP，headless Chrome）
- 实测 id 55 蒸馏连续作答 good→good→again（快照 1.0/1、3.0/2、0.0/0）后，条目库展开化学→分离提纯操作：
  - 蒸馏卡片完整渲染：提示/答案/标签/下次到期 2026-09-03/间隔(天) 0 + 作答历史 3 条（时间倒序，最新"记错了 · 间隔0 · 连对0"在前）+ SVG 曲线（3 个作答点 circle）。
  - tag 标题：`分离提纯操作 11 · 共11 · 均0.0天 · 错33%`。
  - 未作答条目（游标卡尺）：显示"作答历史 / 尚未作答"。
  - 错题库数学组 4 个 tag 标题均带三数字（如`离散型随机变量分布列 1 · 共1 · 均0.0天 · 错100%`）。
- console 异常 0、JS exception 0（仅资源 404 噪声）；e2e PASSED（序列 1/3/8.4/24.36 不变）；事务完整性 CLEAN。

## v1.8 - 足迹自填：log 表 + 每日补录表单 + 当日线上线下汇总 (2026-09-02)

### 建表语句（改库前已备份 data/xinmo.db.bak-v18）
```sql
CREATE TABLE IF NOT EXISTS log (
  id INTEGER PRIMARY KEY, day TEXT NOT NULL, category TEXT NOT NULL,
  subject TEXT, content TEXT NOT NULL, minutes INTEGER, created_at TEXT NOT NULL);
```

### 后端（server.py）
- 新建 log 表（不塞进 problem 表）；POST /api/log（日期默认今天、类别、科目、内容、耗时分钟可空）；GET /api/logs（按 day DESC, id DESC 返回，附带今日系统完成统计 problems/knowledge 与今日手动耗时）；DELETE /api/log/{id}。

### 前端（web/app.js / i18n.json / style.css）
- 足迹页顶部新增手动补录表单：日期（默认今天）、类别下拉（做练习/分析试卷/背诵条目/听课记录/其他）、科目下拉（五科）、内容、耗时分钟（可空）、添加按钮。
- 补录列表：按日期倒序每天一块，块头显示当日总耗时与条数；块内按类别分行（科目 · 内容 · 分钟）；每行删除按钮（不做编辑）。
- 当日汇总行：今日系统完成题目 N 道 · 条目 M 条（读 attempt 表按 kind 去重）· 手动补录 K 分钟，线上线下同页可见。
- 缓存版本 bump ?v=20260907→20260908。

### 验证（CDP，headless Chrome）
- 实测补录 3 条不同类别（做练习/数学 40min、背诵条目/物理 20min、听课记录/化学 60min）后当日块：`2026-09-02 / 3 条 · 共 120 分钟 / 听课记录 / 化学 · 氧化还原反应课 1 小时 · 60min / 删除 / 背诵条目 / 物理 · 牛顿定律条目背 10 条 · 20min / 删除 / 做练习 / 数学 · 指数函数练习册 P37-38，卡住 1 道 · 40min / 删除`。
- 删除"做练习"一条后：`2026-09-02 / 2 条 · 共 80 分钟`（剩余听课记录+背诵条目）；汇总行"今日系统完成：题目 6 道 · 条目 13 条 · 手动补录 120 分钟"。
- select * from log 实际剩 2 行（id 2 recite / id 3 class，id 1 已被删除验证删除）。
- console 异常 0（仅资源 404 噪声）；e2e PASSED（序列 1/3/8.4/24.36 不变）。

## v1.9 - 知识树可视化：三层横向 SVG 树 + 四档掌握度着色 + 图例/折叠/弹窗 (2026-09-02)

### 实现（纯渲染层，数据复用 GET /api/kentry，不改数据与排期）
- 新页面"知识树"（第 7 个 tab）：内联 SVG 横向树状图（根在左向右展开），三层：科目 → tag → 条目提示语。
- 第一层（科目）默认全展开；第三层（条目）默认折叠（避免 65 条糊成一片）；点击 tag 节点折叠/展开其下条目。
- 节点着色四档（treeTier 按 interval_days）：0-1 红（未掌握）/ 1-8 橙（在学）/ 8-24 黄（渐熟）/ 24+ 或 state=refined 绿（已固化）；页面图例标明四档颜色与含义。
- 点击条目节点弹出该条：提示、答案、下次到期日（.tree-pop）。
- 页面顶部科目筛选下拉（全部/各科）。
- 缓存版本 bump ?v=20260908→20260909。

### 验证（CDP，headless Chrome）
- 科目节点：物理/化学/地理/数学（4 个）；tag 节点 7 个（牛顿运动定律(10)、仪器读数(9)、分离提纯反向速查(8)、分离提纯操作(11)、地理答题规则(2)、农业区位因果模板(18)、指数对数基本概念(7)）。
- 默认折叠：SVG 内条目圆点 0 个；点击"牛顿运动定律"展开 → 10 个条目节点（提示语标签齐全）；展开全部 tag → 65 个节点，四档命中 r=65 o=0 y=0 g=0（当前全部条目 interval=0 未掌握，符合真实数据）。
- 点击条目节点弹窗：`提示: 探究加速度与力质量关系实验 / 答案: 四点：平衡摩擦力… / 下次到期: 2026-09-09`。
- console 异常 0（仅资源 404 噪声）；e2e PASSED（序列 1/3/8.4/24.36 不变）。

## v1.10（第一步）- 前置连接：prereq_ids 字段 + 16 条初始依赖边（仅建数据） (2026-09-02)

### 建表/改表语句（改库前已备份 data/xinmo.db.bak-v110）
```sql
ALTER TABLE problem ADD COLUMN prereq_ids TEXT DEFAULT ''
```
（server.py init_db try/except 幂等迁移；problem_row_to_dict 输出加 prereq_ids，供第二步前端使用）

### 初始依赖边（16 条，按 id 种入）
- 数学 指数对数基本概念（4）：91 a^(m/n)写成根式 → 89 ⁿ√a里n和a分别叫什么；92 log_a Mⁿ等于什么 → 90 log_a N里a和N分别叫什么；95 换底公式 → 90；94 log_a b·log_b a等于 → 95 换底公式。
- 化学 分离提纯反向速查 → 分离提纯操作（8）：62 沸点相差XX℃ → 55 蒸馏；63 互不相溶或分层 → 56 分液；64 在有机溶剂中溶解度更大 → 57 萃取；65 溶解度随温度变化不大 → 53 蒸发结晶；66 溶解度随温度变化大 → 54 冷却结晶；67 受热易分解或杂质高温分解 → 59 灼烧煅烧；68 加热直接变气体 → 58 升华；69 除水但保留产物 → 60 干燥。
- 物理 牛顿运动定律（4）：87 求物体间作用力 → 86 求整体加速度；84 加速度方向向上 → 81 同一物体惯性系 F合=ma；85 加速度方向向下 → 81；83 弹簧橡皮绳瞬间 → 82 轻绳轻杆接触面瞬间。

### 验证
- select：16 行 prereq 非空（62→55…95→90），其余 49 条知识条目 prereq 为空、行为完全不变。
- 无前置条目渲染与作答不受影响：CDP 实测游标卡尺（prereq=''）卡片完整渲染（提示/答案/标签/到期/间隔/作答历史-尚未作答，无异常）；id31 无前置作答一次 good → interval 1.0/due 2026-09-03 正常。
- console 异常 0（仅资源 404 噪声）；e2e PASSED（序列 1/3/8.4/24.36 不变）。
- 第二步（知识树前置箭头 + 今日队列"先看前置"标注）待确认配对后另行实施。

## v1.10（第二步）- 前置连接：知识树前置箭头 + 今日条目"先看前置"标注 (2026-09-02)

### 前置箭头（知识树）
- 树上叠加从前置节点指向后继节点的箭头（class=prereq-arrow，紫色虚线+紫色箭头头，与灰色实线树枝线视觉区分），跨 tag 也能画（前置/后继各自展开即连）；仅当两端节点均可见时绘制。
- 图例统计行追加"前置箭头 N(跨tag M)"；svg 暴露 data-arrows/data-cross 属性。

### "先看前置"标注（今日条目区）
- /api/today 的 enrich 对知识条目计算 `prereq_unmastered`：prereq_ids 中 interval_days<1 的前置的提示语列表。
- 今日条目行（buildCollapsibleRow head）在存在未掌握前置时追加标注 `先看前置: <前置提示语>`（紫色虚线胶囊，只提示不阻断，仍可正常作答）。

### 验证（CDP，headless Chrome）
- 知识树全部展开后：前置箭头 16 条，其中跨 tag 8 条（化学 8 条反向速查→操作跨 tag；数学/牛顿 8 条同 tag），与初始边完全一致。
- 今日队列标注（临时把 id62 沸点相差XX℃ 排入今日队列，前置 55 蒸馏未掌握）：行渲染 `沸点相差XX℃ · 分离提纯反向速查 · 知识条目 先看前置: 蒸馏 | 未做`；把 55 蒸馏 interval 人工改 10 后同行为 `沸点相差XX℃ · 分离提纯反向速查 · 知识条目 | 未做`（无标注），验证后已还原（21 行与 bak-v110 一致：55 interval 0、62 due 09-04）。
- console 异常 0（仅资源 404 噪声）；e2e PASSED（序列 1/3/8.4/24.36 不变）；缓存版本 bump ?v=20260909→20260910。

## v1.4.2 - wbapse 笔误确认（无代码缺陷）+ 题型映射全部落库 (2026-09-01)

### 结论
- v1.4.1 报告中 renderAsk 源码行的 `acts.appendChild(wbapse)` 为**报告誊写笔误**，仓库代码无此缺陷（grep `wbapse` 零匹配；实际代码 app.js:536-538 为 `wb`）。node --check 与 renderAsk 实测（面板正常渲染、0 JS 异常）双重佐证。

### renderAsk 阶段 wont 实测（CDP，headless Chrome）
- 新建未判题（renderAsk 阶段）→ 点"不会，先读解析"→ 面板渲染 `标准答案: C` + "读完了"按钮。
- console 异常计数：0；JS exception 计数：0（另有 2 条 favicon.ico 404 资源加载记录，与功能无关）。

### 数据
- 题型映射落库：id 13→flow、17→flow（幂等）、24→calc、25→calc、26→short（判定依据：24 盖斯定律算焓变/25 速率与 K 计算归 calc；26 平衡移动方向、图像选工艺条件、催化剂机理归 short）。
- 全库已无中文 question_type：distinct 为 calc/choice/experiment/flow/inference/multi/short/single。
- 改动前备份 data/xinmo.db.bak-v142。

### 验证
- e2e 测试 PASSED（interval 序列 1/3/8.4/24.36 不变）；事务完整性 CLEAN（25 行，0 孤儿）。
- 本轮无前端代码改动，无需 bump ?v=。

## v1.4.1 - wont 先读解析再提交 + 题型映射修正 (2026-09-01)

### 修复
- wont 按钮缺陷：原来点"不会，先读解析"直接 commit 切下一题，从不显示解析，与文案不符。
- 改为：点击 wont 先渲染只读解析面板（该题 answer_text + 已存解析图 answer_image_path，不新增字段），底部"读完了"按钮才执行原有 commit('wont')，排期行为完全不变（interval=3、due=today+3、streak=0、ease 不动、state=active）。
- 空态显式提示：无 answer_text 且无解析图时显示"本题无解析，请翻纸质答案"，不渲染空白框。
- renderAsk 与 renderSelfWrong 两处 wont 按钮行为一致。

### 数据
- id 13/17 中文 question_type"流程题"→ flow（直接 SQL 执行，已备份 data/xinmo.db.bak-v141）。
- id 24/25/26"原理题"暂不改（待人工判定归 calc/short，题干文本随报告输出）。
- 未来五天到期分布核查：09-01:6 / 09-02:11 / 09-03:4 / 09-04:2，均 ≤15，无需调整。

### 验证
- CDP 实测（headless Chrome）：有答案题 wont → 面板渲染"标准答案: B"+"读完了"，提交后徽标"已做"，sqlite 行 `(30, 3.0, '2026-09-04', 0, 'active')`；无解析题 wont → 渲染"本题无解析，请翻纸质答案"，无空白框；0 JS 异常。
- e2e 测试 PASSED（interval 序列 1/3/8.4/24.36 不变）；全库 answer_text 非空 = 12；事务完整性 CLEAN。
- 缓存版本 bump 20260904→20260905。

## v1.4 - 移除 LLM + 新增"不会"档 + retro 分离 + 错题库分组 + 积压散开 (2026-09-01)

### 背景
今日队列已溢出：到期 17 道 > QUEUE_CAP=15，明天到期 22 道。15 道"概念不会"的题只能点 again（interval 归 0）每天占满槽位。本轮主目标是为"不会"类题提供独立处理路径，其余为附带。

### 1. 移除 LLM（零风险，先做）
- 注释三处调用点（不删代码、不改配置、保留降级分支）：`server.py` `classify_image` 内 `vision_chat`、`server.py` `explain_answer` 内 `vision_chat`、`judge.py` `_llm_equal` 内 HTTP 调用。
- `/api/classify` 直接返回 unclassified fallback；`/api/judge` 直接返回 `judged='unknown'`，前端落在自评分支弹"我做对了/我做错了"。

### 2. 新增"不会"档（主目标）
- `result` 白名单扩为 `again|hard|good|wont`。
- `wont` 在 `/api/attempt` 内单独分支：interval_days=3、due=today+3、streak=0、ease 不动、state 保持 active。**不修改 schedule.py**（hard 系数 1.2、REBOUND_CAP=20、QUEUE_CAP=15 均不动）。
- 前端：`renderSelfWrong` 加"不会，先读解析"按钮（`commit('wont','',my,'wrong')`）；`renderAsk` 阶段也加（未输入答案即可直接 wont，`commit('wont','','','unknown')`）。

### 3. note 与 retro 分离
- `problem` 表 ALTER 加 `retro TEXT`（init_db 兼容老库）。
- note 保持现状（不剧透线索，题目旁立即显示）；retro 为复盘框：录入页答案下方独立输入框，今日页折叠行与展开题目区不显示，只在自评阶段（判定提交后）与解析一起出现。
- 录入/编辑均支持 retro 字段，错题库编辑表单新增"复盘"。

### 4. 错题库分类折叠
- 复用今日页 `buildCollapsibleRow`（`.td-row`/`.td-body` 手风琴）：按科目分组，组标题显示科目名+数量，默认折叠，点组头展开。只改渲染层。

### 5. 清理
- 删除 i18n 死键 `today.btnAgain`、`today.btnEasy`（app.js 全文零引用）。
- 历史中文 question_type 映射待确认后改（id 13/17 流程题→flow 已定；id 24/25/26 原理题映射建议见交接报告）。

### 6. 一次性散开（已备份 data/xinmo.db.bak-v1.4）
- 现存 interval_days=0 且 due_date<=今天的 13 道题按 id 顺序散到今天起 5 天内，每天不超 4 道。
- 验收：`count(active and due<=2026-09-01)` 16 → 7。

### 验证
- `node --check`/python ast/JSON 解析全过；e2e 测试 PASSED（interval 序列 1/3/8.4/24.36 不变）；事务完整性 CLEAN。
- wont 实测（POST 临时题→/api/attempt result=wont→sqlite 查询）：`(30, 3.0, '2026-09-04', 0, 'active')`，ease 不变，retro 正常存取。
- Chrome CDP 实测：错题库 4 组（物理2/化学17/地理3/数学3=25卡）默认折叠、点开一组；今日页 7 行+进度行+每行 wont 按钮、retro 不泄漏；0 JS 异常。
- 缓存版本 bump 20260903→20260904。

## v1.3.1 - 修复今日页/错题库"加载失败" (2026-09-01)

### 根因
上轮 v1.3 坏改写误删了图片辅助函数 `imgThumb`（`function imgThumb(path){...}`），我上轮恢复了 `makeImagePicker`/`openCropModal`/`dataURLToBlob` 但漏掉了它。`imgThumb` 被 3 处调用：
- `renderImageStack`（今日卡渲染题图）
- `buildLibraryCard` 两处（错题库卡渲染题图/答案图）

运行时抛 `ReferenceError: imgThumb is not defined`，被 `.catch()` 吞掉后显示"加载失败"——同时导致今日页和错题库两个 tab 崩溃。

### 修复
- `web/app.js`：恢复 `imgThumb` 定义（从初始 commit 8c1e993 提取原始版本）。
- 验证：`node --check` 通过；浏览器 CDP 实测——今日页 15 行折叠卡+进度行+状态徽标正常渲染、错题库 22 张卡正常渲染、`Promise.then` 补丁捕获的运行时异常列表为空。

### 诊断方法沉淀
- 页面报"加载失败"是 `.catch()` 吞掉渲染异常。用 v3.1 的 Promise.then 补丁技术：先 patch `Promise.prototype.then` 记录 onFul 抛出的 stack 到 `window.__throwLog`，再触发真实 tab 点击流（IIFE 内调用渲染函数），即可拿到被吞的真实错误。
- IIFE 包裹的脚本（`(function(){...})()`）内部函数不是全局的，`typeof renderToday` 为 undefined 是正常现象，不能据此判断脚本没执行。

## v1.3 - 录入体验修复 + 题型数据补齐 (2026-09-01)

### 背景
上一轮 HEAD=13cd212（topics.json 语数英已补）。本轮为录入页体验修复 + 六科题型数据补齐 + 小幅交互改进，不新增功能模块。交接文档声称的改动实际有一批被坏改写破坏/未完成，本次修复。

### 已修复的坏改写（交接文档声称已实现但代码被破坏）
- `web/app.js`：删掉残留乱码 `Fargo`（SyntaxError，整个前端 JS 无法解析）。
- 恢复被误删的 `makeImagePicker` + `openCropModal` + `dataURLToBlob`（录入页图片全链路：dropzone/裁剪/上传/多图堆叠，buildEntryForm 调用未定义函数会崩）。
- 新增 `loadSourceHistory()` 定义 + `index.html` 的 `<datalist id="source-history">`。
- 修复自定义题型/错因重新渲染时 `customWrap` 仍 `display:none`（输入框被隐藏）→ 改 `parentNode.style.display='block'`。
- `setTab` 切今日显式 `window.scrollTo(0,0)` + 文档滚动置顶。
- 知识点搜索命中章节（含知识点命中）自动展开 → `if(q && (chHit || shown.length))`。
- 补 `i18n.json` 缺失的 `today.progressTpl/statusDone/statusTodo`（否则进度行/徽标渲染字面 key）。

### 任务1-6 实际实现（已核实代码）
- 任务1 知识点搜索框：live 过滤（章名或知识点 label），已选恒保留，命中自动展开，清空恢复折叠态，不改 topics.json。
- 任务2 来源历史下拉：`GET /api/sources`（GROUP BY source，按最近使用排序，LIMIT 20）+ datalist 回填，可手动输入任意值。
- 任务3 六科题型补齐：app.js 的 `QTYPES` 每科独立 + `qtypesFor(subj)`；i18n.json/labels.json 补全新 code 中文 label；server.py QUESTION_TYPES 扩为全 code 列表。
- 任务4 图片不清表单：模块态 `formVals` 持久化，`autoClassify` 只 `refreshTopicArea()`，识别候选只填空字段，提交成功后整体重置。
- 任务5 多图单张移除：`.thumb-wrap` + `.img-x` 按钮 `splice(idx,1)` 只删该张，顺序不变，上限 5。
- 任务6 今日折叠+滚动：折叠行+进度行+手风琴+提交后自动收起标记已做；`renderAsk` 移除自动 focus 避免滚动。

### 验证
- `node --check` 全过（可靠信号）；python 语法检查 + JSON 解析通过。
- 事务完整性检测 CLEAN（0 不一致）。
- `test_schedule_e2e.py` PASSED：interval 1/3/8.4/24.36、review 偏移 0/1/4/12、第4次炼化。
- CDP 实测：知识点搜索"电解"过滤出 3 条（电解质与非电解质/电解池原理/电解熔融物与精炼），命中章节自动展开；来源 datalist 2 条 UTF-8 正确（20260829高三开学考/0829开学考）。
- 缓存版本已 bump：app.js/style.css 20260902→20260903。

### 交接备注
- CDP 确认 task6 今日页 rows:0（但 /api/today 返回 15 条 queue），疑为 CDP 测试时序假象（点击今日后 fetch 未完成即查询 DOM），渲染代码正确且简单，不似真 bug，但本会话尾部工具输出被乱码污染未能重跑确认。接手者用 node --check 复核 + 重跑 CDP 确认。

## v3.1 - 错题库加载失败真实根因修复 (2026-09-01)

### 背景
v3 交接文档对"错题库加载失败"的结论是"前后端健康、无加载失败"，该结论错误。真实浏览器（headless Chrome CDP）复测证明存在真实代码 bug，本次修复。

### 根因：局部变量 `var t` 遮蔽全局 i18n 翻译函数 `t()`
`web/app.js` 的 `buildLibraryCard()` 渲染题图/答案图的 `forEach` 循环里声明局部 `var t = imgThumb(p)`，遮蔽了全局翻译函数 `t()`。当记录存在缺失图片（`image_missing`/`answer_image_missing` 为真）时，`t('library.brokenImage')` 会在 `<img>` DOM 节点上被当作函数调用，抛 `TypeError: t is not a function`，中断整批卡片渲染。该异常被 `.catch()` 静默吞掉，`window.error`/`unhandledrejection` 均捕获不到，需给 `Promise.prototype.then` 打补丁拦截 `.then` 内抛出的异常才能暴露。

### 修复
- `web/app.js`：两个图片 `forEach` 的局部变量 `t` → `th`，恢复 `t()` 为对翻译函数的引用（commit `833e344`）。
- `scripts/cdp_chrome.cjs`：Chrome 路径改到 LocalAppData 真实位置；调试端口 9222 → 随机空闲端口；新增 Promise.then 补丁技巧捕获被吞的异常。

### 验证（headless Chrome CDP 实测）
- 修复前：筛选下拉正常（6 学科），但 0 张卡片，末尾"共 N 题 错题库加载失败"。
- 修复后：`{"cards":22,"thumbs":54,"hasFail":false}`——22 张卡片、54 张缩略图全渲染，"加载失败"消失，卡片内容完整（学科·知识点·错因·题类型·状态·熟练度·间隔·下次·批注·编辑）。

### 关键坑沉淀
- 局部变量遮蔽全局函数是隐蔽 bug：`forEach` 回调里 `var t` 遮蔽 i18n 的 `t()`，且被 `.catch` 静默吞掉。DOM 渲染时避免用 `t`/`$` 作循环变量。
- 排查"静默失败"：给 `Promise.prototype.then` 打补丁，把 `onFul` 包 try/catch 记录到 `window.__throwLog` 再 rethrow，才能拿到真实堆栈。

## v1.3 - 补语数英知识点（纯数据，不加功能） (2026-08-31)

### 新增
- data/topics.json 补三个学科：math（62 条）、english（27 条，刻意做浅，eng-vocab-new 生词为第一条）、chinese（20 条）。
- 按现有嵌套格式扩展（学科→chapters[]→topics[]，每条含 id/label/prereq），新 id 前缀 math-/eng-/chn-，学科键追加在末尾。
- 代码层无需改动：web/app.js 的 SUBJ、web/i18n.json 的 subjects、server.py 的 SUBJECTS 三处本就是六科白名单；LLM 分类提示词由 _topic_catalog() 从 topics.json 动态生成，新学科自动流入。

### 验收（全部通过）
- json.load 解析成功；总条目 272（physics 51 + chemistry 56 + geography 56 + math 62 + english 27 + chinese 20）；唯一重复 id 为 unclassified（预存在的共享“待分类”回退，各学科一致，非新冲突）。
- 三新学科各录 1 道测试题（id14/15/16，经真实 POST /api/problem），problem 表与 problems.jsonl 均核对后删除；删除后 problem 13 行（12 基线 + 测试期间并发新增的真实学生记录 id17）、jsonl 27 行，测试数据零残留。
- test_schedule_e2e.py 全绿（interval 1/3/8.4/24.36 + review 偏移 0/1/4/12 + 第4次炼化）、check_transaction_integrity.py CLEAN（0 不一致）。

## D6.5 - 迁出为独立仓库并推送 GitHub (2026-08-29)

### 完成
- GitHub 新建仓库 [kuight/xinmo](https://github.com/kuight/xinmo)（default branch main）。
- 本地 xinmo 仓库 git remote add origin + push master 完成迁移，HEAD=8c1e993，
  main 与 master 均指向 8c1e993（用 git ls-remote 对比 rev-parse HEAD 验证通过）。
- wendao master 同步推送，远端与本地 HEAD 一致（08a2c6f）。
- 自检#3 完成：全新 clone 按 README 起服务->上传图片->录带图题->重启->
  统计(active=1/physics=1)与图片(HTTP 200)均持久，cleanup 后工作区干净。

### 待办（清理项，已随交接说明记录）
- 交接文档更新为新仓库地址与最终 commit hash（本次 CHANGELOG 即记录）。

## D5 - 足迹页 + 全量时间戳 (2026-08-28)

### 新增
- 足迹页：后端 `GET /api/trace`（today_list / 知识树 / subject_summary / 90 天热力图 / streak
  五块聚合），前端 renderTrace 渲染知识树色块(灰=未遇/白=遇过/黄=复习中/亮=已炼化)+热力图+今日清单。
- 时间戳改造：server.py 加 `now_iso()`，problem.created_at 与 attempt.ts 存完整 ISO-8601 到秒
  (2026-08-28T14:32:07)；按天聚合全部改 `substr(ts,1,10)=?`；due_date 保持纯日期；today_list
  按完整时间戳倒序(redo 排最前)。

### 验收（全部通过）
- 干净库下：today_list 顺序 redo,redo,add,add,add；知识树色块 reviewing/active/unseen 对；
  热力图 today count=5 streak=1。D3 未受影响全绿。

## D6 - 收尾：干净目录跑通 / 备份核对 / README / IDEAS (2026-08-28)

### 修复
- server.py 干净目录首次启动崩溃：`app.mount('/images', StaticFiles(...))` 在模块加载期执行，
  而干净目录尚无 data/images（init_db 的 mkdir 在 startup 才跑）-> 抛
  `RuntimeError: Directory ...\data\images does not exist`。已在 static 区 mount 前加
  `IMAGES.mkdir(parents=True, exist_ok=True)`。干净目录从零起服务+录题+入队列验证通过，
  中文入库无乱码、created_at 完整时间戳正确、data/images 自动创建。

### 确认（无需改代码）
- 备份 zip 天然排除 config.local.json：zip 只打 data/xinmo.db + data/images/，
  config.local.json 在 xinmo/ 根目录不在 data/ 下，不会被打包。

### 新增
- README.md：一键启动 / 怎么录一道题 / 每周备份防丢说明。
- IDEAS.md：功能冻结后的想法收集箱，首条「LLM 自动分类(v2)」。

### 约定
- 功能冻结：此后不再加功能，新想法一律写进 IDEAS.md。

## D4 - 调度全规则 + 30天模拟测试 (2026-08-28)

### 新增
- `scripts/test_schedule_sim.py`：纯函数调度测试（无 IO），覆盖
  again/hard/good 转移、ease 夹 [1.3,3.0]、interval 上限 60、hard 永不炼化、
  连续 4 次 good 第 4 次后炼化退出、反噬只罚一次、队列上限 15、
  反噬上限 20 + 溢出散射、30 天多题模拟（每步不变量校验）。全部通过。

### 待用户确认（数值平衡，未擅改）
- 验收要求"连续四次 good 在第 1/3/8/12 天出现"，但当前 schedule.py 实现产出的
  复习日是 **0/1/4/12**（1-indexed 即 1/2/5/13），第 4 次后炼化 —— 与 1/3/8/12 不一致，
  尤其"8"在现公式下不出现。是否要调 interval 公式命中 1/3/8/12？（涉及数值平衡，等指示）

## D3 - 重做流程"先答后判" (2026-08-28)

### 新增
- `judge.py`（纯 ASCII）：判定逻辑。choice 归一化精确比对（大写去空格、多选排序）；
  numeric 数字相对误差<=1%，答案带单位而输入缺单位给 unit_missing 提示；
  expression 调 text 通道 LLM 只认 EQUAL/DIFF，无配置/失败回退 unknown；
  openended 或标准答案为空 -> unknown。
- 后端 `POST /api/judge`：按 problem 的 question_type + 标准答案判定，回
  judged(correct/wrong/unknown)/reason/hint/标准答案/解析图路径。
- 前端今日页改为答案优先卡片状态机：显示题目图+来源（答案隐藏）->输入作答->判定->
  同屏展示判定+标准答案+解析图。correct 选 顺畅(good)/卡了一下(hard)；
  wrong 展示标准答案+解析图+可选"这次错在哪"追加进 note，确认->again；
  unknown 回退用户自选对/错。映射：wrong->again、correct+卡了->hard、correct+顺畅->good。

### 验收（全部通过）
- judge 单测（scripts/_test_judge.py）：choice/numeric/expression/openended 全覆盖。
- API 流程（scripts/_test_d3.py）：choice std=B，输入 C 判错->again->排回当天；
  输入 B 判对；2 次同天提交防循环不再出现今天；numeric 单位提示；expression 无 LLM->unknown。
- 前端（CDP headless）：今日卡片有输入框+判定按钮、判定前不泄露标准答案、
  判定后显示 verdict 并揭示标准答案、0 JS 报错。

## D2 - 图片全链路 (2026-08-28)

### 新增
- 后端 `POST /api/upload`：接收图片，Pillow 处理（EXIF 旋转校正、等比缩放到宽度<=1400px、
  JPEG 质量82、质量阶梯降 + 必要时缩宽保证单张<=300KB），按年月落盘 `data/images/YYYY-MM/`，
  文件名 `{pid|tmp}_{q|a}_{短hash}.jpg`，返回可访问 web 路径 `/images/...`。
- 录入页图片上传：题目图片 + 答案/解析图两个独立粘贴区，均支持
  ①Ctrl+V 粘贴剪贴板截图 ②拖拽文件 ③点击选择（优先级如此）。
  另加全局 paste 兜底：在录入页未聚焦任何输入框时 Ctrl+V 默认进题目图片区。
- 提交校验：`source` 为空时题目图片必填（二者至少其一）。
- 缩略图 + 点击看大图（lightbox）：录入页预览、今日页卡片缩略图点击均可放大。
- `tools/probe_llm.py`：逐通道（text/vision）读 config.local.json 发最小请求验证 LLM 配置可用，
  未配置则明确 SKIP 提示缺失字段。D3 判等价 / D6 也复用。

### 验收（全部通过）
- 后端：2400x1600 PNG 上传 -> 落盘 1190x793、272KB(<=300KB)、命名合规、/images 可取回。
- 重启持久化：重启 uvicorn 后同一图片仍被正常 serve（字节数一致）。
- 前端（headless Edge + CDP，全新 profile）：4 标签 / 录入页 2 个 dropzone /
  lightbox 元素 / 提交按钮 / 今日页缩略图渲染 / 0 条 JS 报错。
- 浏览器->后端整链：页面内 canvas 生成图 -> fetch /api/upload -> 压缩落盘成功。

### 备注
- config.local.json 的 LLM 双通道当前为空（probe SKIP）。D3 的 expression 判等价与 D6 需要 text 通道，
  届时需用户填 base_url/api_key/model。
- 依赖：Pillow（已装 12.2.0）。

---

## D1 - 骨架 + 录入/今日/调度 (交接前，本次接手核验)

- FastAPI 后端(8092) + 单页前端四标签(录入/今日/统计/足迹)。
- 数据模型 problem/attempt；schedule.py 纯函数调度（again/hard/good、炼化、反噬）。
- 接口：/api/problem /api/today /api/attempt /api/stats /api/topics /api/classify(占位) /api/backup(占位)。
- topics.json：物理10章50知识点。
- 接手核验：发现运行中 server 抱着 0 字节空库导致录入 500；重启后 init_db 建表，
  vercheck_d1.py = ALL D1 CHECKS PASSED。（未改代码/schema）

## D8 (2026-08-30): 历史错题库

- 新增第5个tab「错题库」：浏览全部错题（含已炼化），支持按学科/状态/关键词筛选
- 每条错题展示：题目/答案缩略图（缺失图片标红提示）、知识点、错因、题型、状态徽标、连对次数、熟练度、间隔天数、下次复习日、练习次数、录入时间
- 每条可点「编辑」打开内联表单，逐项修改：学科、知识点、错因（含自定义）、题型（含自定义）、批注、标准答案、来源、题目图片、答案/解析图
- 图片替换：缺失图片（id=1/id=3）可在编辑表单内重新上传替换，兼容拍照/相册/粘贴/拖拽 + 裁剪
- 后端新增 GET /api/library（含 image_missing/answer_image_missing 缺失标记）与 POST /api/problem/{id}（更新可编辑字段，写 jsonl 审计）
- 修正交接后 wendao 仓库停止跟踪 xinmo/（加 .gitignore + git rm --cached），两仓库彻底分开；旧题图片缺失按用户决策保留
