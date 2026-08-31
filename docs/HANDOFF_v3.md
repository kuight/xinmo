# xinmo（错题心魔）交接文档 v3

写于 2026-08-31。接手新 agent 零上下文可直接接手。所有数据均来自实测，非估算。承接 v2 文档，重点记录本轮 v1.2 四项新功能 + 交接复核。

## 一、项目一句话
高三学生错题复习工具：录错题 → 按遗忘曲线排重做 → 一眼看到积累。纯本地 FastAPI+SQLite+原生 JS，不联网不判分（判题靠用户自评或外部 LLM）。功能已冻结，新想法只写 IDEAS.md。

## 二、物理位置与运行
- 仓库根：E:\work\wendao\wendao-main（git master）
- 项目目录：E:\work\wendao\wendao-main\xinmo\（已迁出为独立 GitHub 仓库 kuight/xinmo，main+master 均指向当前 HEAD）
- wendao 仓库：kuight/wendao，master 已停止跟踪 xinmo/（.gitignore 加 xinmo/ + git rm --cached），两仓库彻底分开
- 运行：cd xinmo && python -m uvicorn server:app --host 0.0.0.0 --port 8092，浏览器 http://127.0.0.1:8092
- Python：C:\Users\Administrator\AppData\Local\Programs\Python\Python310\python.exe
- 依赖：fastapi / uvicorn / pillow
- 手机访问：http://192.168.110.76:8092（以太网 IPv4，防火墙已放行）

## 三、知识库（最重要的交接资产）
接手后先读 xinmo\_knowledge\README.md，内有全套索引。四个文件纯文本已去敏已提交：
- _knowledge\xinmo-memory.md — 项目全部记忆（含 D8 修复根因、调度 bug 记录）
- _knowledge\v5-memory.md — 问道修仙学院（v5 游戏）记忆
- _knowledge\lessons-and-config.md — 跨项目教训 + 关键配置（LLM 通道、运行生效规则、编码、git、CDP 验证）

敏感值只在 config.local.json（gitignored）和两仓库 .git/config。

## 四、当前 git 状态（2026-08-31 实测）
- xinmo HEAD = 3d1e7e2，branch=master，工作树干净（仅 temp 测试脚本已清）
- origin master = origin main = 3d1e7e2（已同步，无未推 commit）
- 关键 commit：ff9d97e(调度floor修复+id2修正+e2e测试) a5f86d0(知识库更新) c162fc8(gitignore防密钥备份泄露) b2ab62e(事务完整性检测器) 3d1e7e2(v1.2四功能)

## 五、v1.2 四项新功能（本轮交付，全部真机验证通过）
### 1. 多图录入（Task 1）
- 一道题最多 5 张图；存储沿用 image_path/answer_image_path 两列，多值以分号 ";" 分隔存同一列（不新增列、不改字段类型、不写迁移脚本）。旧单值记录 split(';') 后天然长度为 1 的数组，兼容在读取层完成，未改写历史数据。
- 上传：file input 加 multiple，移除了 capture 属性（它会堵死相册）；选中多张逐张进裁剪，每张独立压缩（后端 _compress_to_jpeg 宽1400/质量82/单张≤300KB）。
- 展示：录入预览、重做页、错题库三处都能看全部图，手机端纵向堆叠（renderImageStack 用 splitMulti 拆分后逐个 appendChild imgThumb），点单张可放大。
- 流水：problems.jsonl 的图片字段为分号分隔多值，其余字段名称和顺序一字未动。

### 2. 多知识点标签（Task 2）
- 一道题最多 3 个标签；LLM 自动分类返回三个候选，改成可多选（手动点选与候选chips都可 toggle），全部可跳过（失败降级为"待分类"不变）。
- 存储：problem 表单列 topic/topic_label 改分号分隔多值存同一列（不建关联表不写迁移），Python 层 split 后聚合，无 join。
- 连带影响（任务0第5问列出的每处聚合代码全改 split 后聚合，一处不漏）：
  - server.py /api/trace 知识树 agg：原 `SELECT topic,... GROUP BY topic` 改为逐行取 topic 拆 ; 后按每个 tag 计数（active/refined/reviewing）。
  - subject_summary 的 seen/refined 按 topic 节点计数 → 多标签题算进每个标签，计数总和会大于题目总数（预期行为，界面文案已写明"按标签计"）。
  - /api/library 的 topic_label LIKE 筛选为子串匹配，天然兼容多值，无需改。
