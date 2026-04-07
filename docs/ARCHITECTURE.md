# Longclaw Agent OS Architecture

`longclaw-agent-os` is the product and runtime shell. It should evolve toward a desktop agent product, while consuming `weclaw` as a bridge-core dependency instead of re-owning WeChat semantics.

## Product Role

- Provide the desktop product surface.
- Orchestrate local agent runtimes and background services.
- Inject environment and policy defaults into bridge/runtime components.
- Own installation, monitoring, scheduling, and recovery flows.

## Layering Model

### 1. Bridge Core

Provided by `weclaw`.

- WeChat message semantics
- Media parsing and normalization
- Transcript-first voice behavior
- Session/media facts
- Archive tool protocol

### 2. Agent Runtime

Owned by `longclaw-agent-os`, with future alignment toward `fastclaw`-style runtime capabilities.

- Agent lifecycle management
- Tool and provider orchestration
- Memory, scheduler, failover, and runtime policies
- Runtime adapters for Codex, Claude, and future engines

### 3. Desktop Product

Owned by `longclaw-agent-os`, evolving toward a `workany`-style desktop product.

- GUI and task center
- Workspace management
- Settings and observability
- Notifications, review panels, and product workflows

## Responsibilities Owned Here

- Install and uninstall flows
- Guardian, scheduler, launchd orchestration
- TLS preflight and process health checks
- Runtime config injection into `~/.weclaw/config.json`
- Formal archive enablement policy
- Obsidian vault discovery and environment defaults
- Desktop-facing control surfaces and UX

## Responsibilities That Must Stay In WeClaw

Do not migrate these into `longclaw-agent-os`:

- `VoiceItem.Text` interpretation rules
- Voice canonicalization behavior
- Media sidecar/session schema
- Obsidian formal note protocol
- Direct mapping from WeChat message items to agent prompts
- Archive tool payload contract

## Integration Boundary With WeClaw

`longclaw-agent-os` should consume `weclaw` through stable interfaces:

- `weclaw-real` binary lifecycle
- `weclaw` CLI entrypoints
- `~/.weclaw/config.json`
- `~/.weclaw` workspace/session/sidecar artifacts

The runtime may set policy values such as:

- default agent
- archive enablement
- formal write policy
- vault paths
- scheduler cadence
- default voice input mode

It should not reimplement WeChat message semantics.
