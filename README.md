# 隆小虾 Agent OS

AI 时代的 Wind/同花顺 — 金融业务 Agent 桌面应用。

基于 [Open Agent SDK](https://github.com/shipany-ai/open-agent-sdk) fork，Electron + React + TypeScript。

## 特性

- Electron 桌面应用，Claude Desktop App 风格 UI（暖色调）
- 双模式 agent backend：ACP（连接 CC CLI）+ SDK（直连 API）
- 59 个内置工具（文件读写/编辑/Bash/Glob/Grep/WebSearch 等）
- MCP 原生支持（Signals 缠论分析 / aippt PPT 生成 / 尽调工具）
- Skills 系统（自动发现 `.claude/skills/` 下的技能）
- 流式输出 + Markdown 渲染 + 代码语法高亮
- 多入口：桌面端 / 微信（weclaw）/ 语音（Chanless）

## 架构定位

`longclaw-agent-os` 的目标是继续演化为完整桌面 agent 产品，但不重新实现微信桥接语义。

- `weclaw`：微信桥接核心，负责消息语义、媒体规范化、语音 transcript-first、session/media facts、archive tool contract。
- `agent-os runtime`：负责 install、guardian、scheduler、launchd、策略注入、健康检查。
- `agent-os product`：负责 GUI、workspace 管理、任务中心、调试面板、通知与产品体验。

这让 `Gemini-Nick/weclaw` 继续保持对上游 `fastclaw-ai/weclaw` 的可继承性，同时让 `longclaw-agent-os` 逐步向 `workany` 风格桌面产品演进。

## 快速开始

```bash
git clone https://github.com/Gemini-Nick/longxiaoxia-agent-os.git
cd longxiaoxia-agent-os
npm install
npm run build
npm run electron:start
```

环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `ANTHROPIC_API_KEY` | Anthropic API 密钥 | — |
| `AGENT_MODE` | agent 模式 | `acp` |
| `AGENT_CWD` | agent 工作目录 | `$HOME` |

## 项目结构

```
src/          # OAS 核心（尽量不改，保持上游同步）
electron/     # Electron 入口 & 主进程
mcp-servers/  # Python MCP 服务（缠论、PPT、尽调等）
apps/runtime/ # weclaw guardian v2 runtime（launchd + guardian core）
scripts/guardian/ # 迁移、验证、退役脚本
```

## Runtime 重构（Guardian v2）

旧的 `weclaw/watchdog/guardian` 心跳循环已迁移到统一控制面方案：

- `weclaw-guardian`：统一监控与重启控制（Go 核心）
- `weguard`：guardian 运维命令入口（`status/restart/monitor`）
- `codex` / `claude` / `weclaw` / `repo-scheduler`：独立 launchd 服务
- `weclaw` 保留给 fastclaw 微信桥，不再由 guardian 覆盖
- runtime 只向 `~/.weclaw/config.json` 注入策略，不接管微信消息语义

常用命令：

```bash
npm run guardian:inventory
npm run guardian:build
npm run guardian:install
npm run guardian:verify
npm run guardian:retire
```

## 单包安装边界

这套后台服务产品化后，建议按两层打包：

- 产品层：`apps/runtime/` + `scripts/guardian/`
- 内核层：`weclaw-real`

目标是让另一台 Mac 只执行一次安装入口，例如：

```bash
bash install.sh
```

安装包内部负责：

- 安装 `weclaw-real`
- 安装 runtime
- 写入 `LaunchAgents`
- 启动 `guardian/codex/claude/weclaw/repo-scheduler`

首次仍需用户手工执行：

```bash
~/.weclaw/bin/weclaw login
```

## 上游同步

本项目 fork 自 Open Agent SDK，定期同步上游更新：

```bash
git fetch upstream
git merge upstream/main

另见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，用于约束 `weclaw` 与 `agent-os` 的长期分层边界。
```

## License

MIT