- 知识点计数总和 > 题目总数是预期，界面用 imgCount/topicCount 模板注明"按标签计"。

### 3. 热力图明细（Task 3）
- 主交互是点击展开（手机无悬停，桌面 hover 非主路径）。
- 点开显示当天具体动作：学科、知识点名、时间 HH:MM、来源、录入或重做；条数多时最多 8 条，末尾补一行"共 X 条"。
- 数据走新接口 GET /api/trace/day?date=YYYY-MM-DD 按需取当日明细，不在页面加载时把全年数据一次性塞进前端。
- 热力图是 DOM 方块（非 canvas），跳过 DPR 重绘并说明。

### 4. 足迹分页（Task 4）
- 每页 5 行，按时间倒序，录入和重做各占一行（不合并同一道题的录入行和重做行）。
- 翻页按钮固定在列表底部，显示"第 x / y 页"，不做无限滚动、不做懒加载。
- /api/trace 已返回当日全部行（today_list 为数组，单日行数≤数百），选前端切片分页（非服务端 limit/offset）——因单日数据量级小，前端切分即可。

## 六、多值兼容实现要点
- 新增前端 helper：splitMulti(s)（拆 ; 去空白过滤空）、joinMulti(arr)（join ; 存库）、capArr(arr,n)（限长）、renderImageStack(container,joinedPath)（堆叠展示）。
- entryImg 由 {q:'',a:''} 改 {q:[],a:[]}（数组）；selTopic 改 selTopics 数组。
- 后端 /api/problem 创建/更新天然 verbatim 存储多值（不做拆分），校验仅判非空。
- /api/trace 的 today_list 与 /api/trace/day 都新增了 subject 字段供分页/明细显示。

## 七、调度逻辑（未变，仅复核）
- schedule.py apply_result（L16-49）：again 减 ease 0.2 清 interval/streak；hard 减 0.15 乘 1.2 下限 1 streak+1；good 加 0.1 streak+1 分段（streak1→itv=1, streak2→itv=3, 否则 itv*=ease）；ease 夹 [1.3,3.0]、interval 夹 [0,60]；炼化判定 streak>=3 and itv>=14 → state=refined
- 字面量：hard 乘数 1.2；QUEUE_CAP=15、REBOUND_CAP=20；反噬散射 due_date=today_days+randint(2,5)
- 字段类型：interval_days REAL（保持浮点，不取整）、due_date TEXT（YYY-MM-DD）、ease REAL、streak INTEGER、state TEXT
- ⚠️ 禁止清单（本轮复核确认遵守）：不改 ease 递增规则/hard 1.2 系数/REBOUND_CAP 2-5天散射/interval_days REAL 类型；floor 只出现在 i2d 入口；不写历史数据迁移脚本；不改 v1.1 判定→讲解→自评顺序；不加第六个 tab。

## 八、LLM 配置（config.local.json，gitignored）
- text 通道：base_url https://developer.amd.com.cn/radeon/api/v1 + api_key(rc-开头) + model DeepSeek-V4-Flash
- vision 通道：base_url https://open.bigmodel.cn/api/paas/v4 + api_key(uuid.secret 带点号) + model glm-4v-flash
- 运行生效规则：改 config.local.json 无需重启（load_config 每次动态读）；改 web 静态文件无需重启；改 server.py/judge.py/schedule.py 后端代码必须重启 uvicorn
- LLM 调用点：judge.py _llm_equal(text)、server.py classify_image(vision)、explain_answer(vision)、vision_chat(底层封装)
- 降级判定：vision 空→CLASSIFY_FALLBACK(HTTP200)；text 空且vision也空→judged=unknown/reason=llm_unavailable；仅text空vision正常时 explain_answer 覆盖judge verdict（设计非bug）

