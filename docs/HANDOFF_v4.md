# xinmo 交接文档 v4（今日页/错题库"加载失败"修复）

日期：2026-09-01
工作目录：E:\work\wendao\wendao-main\xinmo
仓库：kuight/xinmo（本地 master，GitHub master+main 双分支同步）

## 一、基线（当前状态，已复核）

- HEAD = `199f937`（imgThumb 修复提交）
- origin/master = `199f937`（已推送同步）
- origin/main = `199f937`（已推送同步）
- 工作树干净（git status 无改动）
- 最近提交链：199f937(fix today/library) → 5958eff(docs v1.3) → 983ed6d(fix v1.3 录入体验) → 13cd212 → 833e344 → 3f2ccd3 → bf8a56d → 7a3718e

## 二、本轮做的修复（用户报告两个 bug）

用户报告：①今日 tab 显示"加载失败"；②错题库加载失败。

### 根因（两个 bug 同一个）
`web/app.js` 的图片辅助函数 **`imgThumb` 被上一轮坏改写误删**。上一轮我恢复了 `makeImagePicker`/`openCropModal`/`dataURLToBlob` 三个图片函数，但漏掉了第 4 个 `imgThumb`。

`imgThumb` 被 3 处调用（都在运行时执行）：
- `renderImageStack`（第38行）→ 今日卡渲染题图
- `buildLibraryCard` 两处（第861/866行）→ 错题库卡渲染题图/答案图

缺失时抛 `ReferenceError: imgThumb is not defined`，被 `.catch()` 吞掉后渲染"加载失败"，同时崩掉今日页和错题库两个 tab。

### 修复
`web/app.js` 恢复 `imgThumb` 定义（从初始 commit 8c1e993 提取的原始版本）：
```js
function imgThumb(path){var im=el('img','thumb');im.src=path;im.onclick=function(){showLightbox(path);};return im;}
```
位置：插在 `capArr` 函数之后、`renderImageStack` 之前。

### 验证（浏览器 CDP 实测，全绿）
- 今日页：15 行折叠卡 + 进度行 + 状态徽标正常渲染
- 错题库：22 张卡正常渲染
- `Promise.then` 补丁捕获的运行时异常列表为空（零异常）
- `node --check web/app.js` 通过
- CHANGELOG 已记 v1.3.1

## 三、关键诊断方法沉淀（重要，避免再走弯路）

1. **页面报"加载失败"是 `.catch()` 吞掉了渲染异常**。渲染函数 fetch 成功后执行 `renderTodayData`/`buildLibraryCard`，若其中抛 JS 错误，会被 `.catch()` 捕获并显示"加载失败"。所以"加载失败"≠后端问题，多半是前端渲染函数抛异常。

2. **抓被吞的异常**：用 v3.1 的 `Promise.prototype.then` 补丁技术。在页面加载后、触发真实 tab 点击前，patch `Promise.prototype.then` 把 onFul 抛出的 stack 记录到 `window.__throwLog`，再点 tab 触发真实渲染，读 `window.__throwLog` 即拿到被吞的真实错误和堆栈。

3. **IIFE 包裹的脚本（`(function(){...})()`）内部函数不是全局的**。`typeof renderToday` / `renderLibrary` 为 undefined 是正常现象，不能据此判断脚本没执行。要判断脚本是否执行，应看页面渲染效果或 DOM 变化，不能靠 typeof 全局函数。

4. **"脚本没执行"要区分**：`node --check` 通过 + `new Function(src)` 编译通过 = 文件语法合法。若浏览器仍不渲染，是运行时异常，不是解析错误。用 `new Function()` 编译能排除语法层问题。

5. **改完前端必须 bump 缓存版本**：`web/index.html` 里 `<script src="/web/app.js?v=...">` 和 `<link href="/web/style.css?v=...">` 的版本号。当前为 `20260903`。改了 app.js/style.css 后要递增（如 20260904）。

6. **写入工具会注入乱码**（本项目反复踩坑）：`write`/`edit` 可能注入 `Fargo`、`家公司 s2`、`成为了` 等垃圾 token。写大段代码优先用 node fs 原子写盘，改后立即 `node --check` 验证，别手打中文到代码里。

7. **工具输出会被乱码污染**（本项目反复出现）：会话尾部工具返回内容会被追加乱码/变空。读文件用 `read` 工具（可靠），避免用 PowerShell `Out-File`/`cat` 读（GBK 控制台会乱码中文）。判断 git push 成功用 `git rev-parse HEAD` + `git ls-remote origin master/main` 对比，别信 push 输出；github.com:443 间歇性断网，网络断了 `ls-remote` 会报 Connection reset。

## 四、已完成的其他改动（本轮之前，已提交推送）

- v1.3 录入体验修复（commit 983ed6d）：
  - 任务1 知识点搜索框（live 过滤，命中自动展开）
  - 任务2 来源历史下拉（GET /api/sources + datalist）
  - 任务3 六科题型补齐（QTYPES 每科独立 + i18n/labels 全 code label + server.py QUESTION_TYPES 扩展）
  - 任务4 图片不清表单（formVals 持久化，autoClassify 只 refreshTopicArea）
  - 任务5 多图单张移除（.thumb-wrap + .img-x splice）
  - 任务6 今日折叠+滚动（折叠行+进度行+手风琴+置顶）
- CHANGELOG v1.3 + v1.3.1 条目已加

## 五、遗留事项 / 待办

1. **可选的最终复核**：可在真实浏览器再点一遍今日页/错题库，确认渲染正常（上轮已 CDP 确认，若有疑虑可重跑）。诊断脚本参考 scripts/cdp_verify_v13.cjs（已提交入库）。
2. **task6 今日页 rows 疑点**（历史遗留，非本轮引入）：之前有一次 CDP 显示今日页 rows:0 但 /api/today 返回 15 条队列，疑为 CDP 测试时序假象（点击今日后 fetch 未完成即查 DOM）。本轮已确认今日页 15 行正常渲染，此疑点已消除。
3. **图片压缩**（v1.2 以来）：前端 `uploadImage` 直接发 blob，服务端强压缩；此前有"压缩到宽<=1400px"的描述但当前实现是否严格符合未深究，如用户要求可查。

## 六、项目常用命令

- 启动服务：`python -m uvicorn server:app --host 0.0.0.0 --port 8092`（当前常驻 8092）
- 语法校验：`node --check web/app.js`、`python -c "import ast; ast.parse(open('server.py',encoding='utf8').read())"`
- 测试：`python scripts/test_schedule_e2e.py`（调度全绿）、`python scripts/check_transaction_integrity.py`（CLEAN）
- 推送：`git -c http.sslBackend=openssl push origin master` 和 `git -c http.sslBackend=openssl push origin master:main`
- 浏览器验证：CDP 诊断脚本存 scripts/，Chrome 在 `C:\Users\Administrator\AppData\Local\Google\Chrome\Application\chrome.exe`，端口用随机空闲端口