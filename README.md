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
```

## 上游同步

本项目 fork 自 Open Agent SDK，定期同步上游更新：

```bash
git fetch upstream
git merge upstream/main
```

## License

MIT