## 九、数据现状（2026-08-31 实测）
- problem 行数：12（含真实多标签记录 id10/11/12）；attempt 行数：16
- subject 分布：physics 2 / geography 3 / chemistry 4（含id9/10/11/12）/ math 0 等
- 多标签真实记录示例：id10 topic='che-st-table;che-st-comp'、id11、id12（用户 0829 录入）
- problems.jsonl 行数：12+；图片路径引用与磁盘文件一致
- id=1/3 的图片文件历史上丢失，可在错题库编辑表单内重新上传替换

## 十、关键坑（务必遵守）
1. 写中文文件用 Python 原子写 UTF-8 无 BOM；PowerShell here-string 写中文/箭头会被编码破坏，代码字符串全用 ASCII 英文
2. 判断 git 推送成功用 git ls-remote origin master 对比 git rev-parse HEAD，别信 push 输出
3. 文档/代码里绝不写 token（触发 GitHub 秘密扫描拦截推送）
4. 改 server.py 必须重启 uvicorn 才生效；改 config/web 无需重启
5. headless Edge 测真实 tab 必须点击真实 DOM 按钮（renderLibrary 等是 IIFE 闭包私有变量，Runtime.evaluate 全局作用域访问不到）；用全新唯一 user-data-dir 避免 stale Edge；CDP 驱动脚本必须存 .cjs（CommonJS）否则 require 报 ESM 错；headless Edge 启动需要 danger-full-access
6. 改 index.html 的 <script src="/web/app.js?v=..."> 缓存版本号后，浏览器才能加载新前端 JS（否则缓存旧代码看不到新功能）——本轮已从 ?v=20260830 改到 ?v=20260831
7. git checkout -- 某文件会回退该文件全部改动，commit 前务必先 git diff 复核
8. 工具抽风（写入乱码token/长时间重复）时，停下别循环，换方法或先写交接文档；代码全乱时小步写+node --check/py_compile 校验
9. PowerShell $pid 是保留变量，脚本里别用

## 十一、下一步
- 功能已冻结，新想法只写 IDEAS.md
- 运行回归测试：python scripts/test_schedule_e2e.py（端到端4×good，断言 interval 1/3/8.4/24.36 + review偏移0/1/4/12 + 第4次炼化）和 python scripts/test_schedule_sim.py 确认全绿
- 事务完整性：python scripts/check_transaction_integrity.py（本轮新增的检测器，每轮都跑）
- 旧题图片 404：用户确认保留，等用户在错题库编辑表单内手工替换 id=1/3 失效图
- 完整自检：可跑一次干净 clone 按 README 流程，重点验证前端候选UI + 裁剪 + 待分类提交 + 知识树折叠 + 作答讲解 + 错题库编辑/换图链路 + 多图多标签

## 十二、参考文档（均在项目内）
- xinmo\_knowledge\README.md — 知识库索引（首选入口）
- xinmo\SPEC.md — 完整规格 + 决策记录（含调度决策、D4 验收口径"0/1/4/12 指复习日非间隔"）
- xinmo\CHANGELOG.md — 改动历史（D1-D8 + v1.2）
- xinmo\README.md — 启动/手机访问/备份说明
- xinmo\IDEAS.md — 冻结期的新想法
- xinmo\.gitignore — 已排除 config.local.json / data/*.db / data/images/ / data/problems.jsonl / *.log

## 一句话总结当前状态
v1.2 四功能（多图录入、多知识点标签、热力图明细、足迹分页）全部完成并真机验证通过，修复了一个真实调度 bug（i2d float 崩溃致炼化不可达，已 floor 修复）、修正了 id=2 subject 乱码、新增事务完整性检测器与端到端回归测试，git 干净全部推送，config 已恢复。交接文档已写好，接手即续。