# Design Document: UI Icon Refresh

## Overview

This spec adds inline SVG icons to all control buttons in the Tomation browser extension's sidebar panel. Icons provide quick visual identification of button actions while retaining readable text labels, improving the overall UI clarity and consistency.

---

## Architecture

### Icon Implementation (Panel-only)

The icon feature is entirely a Panel concern. Each control button receives an inline `<svg>` element positioned to the left of the button text. No external icon libraries, image files, or icon fonts are used.

---

## Components and Interfaces

### SVG Icon Definitions

Each button icon is a 14×14 inline SVG with:
- `width="14"` and `height="14"`
- `viewBox="0 0 24 24"` (standard icon grid, scaled down)
- `stroke="currentColor"` and `stroke-width="2"`
- `fill="none"` (line icons)
- `aria-hidden="true"`

| Button       | Icon concept          | SVG path description                   |
|--------------|----------------------|----------------------------------------|
| Run          | Play triangle        | Polygon: (6,4) (20,12) (6,20)         |
| Pause        | Two vertical bars    | Two rects: x=6 and x=14, w=4, h=16    |
| Continue     | Play triangle        | Same as Run (resume semantics)         |
| Stop         | Square               | Rect: x=6, y=6, w=12, h=12            |
| Try Again    | Circular arrow       | Arc path with arrowhead                |
| Skip         | Skip-forward bars    | Polygon + vertical bar: ▶| pattern    |

### Button Layout

Icons are positioned to the left of button text with 4px spacing (CSS `margin-right: 4px` on the SVG element).

---

## Data Models

No new data models are introduced. SVG icons are static inline markup within button elements.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do.*

### Property 1: Button Icon SVG Attributes Consistency

*For any* control button that contains an inline SVG icon, the SVG element SHALL have `width="14"`, `height="14"`, a `viewBox` attribute, `aria-hidden="true"`, and its paths/shapes SHALL use `currentColor` for stroke or fill with `stroke-width="2"`.

**Validates: Requirements 1.3, 1.5, 1.6, 1.7**

---

## Error Handling

No error scenarios apply to static SVG icon rendering. Icons are embedded inline and do not depend on external resources or runtime conditions.

---

## Testing Strategy

### Dual Testing Approach

- **Unit tests**: Verify specific examples and edge cases.
- **Property-based tests**: Verify universal properties across all control buttons.

Property-based tests use [**fast-check**](https://github.com/dubzzz/fast-check), already installed in the extension package.

### Property Test Configuration

- Library: `fast-check` (v3.23.2, already in devDependencies)
- Test runner: Node.js built-in `node:test`
- Minimum iterations: 100 per property
- Tag format: `// Feature: ui-icon-refresh, Property 1: Button Icon SVG Attributes Consistency`
- Each property test must implement exactly one correctness property from this document

### Property Test Plan

| Property | Module under test | Generator strategy |
|----------|------------------|--------------------|
| 1: SVG attributes consistency | Panel DOM (via jsdom) | Enumerate all control buttons, verify attributes |

### Unit Test Plan

| Area | Tests |
|------|-------|
| SVG icons | All buttons have icons, correct dimensions, aria-hidden present, currentColor stroke, stroke-width="2" |
