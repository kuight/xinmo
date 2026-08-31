# xinmo 交接文档 v3.1（错题库加载失败排查 + 真实根因修复）

日期：2026-09-01

## 一、任务回顾

补语数英知识点（纯数据）已完成（v1.3，commit bf8a56d，已推）。本次聚焦排查用户报告的"错题库加载失败"。

## 二、错题库加载失败——真实根因与修复（v3.1 新增，覆盖 v3 的误判）

> v3 交接文档结论为"前后端都健康、无加载失败"，**该结论错误**。真实浏览器（headless Chrome）复测证明存在一个真实代码 bug。

### 复现现象（headless Chrome CDP 诊断）
用真实 Chrome（修正路径到 LocalAppData + 随机调试端口）点开错题库 tab：
```
错题库 历史错题库 · 可点「编辑」... 全部学科 物理 化学 地理 语文 数学 英语 ... 共 22 题 错题库加载失败
```
筛选下拉正常渲染（6 学科齐全），但卡片区 0 张卡片，且末尾出现"错题库加载失败"。且该错误被 `.catch()` 吞掉——`window.error`/`unhandledrejection` 都捕获不到，必须用 `Promise.prototype.then` 打补丁拦截 `.then` 内抛出的异常才暴露。

### 根因：局部变量 `var t` 遮蔽全局 i18n 翻译函数 `t()`
`web/app.js` 的 `buildLibraryCard()` 里，渲染题图/答案图的 `forEach` 循环：

```js
splitMulti(it.image_path).forEach(function(p){
    var t = imgThumb(p);                                   // 局部 var t 遮蔽函数 t()
    if (it.image_missing) { t.className='thumb missing'; t.title = t('library.brokenImage'); }  // ← 在 <img> 上调用函数
    thumbs.appendChild(t);
});
splitMulti(it.answer_image_path).forEach(function(p){
    var t = imgThumb(p);                                   // 同样遮蔽
    if (it.answer_image_missing) { t.className='thumb missing'; t.title = t('library.brokenImage'); }  // ← 抛错
    thumbs.appendChild(t);
});
```

当某条记录 `image_missing` 或 `answer_image_missing` 为真（存在失效/缺失图片）时，`t('library.brokenImage')` 会在 **`<img>` DOM 节点** 上被当作函数调用，抛 `TypeError: t is not a function`，导致整批卡片渲染中断。

**触发条件**：库中只要存在任一缺失图片即触发。当前数据里 id=26（第一条，`answer_image_missing=true`）第一个就炸。这就是为什么之前一直显示"错题库加载失败"——数据里恰好有坏图。

### 修复
把两个 `forEach` 的局部变量 `t` 改名为 `th`，恢复 `t()` 为对全局翻译函数的引用：

```js
splitMulti(it.image_path).forEach(function(p){
    var th = imgThumb(p);
    if (it.image_missing) { th.className='thumb missing'; th.title = t('library.brokenImage'); }
    thumbs.appendChild(th);
});
splitMulti(it.answer_image_path).forEach(function(p){
    var th = imgThumb(p);
    if (it.answer_image_missing) { th.className='thumb missing'; th.title = t('library.brokenImage'); }
    thumbs.appendChild(th);
});
```

commit：`833e344`

### 修复后验证（headless Chrome CDP 实测）
```
{"cards":22, "thumbs":54, "hasFail":false, "options":["",""]}
```
- 22 张卡片全部渲染，54 张缩略图正常
- `hasFail:false`（"加载失败"消失）
- 卡片内容完整：学科·知识点·错因·题类型·状态·熟练度·间隔·下次日期·批注·编辑按钮

## 三、CDP 诊断脚本修正（scripts/cdp_chrome.cjs）
- Chrome 路径：`C:\Program Files\Google\...`（错）→ `C:\Users\Administrator\AppData\Local\Google\Chrome\Application\chrome.exe`（真）。
- 调试端口：硬编码 9222（易被残留进程占用）→ 用 `net.createServer` 动态申请随机空闲端口。
- 技巧：`.catch()` 会吞掉 `.then` 内异常，排查此类"静默失败"需在渲染前给 `Promise.prototype.then` 打补丁，把 `onFul` 包一层 try/catch 记录到 `window.__throwLog` 再 rethrow，方能拿到真实堆栈。

## 四、关键坑（含 v3 延续）
1. **局部变量遮蔽全局函数是隐蔽 bug**：`forEach` 回调里声明 `var t` 会遮蔽 i18n 的 `t()`，同名遮蔽导致在对象上调用函数报 `TypeError: t is not a function`，且被 `.catch` 静默吞掉。写 DOM 渲染时避免用 `t`/`$` 作循环变量。
2. 改前端 JS 后必须同步更新 `index.html` 的 `app.js?v=` 缓存版本号（本次 20260831→20260901 已由 v3 完成，app.js 后续改动无需再 bump 但换缓存机要）。
3. `git checkout --` 会回退整文件改动，commit 前务必 `git diff --cached` 复核。
4. 中文数据/文档用 Python 原子写 UTF-8 无 BOM；代码文件用 node fs.writeFileSync 原子写入。
5. CDP 诊断脚本必须存 `.cjs`（CommonJS），headless 浏览器用全新唯一 user-data-dir 避免缓存，Chrome 路径按实际安装位置（LocalAppData，非 Program Files），端口用随机空闲端口。
6. 判断 git 推送成功用 `git ls-remote` 对比 `rev-parse HEAD`，别信 push 输出。
7. GitHub 推送需 `-c http.sslBackend=openssl`；github.com:443 间歇性断网属环境问题（`Test-NetConnection github.com 443` 可先测通）。

## 五、仓库状态与下一步
- 本地 master HEAD = `833e344`（本次 app.js 修复 + cdp 脚本修正）。origin/master = `3f2ccd3`（v3 缓存版本号），origin/main = `7a3718e`（v3 交接文档）。本地领先 origin/master 1 个未推 commit。
- 网络恢复后执行：
  ```
  git -c http.sslBackend=openssl push origin master
  git -c http.sslBackend=openssl push origin master:main   # 同步 main 分支
  ```
  再用 `git ls-remote` 对比 `git rev-parse HEAD` 验证两分支对齐（master 与 main 都应到 833e344）。
- 建议：错题库若仍报"加载失败"，优先查数据里是否有 `image_missing`/`answer_image_missing` 为真的记录（`SELECT id,image_missing,answer_image_missing,image_path FROM problem;`），并确认 app.js 版本号已更新（浏览器强刷/无痕）。