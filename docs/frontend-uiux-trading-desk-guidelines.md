# Longclaw Frontend UI/UX Guidelines

## Product Posture

Longclaw Electron is a personal finance super trading desk. The primary modes stay fixed:

- 策略
- 回测
- 执行
- 微信
- 插件

Do not redesign the product into a generic agent platform, case manager, CRM, or dashboard portal. UI/UX work should make the existing five-mode trading desk clearer, faster, denser, and more native.

## Design Reference

Reference Vibe Island as a design language, not a feature model:

- Native macOS control-surface feel.
- Minimal but strong status expression.
- Dark notched/island surfaces.
- Aurora palette: blue/violet ambient light plus orange-gold action highlights.
- Mono typography for machine/state/count surfaces.
- Motion that feels responsive and physical, not decorative.

## Engineering Rules

All frontend colors, surface roles, state colors, chart colors, shadows, radii, and motion timing must originate from:

- `electron/src/renderer/designSystem.ts`
- `tradingDeskTheme`
- `palette`
- `fontStacks`
- `interaction`

Avoid new hardcoded hex colors in component files. If a new visual role is needed, add it to `tradingDeskTheme` first.

## Global Interaction

Global interaction defaults live in:

- `electron/src/renderer/index.html`

The app must keep:

- `color-scheme: dark`
- visible `:focus-visible` rings
- button hover and active feedback
- `touch-action: manipulation`
- reduced-motion handling
- dark scrollbars
- unified selection color

Never use `transition: all`. List transitioned properties explicitly.

## Typography

Use:

- `fontStacks.ui` for product UI and dense controls.
- `fontStacks.display` for titles, but keep it native and restrained.
- `fontStacks.mono` for market data, codes, paths, counts, runtime state, and machine labels.

Do not add page-local font stacks unless the font role is first added to `designSystem.ts`.

## Layout And Surfaces

The default app surface is dark trading desk, not a light SaaS admin shell.

Use compact panels, clear borders, and stateful surfaces:

- Root: `tradingDeskTheme.colors.root`
- Panels: `panel`, `panelSoft`, `panelRaised`
- Controls: `control`
- Detail/chart regions: `chartPanel`, `chartBorder`
- Active states: `accent`, `accentSoft`, `auroraBlue`

Use cards only for repeated items, modals, or bounded tools. Do not create nested decorative card stacks.

## Market Semantics

Use `tradingDeskTheme.market` for market color semantics:

- `up` is red for China-market convention.
- `down` is green.
- `flat` is neutral.

Use `tradingDeskTheme.chart` for chart overlays, indicator lines, axes, grid, and separators.

## State Model

Every major surface should show state before detail:

- ready
- running
- degraded
- failed
- stale
- fallback
- empty

Status copy must include the next useful action when the state is failed or degraded.

## Validation

Before completing UI/UX work:

- Run `npm run lint`.
- Run `npm run build:electron`.
- Run `npm run electron:observe -- <scenario>`.
- Finalize the observation report when the run is meaningful.

Known non-design blocker as of 2026-04-24: `/api/chart/沪深300?freq=daily` can still return 404. Treat that as a data/index issue, not a UI regression unless the rendered fallback breaks.
