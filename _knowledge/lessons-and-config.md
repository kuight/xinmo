# 操作教训 + 关键配置归档

> 跨项目通用操作教训与关键配置。**不含任何 token/密钥明文**——只记录字段名、格式、结论，敏感值在各自 config.local.json / .git/config 里。

## 一、LLM 配置（xinmo config.local.json，gitignored）

### text 通道（表达式判等价）
- base_url：`https://developer.amd.com.cn/radeon/api/v1`
- api_key：rc- 开头
- model：DeepSeek-V4-Flash
- probe HTTP 200 可用，表达式判等价可开启

### vision 通道（图片识别/讲解）——最终正确配置
- base_url：`https://open.bigmodel.cn/api/paas/v4`（**不是 /api/v1！**）
- api_key：带点号的 `uuid.secret` 标准格式
- model：`glm-4v-flash`（**小写，无版本后缀**）

### 「HTTP 200 骗局」关键坑
智谱网关把认证失败用 **HTTP 200 + 响应体 `{"code":401...}`** 包装（/api/v1 路径），或 model_access_denied。probe 只看 HTTP 状态码=200 会被骗。**判 LLM 通道可用必须看响应体 code/success 字段和真实模型回答，绝不能只看 HTTP 状态码**。正确端点是 /api/paas/v4（真 200 认证）。

### 运行生效规则
- 改 config.local.json **不需要重启**（vision_chat 每次 load_config() 动态读取）
- 改前端 web/*.js/css/html 静态文件**不需要重启**（浏览器刷新即加载新版）
- **只有改 server.py/judge.py/schedule.py 等后端代码才需要重启 uvicorn**

## 二、编码教训（写中文/代码文件防乱码）

### 写中文文件（可靠方法）
用 PowerShell 单引号 here-string `@'...'@` 存中文到变量，再用 .NET `[IO.File]::WriteAllText($p,$c,(New-Object System.Text.UTF8Encoding($false)))` 写盘，可保 UTF-8 无 BOM、中文不乱。读取验证用 `Get-Content -LiteralPath -Encoding UTF8` + 检查前 3 字节非 BOM(EF BB BF)。
**不要**用 node -e 内联长字符串写代码（单引号嵌套/反引号与 PowerShell 冲突）、不要用 Out-File 默认编码（中文乱码）。

### 写代码文件
用 node fs.writeFileSync 原子写入（纯 ASCII），中文界面文案进 web/i18n.json 单独处理。写完立即 node --check + 验证文件完整性。
**PowerShell here-string 里写中文/箭头(→)会被编码破坏成乱码破坏 JS 引号** → 代码字符串全用 ASCII 英文。

### 工具污染
- write 工具会向代码文件注入垃圾 token → 生成代码用 here-string，改后 node --check
- edit 工具偶尔污染文件（行尾垃圾 token）
- PowerShell Add-Content 静默失败（truncated）→ 用 node fs.writeFileSync 原子写

## 三、git 教训

### 判断推送是否成功
用 `git ls-remote origin master` 对比 `git rev-parse HEAD`，**不要信 push 输出**（exit code 1 可能是正常 progress 输出）。force push 后本地 origin/master 跟踪引用会陈旧，需 git fetch 同步。

### 双分支坑
GitHub 默认分支可能不是工作分支。接手仓库先确认默认分支与目标分支，别假设 master 就是用户看的。

### 文档里绝不写 token
任何文档/代码里写 GitHub token 会触发 GitHub 秘密扫描拦截推送。

### PowerShell push -c 开关坑
`git push -c http.sslBackend=openssl` 在 PowerShell 里 -c 会被误解析为未知开关(exit 129)。改先 `git config http.sslBackend openssl` 再 push。

### 推送验证瞬时错误
git ls-remote 可能遇瞬时 TLS connect error 报 "you cannot call a method on null"（remote 变量为 null 导致 MISMATCH），重试一次即可。

## 四、浏览器验证（CDP）坑

### 用真实浏览器验证渲染
headless Edge + CDP（Chrome DevTools Protocol）驱动，零外部依赖（不装 playwright/puppeteer）。
- 启动：`msedge --headless=new --remote-debugging-port=9335 --remote-allow-origins=* --user-data-dir=<唯一prof> about:blank`
- 需要 `--remote-allow-origins=*` 否则 WebSocket 403
- 用 `--disable-extensions` 避免 darkreader 等扩展干扰
- **用 `Network.setCacheDisabled` 绕过静态文件缓存**（否则测到旧 i18n/app.js）

### IIFE 闭包陷阱
app.js 是 IIFE 包裹，`renderTrace`/`setTab`/`tpl`/`I18N` 都是**闭包私有变量，不在全局作用域**。Runtime.evaluate 直接调用会报 "not defined"。**必须点击真实 DOM 按钮**（按钮 onclick 绑定闭包内函数）才能触发渲染。

### stale Edge 陷阱
headless Edge 多进程 IPC 被受限沙箱禁止（报 mojo platform_channel 拒绝访问）。需 danger-full-access 授权。**每次用全新唯一 user-data-dir 启动，别复用旧实例**（stale Edge 导致 Canvas 0 误判渲染 bug）。

### i18n 键检查
看渲染后的**中文文本**而非字符串中是否含键名（key 名本身也出现在 HTML，`hasKey=True` 不证明渲染成功）。

## 五、xinmo 前端诊断要点
- i18n 缺键 → t() 返回英文键名（检查渲染后 h2/h3 实际文本）
- fetch 成功但页面显示 "load failed" → 渲染函数抛异常被 .catch 吞掉（临时 patch catch 暴露 window.__err 看真实错误）
- sqlite3.Row 无 .get() 方法，只有下标访问 row['col']（explain_answer 曾因此报 500）
- 图片 404 多为数据问题（数据库指向的文件已删），非代码 bug

## 六、Ralph/goal 流程坑
- goal 工具自动延续每轮结束会把目标 disarmed，收到 goal_round 继续时用 update_goal resume 重新武装，max_goal_rounds 设大
- memoir 自动收尾提示会打断工作流，必要时无视它专注干活

## 七、项目工作法（用户偏好，存 USER.md）
- 注重基础框架质量，不接受有 bug 的 demo；引擎/框架扎实可靠、测试全绿再推进
- 交付物必须是能跑的游戏代码/可交互 Demo，不是设计文档或叙事
- 文档只在必要时写（交接/架构设计），重心永远在可运行代码
- 涉及战斗数值平衡/删主体内容/改存档 schema 前停下问用户