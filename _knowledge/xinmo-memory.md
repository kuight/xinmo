# xinmo（错题心魔）项目记忆归档

> 来源：会话持久记忆（memoir），汇总到 2026-08-30。敏感值（api_key/token 明文）已剔除，只留格式与结论。

## 1. 项目一句话
高三学生错题复习工具：录错题 → 按遗忘曲线排重做 → 一眼看到积累。纯本地 FastAPI+SQLite+原生 JS，不联网不判分（判题靠用户自评或外部 LLM）。功能已冻结，新想法进 IDEAS.md。

## 2. 物理位置与运行
- 仓库根：`E:\work\wendao\wendao-main`（git master）
- 项目目录：`E:\work\wendao\wendao-main\xinmo\`（已迁出为独立 GitHub 仓库 `kuight/xinmo`，main+master 均指向 dbc45fa 之后）
- wendao 仓库：`kuight/wendao`，master 指向 cf2a325（含迁移记录）
- 运行：`cd xinmo && python -m uvicorn server:app --host 0.0.0.0 --port 8092`，浏览器 `http://127.0.0.1:8092`
- Python：`C:\Users\Administrator\AppData\Local\Programs\Python\Python310\python.exe`
- 依赖：fastapi / uvicorn / pillow

## 3. 当前 git 状态（2026-08-30）
- xinmo 本地 HEAD：`0cd3de8`（知识库归档），**领先 origin 10 个 commit 全部已推**
- wendao 本地 master=origin=cf2a325（已同步，无需再 push）
- 工作树干净（已清理所有临时 `_*.py`/`_*.txt`）
- 注意：新 ghp_ token 写进了 wendao 与 xinmo 两个本地仓库的 `.git/config` remote URL（仅本地未入库）

## 4. v1.1 六项任务 + 图片改造（2026-08-30 全部完成）
逐项核对发现交接文档"六项全完成"不准确——**item6 当初未实现**，已补上。六项 + 修复提交序列：
- `3de601a` D7-item4: labels 错因 8 项 + 题型 8 项 + 自定义输入
- `0f1d752` D7-item1a: 后端 vision 识别（/api/classify + /api/reclassify + topics unclassified 占位）
- `a8f685d` D7-item1b: 前端录入重构（候选点选/其他/待分类 + 拍照/相册双入口 + canvas 裁剪）
- `80ec9e1` D7-item2: 卡片显示修正（标题 source>label + note 改"我的批注"行 + 表单可选+摘要预填）
- `7ec3852` D7-item3: 重做讲解（/api/judge 输入题图+答案+解析图调 vision 输出三段）
- `81d9ebb` D7-item5: 统计页柱状图（DPR 缩放 + 12px 轴标签 + 柱顶数值 + 图例加大）
- `cf02c7f` D7-item6: 足迹页知识树按 chapter 折叠（默认收起、自动展开含已遇题目章节、"已遇 n / 共 m"）
- `1c91fcf` D7-fix: tpl 函数未定义 + i18n 缺 stats.errorTitle/dailyTitle 键
- `0de6b0a` D7-fix: /api/judge 500（explain_answer 中 sqlite3.Row 无 .get() 改下标）

## 5. 四条核心调度决策（SPEC 已记录）
①重做按 A=每题每天一次 attempt，提交后即从今日列表消失，streak 累加、again 清零；同一题一天内最多重排一次。
②炼化以算法为准不看"连对三次消失"——ease 2.5 起每次 good+0.1，interval 序列 1/3/8.4/24，第 4 次 good（interval>=14）炼化。
③hard 永不炼化是有意为之（interval 只*1.2 到不了 14）。
④日期模拟直接改 SQLite，生产代码不加 ?simDate 分支。

## 6. D4 数值验收口径（口误修正）
连续四次 good 的实际复习日=0/1/4/12.4（0 录入日），interval 序列=1/3/8.4/24.36。SPEC 验收那句"第1/3/8/12天出现"是**口误**——把 interval 序列误当出现日。**结论：现公式正确不要改**。

## 7. 时间戳改造（D5，用户拍板）
server.py 加 now_iso()（ISO 8601 到秒）；/api/problem 的 created_at 与 /api/attempt 的 ts 存完整时间戳；同天防循环用 substr(ts,1,10) 比日期；due_date 保持纯日期；today_list 排序按完整时间戳倒序。**注意**：D5 测试脚本 add 和 redo 须在同一秒内完成导致时间戳相等、排序退化——测试里 redo 前加 time.sleep(1.1) 区分（非产品 bug）。

## 8. 图片全链路（D2）
POST /api/upload：Pillow 压缩≤1400px/JPEG q82/≤300KB，落盘 data/images/YYYY-MM/，命名 {pid|tmp}_{q|a}_{hash}.jpg。前端双粘贴区(Ctrl+V/拖拽/点击)+lightbox。correct 流程：先 /api/upload 拿 path 再 POST JSON 带 image_path（注意 /api/problem 是 JSON body 非 multipart）。

## 9. 关键接口
- `POST /api/classify` 输入 image_path，输出 {subject, topic_ids, summary}，3 秒超时降级待分类
- `POST /api/reclassify` 批量回填待分类题目
- `POST /api/judge` 输入 problem_id+my_answer，输出 judged + explanation 三段
- `POST /api/attempt` 提交自评结果（again/hard/good）
- `GET /api/trace` today_list + tree + subject_summary + heatmap + streak
- `GET /api/stats` total/refined/active + by_subject + by_error + daily

## 10. 已知未决事项
- 旧题图片 404（数据问题）：id=1/id=3 的图片文件已丢失，无法代码修复，待用户确认删题或不管
- 本地 10 个 commit 已推 GitHub（origin master+main 均到 0cd3de8，2026-08-30 完成）
- 若用户在意，可清掉两仓库 .git/config 里的 ghp_ token（会改为每次 push 手动输凭证）