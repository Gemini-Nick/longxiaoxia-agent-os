# chan.AI Agent OS Product Boundary

`chan.AI Agent OS` is the public product brand for this repository. The repo name, historical docs, runtime labels, and environment variables may still use `Longclaw` naming for compatibility.

这份仓库当前承担的是 `Client Runtime（端侧）` 参考实现，但在 phase 1 它同时也是 Longclaw 的 `default home`。

换句话说：

- 这里不仅负责设备侧宿主、安装、运行基座和本地恢复。
- 这里还负责 `Home / Runs / Work Items / Packs / Studio` 这套主产品外壳。
- 未来可移植的核心能力仍应逐步抽出为独立的 `Agent Core（云侧）`。

## 当前角色

`longclaw-agent-os` 目前负责：

- 安装：把本地运行时和桥接依赖装到用户设备
- 宿主：承载 `Electron` default home、CLI、本地后台流程
- substrate：提供 `launchd`、guardian、scheduler、运行态恢复
- governance：承载 `runs / evidence / review / work items / delivery`
- capability surface：承载 `Studio` 与可见的 `Capability Substrate`
- policy：向桥接层注入设备侧策略和默认值

它不应被视为最终产品核心的唯一长期归宿，但在当前阶段它确实是用户进入 Longclaw 的主入口。

## 产品原则

这里实现的是：

- `Chat launches, console governs.`

具体意味着：

- `Home` 用来发起任务
- 治理状态最终沉淀到 `Runs / Work Items / Packs`
- `Studio` 只做 curated capabilities，不做开放 marketplace 首页

## 入口

- 安装：`bash install.sh`
- 卸载：`bash uninstall.sh`
- 重新应用当前 repo 到本机 runtime：`bash apply-live.sh`

## 包内结构

- `apps/runtime/`：`Client Runtime（端侧）` 的 runtime 资产，包括 `launchd`、guardian、scheduler、桥接脚本与 runtime 配置
- `scripts/guardian/`：安装、验证、回滚、退役脚本
- `bundle/weclaw-real`：`Interaction Adapter Layer（通道侧）` 中 `weclaw` 的核心二进制，可选

## 当前边界

### This repo owns

- `launchd`、guardian、scheduler、runtime 安装升级卸载
- 本地残留清理和恢复流程
- 设备侧策略注入
- `Electron` default home
- `Home / Runs / Work Items / Packs / Studio`
- 本地治理面与可靠本地通知
- 可见的 `Capability Substrate`

### This repo does not own

- `weclaw` 的微信消息语义和桥接协议
- Hermes 的 canonical `LaunchIntent / Task / Run / Work Item`
- `Signals` 与 `due-diligence-core` 的专业执行细节
- reviewed knowledge 内容本身的判定与语义来源

## 与其他层的关系

- `hermes-agent`：`Agent Core（云侧）`
- `weclaw`：`Interaction Adapter Layer（通道侧）` + remote cowork companion
- `Chanless`：`Interaction Adapter Layer（通道侧）`
- `Signals` / `due-diligence-core`：flagship packs / `Professional Grounds`
- `Obsidian`：`Reviewed Knowledge Plane`

## 首次安装

用户执行一次 `bash install.sh` 即可完成：

- 安装或复用 `weclaw-real`
- 安装本地 runtime
- 注册并启动 `launchd` 服务

如果包内没有 `bundle/weclaw-real`，安装器会按顺序尝试：

- 使用 `WECLAW_REAL_BUNDLE`
- 从 `~/github代码仓库/weclaw` 构建
- 复用已有 `~/.weclaw/bin/weclaw-real`
- 回退到历史 `~/.weclaw/bin/weclaw`

首次仍需手工执行一次：

```bash
~/.weclaw/bin/weclaw login
```

## Extraction Target

未来从这个仓库优先抽出的对象固定为：

- `session`
- `memory`
- `skills`
- `scheduler`

这些能力应逐步离开设备侧宿主，形成可被多端和多通道复用的 `Agent Core（云侧）`。`default home` 仍会保留在这里，但不会继续承担全部核心语义。
