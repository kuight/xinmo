# 问道修仙学院（v5 游戏）项目记忆归档

> 来源：会话持久记忆（memoir），汇总到 2026-08-30。另一条项目线（游戏开发），与 xinmo 无关。

## 1. 项目一句话
纯前端修仙学习游戏：《问道修仙学院》v5。等距世界 + 知识驱动战斗。仓库 `E:\work\wendao\wendao-main`，远程 `github kuight/wendao`。

## 2. 当前里程碑（2026-08）
- 基线健康：smoke79 / integration / battle-m1 12 / render-canvas 全绿
- S1a（移动+渲染+M1三怪）和 S1b（地牢生成器+掉宝系统）已完成并入库推 master
- 后续：S2 剩余五场馆 MVP 原型 → S3 知识点 bestiary + 题库合并 → S4 美术打磨

## 3. 用户铁律（kuight 2026-08-26 明确）
1. 不要急着写代码，先自己设置约束和任务结构，尽可能细致地设计，时间没关系但质量最重要
2. 每个知识点房间先写精确机制规格（参数/输入/难度层/失败教学）再写代码
3. node fs.writeFileSync 原子写文件；写完必须 node --check + CDP 真机验证通过才推送
4. 认知难点通过游戏机制体现，不是文字教学

## 4. 蓝图（已修订为 Hub-and-Spoke 多场馆融合）
不是"一个地牢+8种战斗"，而是"修仙学院枢纽 + 六个学科场馆"，每科场馆有独立适配的知识类型玩法（物理=即时地牢/化学=炼金合成+卡牌/数学=塔防+轨迹谜题/地理=探索建造/语文=符文拼写+碑文解谜/英语=词汇对决+拼写连击），共享修为池和存档。五大统一原则（视觉/操作/反馈/数值/世界合理性）。

## 5. 元气骑士是权威参照
必须吃透机制再写代码，不能凭印象猜。已确认核心机制：
1. 摄像机房间锁定（snap 到房间中心，一个屏幕=一个房间）
2. 门板关门挡住通行（物理碰撞而非仅视觉）
3. 房间是独立竞技场（四周墙壁+走廊门连接）
4. 战斗进房才触发（进门关门→清怪开门）
5. Boss 房比普通房大

未学透就写的结果：初版 demo 连续三次被打回（空白页→不像元气骑士→BOSS 房 bug+门挡不住+相机不对）。

## 6. 引擎架构设计
渲染双模式（setMode iso/grid）、战斗拆为 8 个可插拔演法子模块（melee/ranged/rhythm/puzzle/text/dodge/stealth/boss）、content/subjects/*.json 扩展 kind+params 实现知识点→怪物自动映射、场馆统一为 boot.venue 体系、学习→游戏反馈闭环（recordAnswer→proficiency→自适应难度）。

## 7. 知识房间 Demo（已实现）
- gravity-room.html（超重失重战斗房）：重写为 IIFE 包裹 + innerWidth||800 兜底修空白页；移除全局 const（用 var 避免 TDZ）。CDP 验证通过
- arrow-tower.html
- redox-room.html（化学氧化还原·画线传导电子）：纯 ASCII 干净版（4826 字节），L1-L4 难度、失败教学、CDP 验证 Canvas 500px 无错误。commit b2f033d
- gravity-demon-room.html（物理·超重失重战斗房）：L1-L3 重力翻转难度，CDP 待验证

## 8. git 双分支坑（关键）
GitHub 默认分支是 `main`（旧 v5.0.0 导入，08-21），所有新工作都在 `master`，两分支历史完全无关。用户看 GitHub 显示 main 旧内容——"commit 几天前"是看错分支。需去 Settings→General→Default branch 改 main→master。

## 9. 工具教训
- write 工具会往代码文件注入垃圾 token，生成代码必须用 PowerShell here-string，改后跑 node --check 验证
- edit 工具偶尔也污染文件（行尾垃圾 token）
- PowerShell here-string 中文/箭头会编码乱码破坏 JS → 代码字符串全用 ASCII 英文
- PowerShell Add-Content 会静默失败（truncated），用 node fs.writeFileSync 一次性原子写入
- stale Edge 实例导致 Canvas 0（误判渲染 bug）——每次重启 Edge 到新端口再 CDP 验证