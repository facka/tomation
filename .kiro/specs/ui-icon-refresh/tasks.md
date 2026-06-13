# Implementation Plan: UI Icon Refresh

## Overview

This plan adds inline SVG icons to all control buttons in the Tomation browser extension's sidebar panel. Each button receives a 14×14 inline SVG icon positioned to the left of the text label, using consistent attributes for accessibility and visual coherence.

The extension uses ES5-compatible vanilla JavaScript with Node's built-in `node:test` runner and fast-check for property-based testing.

---

## Tasks

- [ ] 1. Implement control button icons
  - [ ] 1.1 Add inline SVG icons to all control buttons in `packages/extension/src/panel.js`
    - Add 14×14 inline SVG icons to: Run (play triangle), Pause (two vertical bars), Continue (play triangle), Stop (square), Try Again (circular arrow), Skip (skip-forward)
    - Each SVG: `width="14"`, `height="14"`, `viewBox="0 0 24 24"`, `aria-hidden="true"`, `stroke="currentColor"`, `stroke-width="2"`, `fill="none"`
    - Position icon left of button text with 4px spacing (CSS margin-right on SVG)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ]* 2. Write property test: Button icon SVG attributes consistency
  - **Property 1: Button Icon SVG Attributes Consistency**
  - Enumerate all control buttons; verify each SVG has `width="14"`, `height="14"`, `viewBox`, `aria-hidden="true"`, `currentColor` stroke, `stroke-width="2"`
  - **Validates: Requirements 1.3, 1.5, 1.6, 1.7**

- [ ] 3. Final checkpoint — icon tests pass
  - Run test suite: `node --test` in `packages/extension/`
  - Verify property test passes with minimum 100 iterations
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP iteration
- Property tests use fast-check (v3.23.2, already in devDependencies) with minimum 100 iterations per property
- Unit tests use Node's built-in `node:test` runner
- DOM-dependent panel tests use jsdom (already in devDependencies)
- The extension uses ES5-compatible vanilla JS — no modern syntax, no bundler
- Icons are embedded inline — no external icon libraries, image files, or icon fonts

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2"] },
    { "id": 2, "tasks": ["3"] }
  ]
}
```
