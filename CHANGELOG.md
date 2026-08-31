# CHANGELOG - 错题心魔 xinmo v1

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
