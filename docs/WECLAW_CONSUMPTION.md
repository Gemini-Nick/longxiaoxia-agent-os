# WeClaw Consumption Policy

`longclaw-agent-os` consumes `weclaw` as a verified bridge-core dependency.

## Rules

- Do not track `fastclaw-ai/weclaw` directly from runtime install scripts.
- Do not consume local uncommitted `weclaw` worktrees as stable runtime input.
- Prefer a verified commit or tag from `Gemini-Nick/weclaw`.
- Treat `weclaw-real` as a build artifact, not as the place to evolve runtime policy.

## Release Channels

- Development runtime may point to a verified integration-branch build.
- Stable runtime should point to a verified commit or tag from `Gemini-Nick/weclaw`.

## Installation Metadata

Guardian install should record:

- source type (`bundle`, `repo`, `existing`, `fallback-wrapper`)
- source repository path when built from repo
- source commit when built from repo
- optional verified ref supplied by the operator
- optional release channel

This makes runtime provenance auditable without moving bridge-core logic into `agent-os`.
