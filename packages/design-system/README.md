# Vibe Design System

Canonical design-system package for the hackathon app.

## Source Layers

- `DESIGN.md`: human and agent-facing specification from styles.refero.design.
- `tokens.json`: machine-readable design-token source.
- `variables.css`: raw project brand custom properties, always prefixed `--vibe-*`.
- `astryx.css`: Astryx token bridge for components.
- `tailwind.css`: Tailwind v4 `@theme` bridge for app layout and brand utilities.
- `CONSUMPTION.md`: boundary rules for Astryx vs Tailwind responsibilities.

## Consumption

Use CSS through package subpath imports:

```css
@import "@vibe/design-system/variables.css";
@import "@vibe/design-system/astryx.css";
@import "@vibe/design-system/tailwind.css";
```

Use `tokens.json` for tools that need the raw token graph.
