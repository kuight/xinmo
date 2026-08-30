# xinmo / 项目知识库（本地归档）

> 本目录集中存放项目的持久记忆、关键配置、操作教训与历史决策，供接手的新 agent 快速掌握上下文。
> 内容来自本项目会话记忆（memoir）与项目历史，均已去敏（不含任何 token/密钥明文）。

## 目录

- `xinmo-memory.md` — 错题心魔（xinmo）项目全部记忆：里程碑、决策、关键坑、运行规则
- `v5-memory.md` — 问道修仙学院（v5 游戏）项目记忆：蓝图、引擎架构、知识房间 Demo、教训
- `lessons-and-config.md` — 跨项目通用操作教训 + 关键配置（LLM 通道、git、编码、CDP 验证）

## 快速定位

| 想找什么 | 去哪个文件 |
|---------|-----------|
| xinmo 当前 git 状态 / 版本 | `xinmo-memory.md` § 当前状态 |
| xinmo vision 通道正确配置 | `lessons-and-config.md` § LLM 配置 |
| 改代码要不要重启服务 | `lessons-and-config.md` § 运行生效规则 |
| 写中文文件怎么防乱码 | `lessons-and-config.md` § 编码教训 |
| 判断 git 推送是否成功 | `lessons-and-config.md` § git 教训 |
| v5 蓝图/引擎架构 | `v5-memory.md` |

> 注：敏感数据（config.local.json 里的 api_key、git remote URL 里的 token）**不写进本目录**，只记录字段名和格式，避免泄露。